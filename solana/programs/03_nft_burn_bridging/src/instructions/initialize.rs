use anchor_lang::prelude::*;
use anchor_spl::{
  token::Mint,
  metadata::MetadataAccount as Metadata,
};
use mpl_token_metadata::ID as METADATA_ID;
use crate::instance::Instance;

const METADATA_SEED_PREFIX: &[u8] = mpl_token_metadata::pda::PREFIX.as_bytes();

const fn whitelist_bytes(whitelist_size: u16) -> usize {
  ((whitelist_size+7)/8) as usize
}

#[derive(Accounts)]
#[instruction(whitelist_size: u16)]
pub struct Initialize<'info> {
  #[account(
    init,
    payer = payer,
    space = Instance::BASE_SIZE + whitelist_bytes(whitelist_size),
    seeds = [Instance::SEED_PREFIX.as_ref(), &collection_mint.key().to_bytes()],
    bump,
  )]
  pub instance: Account<'info, Instance>,

  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(mut)]
  pub update_authority: Signer<'info>, //update authority of collection meta is admin of contract

  #[account()]
  pub collection_mint: Account<'info, Mint>,

  #[account(
    //metaplex unnecessarily includes the program id of the metadata program in its PDA seeds...
    seeds = [METADATA_SEED_PREFIX, &METADATA_ID.to_bytes(), &collection_mint.key().to_bytes()],
    bump,
    seeds::program = METADATA_ID,
    has_one = update_authority,
  )]
  pub collection_meta: Account<'info, Metadata>,

  pub system_program: Program<'info, System>,
}

/// whitelist_size = 0 disables whitelisting, otherwise token_id must be < whitelist_size
pub fn initialize(ctx: Context<Initialize>, whitelist_size: u16) -> Result<()> {
  let accs = ctx.accounts;
  let instance = &mut accs.instance;
  
  instance.bump = *ctx.bumps.get("instance").unwrap();
  instance.update_authority = accs.update_authority.key();
  instance.collection_mint = accs.collection_mint.key();
  instance.collection_meta = accs.collection_meta.key();
  instance.delegate = None;
  instance.is_paused = false;
  instance.whitelist_size = whitelist_size;
  instance.whitelist = vec![0; whitelist_bytes(whitelist_size)];

  Ok(())
}

#[cfg(test)]
pub mod test {
  use super::*;

  #[test]
  fn test_whitelist_bytes() -> Result<()> {
    assert_eq!(whitelist_bytes(0), 0);
    assert_eq!(whitelist_bytes(1), 1);
    assert_eq!(whitelist_bytes(7), 1);
    assert_eq!(whitelist_bytes(8), 1);
    assert_eq!(whitelist_bytes(9), 2);
    Ok(())
  }
}