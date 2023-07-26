use anchor_lang::prelude::*;
use anchor_spl::{token::Token, metadata::MetadataAccount as Metadata};
use mpl_token_metadata::{
  state::TokenStandard,
  instruction::{BurnArgs, InstructionBuilder, builders::BurnBuilder}
};
use wormhole_anchor_sdk::wormhole;
use crate::{instance::Instance, error::NftBurnBridging};

pub type EvmAddress = [u8; 20];

#[derive(AnchorSerialize)]
struct Message<'a> {
  token_id: [u8; 2],
  evm_recipient: &'a EvmAddress,
}

impl Message<'_> {
  pub const SEED_PREFIX: &'static [u8; 7] = b"message";
}

#[derive(Accounts)]
pub struct BurnAndSend<'info> {
  #[account(
    mut,
    constraint = !instance.is_paused,
    //This is the only account check we have to do ourselves to ensure that the submitted NFT
    // actually belongs to the collection that our instance is associated with and hence that
    // one can only burn NFTs that are actually certified parts of that collection.
    //
    //The metaplex metadata program will take care of all other checks, namely that:
    // * The NFT token is actually associated with the mint.
    // * The mint is actually associated with the master edition.
    // * The mint is actually associated with the metadata.
    // * The metadata is actually a verified part of the collection.
    has_one = collection_meta,
  )]
  pub instance: Account<'info, Instance>,

  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(mut)]
  pub nft_owner: Signer<'info>,

  #[account(mut)]
  /// CHECK: account will be checked by the metaplex metadata program
  pub nft_token: UncheckedAccount<'info>,

  #[account(mut)]
  /// CHECK: account will be checked by the metaplex metadata program
  pub nft_mint: UncheckedAccount<'info>,

  #[account(
    mut,
    constraint = nft_meta.token_standard.is_some() &&
      ( nft_meta.token_standard.unwrap() == TokenStandard::NonFungible ||
        nft_meta.token_standard.unwrap() == TokenStandard::ProgrammableNonFungible) &&
      nft_meta.collection.is_some() &&
      nft_meta.collection.as_ref().unwrap().verified &&
      nft_meta.collection.as_ref().unwrap().key == instance.collection_mint
  )]
  //we need the uri of the nft thus we have to deserialize its metadata
  //we have to box the account as to not exceed max stack offset of 4k
  /// CHECK: account will be checked by the metaplex metadata program
  pub nft_meta: Box<Account<'info, Metadata>>,

  #[account(mut)]
  /// CHECK: account will be checked by the metaplex metadata program
  pub nft_master_edition: UncheckedAccount<'info>,

  #[account(mut)]
  /// CHECK: account will be checked by the metaplex metadata program
  pub collection_meta: UncheckedAccount<'info>,

  #[account(mut)]
  /// CHECK: account will be checked by the metaplex metadata program
  /// This account must be set to the actual token record account for pNFTs.
  /// For normal NFTs it must be set to the same account as the nft_token account.
  /// Metaplex uses the metaplex program id for positional optional accounts, however we can't do
  ///  that because the token record account must be mut and the metaplex program can't be.
  pub token_record: UncheckedAccount<'info>,

  #[account(
    mut,
    seeds = [Message::SEED_PREFIX, &nft_mint.key().to_bytes()],
    bump,
  )]
  /// CHECK: initialized and written to by wormhole core bridge
  pub wormhole_message: UncheckedAccount<'info>,

  #[account(mut)]
  /// CHECK: address will be checked by the wormhole core bridge
  pub wormhole_bridge: Account<'info, wormhole::BridgeData>,

  #[account(mut)]
  /// CHECK: account will be checked by the wormhole core bridge
  pub wormhole_fee_collector: UncheckedAccount<'info>,

  #[account(mut)]
  /// CHECK: account will be checked and maybe initialized by the wormhole core bridge
  pub wormhole_sequence: UncheckedAccount<'info>,

  pub wormhole_program: Program<'info, wormhole::program::Wormhole>,
  pub metadata_program: Program<'info, anchor_spl::metadata::Metadata>,
  pub token_program: Program<'info, Token>,
  pub system_program: Program<'info, System>,

  //not supported as a special Sysvar account by Anchor hence just an unchecked account
  /// CHECK: account will be checked by the metaplex metadata program
  pub sysvar_instructions: UncheckedAccount<'info>, 
  
  //Wormhole was written before these could be requested from the runtime and so it's sadly
  // tech debt that's leaking out to us now (no way to request account infos)
  pub clock: Sysvar<'info, Clock>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn burn_and_send(ctx: Context<BurnAndSend>, evm_recipient: &EvmAddress) -> Result<()> {
  let accs = ctx.accounts;

  // 1. extract the token id from the metadata uri
  let token_id = {
    //assumed uri format: https://our.metadata.url/<token_id>.json
    let uri = &accs.nft_meta.data.uri;
    let start = uri.rfind('/').unwrap() + 1;
    //we can't use `let end = uri.len() - ".json".len();` because the uri is right padded
    let end = uri.find(".json").unwrap();
    uri[start..end].parse().unwrap()
  };

  // 2. if whitelisting is enabled, check if the NFT has been whitelisted
  if accs.instance.whitelist_enabled() && !accs.instance.is_whitelisted(token_id)? {
    return Err(NftBurnBridging::NotYetWhitelisted.into());
  }

  // 3. burn the NFT
  {
    let mut builder = BurnBuilder::new();
    builder
      .authority(*accs.nft_owner.key)
      .collection_metadata(*accs.collection_meta.key)
      .metadata(*accs.nft_meta.to_account_info().key)
      .edition(*accs.nft_master_edition.key)
      .mint(*accs.nft_mint.key)
      .token(*accs.nft_token.key);
    
    //only set the token_record account if we are dealing with a pNFT
    if let Some(TokenStandard::ProgrammableNonFungible) = accs.nft_meta.token_standard {
      builder.token_record(*accs.token_record.key);
    };

    anchor_lang::solana_program::program::invoke(
      &builder.build(BurnArgs::V1{amount: 1}).unwrap().instruction(),
      &accs.to_account_infos()[..],
    )?;
  }

  // 4. if necessary, transfer Wormhole fee to fee collector account
  if accs.wormhole_bridge.fee() > 0 {
    anchor_lang::system_program::transfer(
      CpiContext::new(
        accs.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
          from: accs.payer.to_account_info(),
          to: accs.wormhole_fee_collector.to_account_info(),
        }
      ),
      accs.wormhole_bridge.fee(),
    )?;
  }
  
  // 5. emit the token id and intended evm recipient via wormhole
  let message_bump = ctx.bumps.get("wormhole_message").unwrap();

  wormhole::post_message(
    CpiContext::new_with_signer(
      accs.wormhole_program.to_account_info(),
      wormhole::PostMessage {
        config: accs.wormhole_bridge.to_account_info(),
        message: accs.wormhole_message.to_account_info(),
        emitter: accs.instance.to_account_info(),
        sequence: accs.wormhole_sequence.to_account_info(),
        payer: accs.payer.to_account_info(),
        fee_collector: accs.wormhole_fee_collector.to_account_info(),
        clock: accs.clock.to_account_info(),
        rent: accs.rent.to_account_info(),
        system_program: accs.system_program.to_account_info(),
      },
      &[
        &[
          Instance::SEED_PREFIX,
          &accs.instance.collection_mint.key().to_bytes(),
          &[accs.instance.bump]
        ],
        &[Message::SEED_PREFIX, &accs.nft_mint.key().to_bytes(), &[*message_bump]],
      ],
    ),
    0, //batch_id (unused)
    Message { token_id: token_id.to_be_bytes(), evm_recipient }.try_to_vec()?, //.unwrap(),
    wormhole::Finality::Finalized,
  )?;

  // 6. log token id
  msg!("token id: {}", token_id);

  Ok(())
}

#[cfg(test)]
pub mod test {
  use super::*;

  #[test]
  fn test_message_byteorder() -> Result<()> {
    let token_id = 1u16;
    let evm_recipient: &EvmAddress = &[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19];
    let serialialized = Message {
      token_id: token_id.to_be_bytes(),
      evm_recipient
    }.try_to_vec().unwrap();
    assert_eq!(serialialized.len(), 2+20);
    assert_eq!(serialialized[0], 0u8);
    assert_eq!(serialialized[1], 1u8);
    for i in 0..20 {
      assert_eq!(serialialized[2+i], i as u8);
    }
    Ok(())
  }
}