use anchor_lang::{
    prelude::*,
    solana_program::sysvar::{clock, rent},
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use wormhole_anchor_sdk::{token_bridge, wormhole};

use super::{
    state::{ForeignContract, RedeemerConfig, SenderConfig},
    HelloTokenError,
};

/// AKA `b"bridged"`.
pub const SEED_PREFIX_BRIDGED: &[u8; 7] = b"bridged";

#[derive(Accounts)]
/// Context used to initialize program data (i.e. config).
pub struct Initialize<'info> {
    #[account(mut)]
    /// Whoever initializes the config will be the owner of the program.
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [SenderConfig::SEED_PREFIX],
        bump,
        space = SenderConfig::MAXIMUM_SIZE,
    )]
    /// Sender Config account, which saves program data useful for other instructions.
    /// Also saves the payer of the [`initialize`](crate::initialize) instruction
    /// as the program's owner.
    pub sender_config: Account<'info, SenderConfig>,

    #[account(
        init,
        payer = owner,
        seeds = [RedeemerConfig::SEED_PREFIX],
        bump,
        space = RedeemerConfig::MAXIMUM_SIZE,
    )]
    /// Sender Config account, which saves program data useful for other instructions.
    /// Also saves the payer of the [`initialize`](crate::initialize) instruction
    /// as the program's owner.
    pub redeemer_config: Account<'info, RedeemerConfig>,

    /// Wormhole program.
    pub wormhole_program: Program<'info, wormhole::program::Wormhole>,

    /// Token Bridge program.
    pub token_bridge_program: Program<'info, token_bridge::program::TokenBridge>,

    #[account(
        seeds = [token_bridge::Config::SEED_PREFIX],
        bump,
        seeds::program = token_bridge_program,
    )]
    /// CHECK: Token Bridge authority signer. This isn't an account that holds
    /// data; it is purely just a PDA, used as a delegate for transferring
    /// SPL tokens on behalf of a token account.
    pub token_bridge_config: Account<'info, token_bridge::Config>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_AUTHORITY_SIGNER],
        bump,
        seeds::program = token_bridge_program,
    )]
    /// CHECK: Token Bridge authority signer. This isn't an account that holds
    /// data; it is purely just a PDA, used as a delegate for transferring
    /// SPL tokens on behalf of a token account.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_CUSTODY_SIGNER],
        bump,
        seeds::program = token_bridge_program,
    )]
    /// CHECK: Token Bridge custody signer. This isn't an account that holds
    /// data; it is purely just a PDA, used as the owner of the Token Bridge's
    /// custody (token) accounts.
    pub token_bridge_custody_signer: UncheckedAccount<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_MINT_AUTHORITY],
        bump,
        seeds::program = token_bridge_program,
    )]
    /// CHECK: Token Bridge mint authority. This isn't an account that holds
    /// data; it is purely just a PDA, used as the mint authority for Token
    /// Bridge wrapped assets.
    pub token_bridge_mint_authority: UncheckedAccount<'info>,

    #[account(
        seeds = [wormhole::BridgeData::SEED_PREFIX],
        bump,
        seeds::program = wormhole_program,
    )]
    /// Wormhole bridge data account (a.k.a. its config).
    pub wormhole_bridge: Account<'info, wormhole::BridgeData>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_EMITTER],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Token Bridge program's emitter account. This isn't an account
    /// that holds data; it is purely just a PDA, used as a mechanism to emit
    /// Wormhole messages originating from the Token Bridge program.
    pub token_bridge_emitter: UncheckedAccount<'info>,

    #[account(
        seeds = [wormhole::FeeCollector::SEED_PREFIX],
        bump,
        seeds::program = wormhole_program
    )]
    /// Wormhole fee collector account, which requires lamports before the
    /// program can post a message (if there is a fee).
    pub wormhole_fee_collector: Account<'info, wormhole::FeeCollector>,

    #[account(
        seeds = [
            wormhole::SequenceTracker::SEED_PREFIX,
            token_bridge_emitter.key().as_ref()
        ],
        bump,
        seeds::program = wormhole_program
    )]
    /// Token Bridge emitter's sequence account.
    pub token_bridge_sequence: Account<'info, wormhole::SequenceTracker>,

    /// System program.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(chain: u16)]
pub struct RegisterForeignContract<'info> {
    /// Owner of the program set in the [`Config`] account.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        has_one = owner @ HelloTokenError::OwnerOnly,
        seeds = [SenderConfig::SEED_PREFIX],
        bump
    )]
    /// Sender Config account. This program requires that the `owner` specified
    /// in the context equals the pubkey specified in this account. Read-only.
    pub config: Account<'info, SenderConfig>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [
            ForeignContract::SEED_PREFIX,
            &chain.to_le_bytes()[..]
        ],
        bump,
        space = ForeignContract::MAXIMUM_SIZE
    )]
    /// Foreign Contract account. Create this account if an emitter has not been
    /// registered yet for this Wormhole chain ID. If there already is a
    /// contract address saved in this account, overwrite it.
    pub foreign_contract: Account<'info, ForeignContract>,

    /// System program.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    batch_id: u32,
    amount: u64,
    recipient_address: [u8; 32],
    recipient_chain: u16,
)]

pub struct SendNativeTokensWithPayload<'info> {
    /// Payer will pay Wormhole fee to transfer tokens and create temporary
    /// token account.
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [SenderConfig::SEED_PREFIX],
        bump
    )]
    /// Sender Config account. Acts as the Token Bridge sender PDA. Mutable.
    pub config: Box<Account<'info, SenderConfig>>,

    #[account(
        seeds = [
            ForeignContract::SEED_PREFIX,
            &recipient_chain.to_le_bytes()[..]
        ],
        bump,
    )]
    /// Foreign Contract account. Send tokens to this contract.
    pub foreign_contract: Account<'info, ForeignContract>,

    #[account(mut)]
    /// Mint info. This is the SPL token that will be bridged over to the
    /// foreign contract. Mutable.
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = payer,
    )]
    pub from_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        seeds = [
            b"tmp",
            mint.key().as_ref(),
        ],
        bump,
        token::mint = mint,
        token::authority = config,
    )]
    pub tmp_token_account: Box<Account<'info, TokenAccount>>,

    /// Wormhole program.
    pub wormhole_program: Program<'info, wormhole::program::Wormhole>,

    /// Token Bridge program.
    pub token_bridge_program: Program<'info, token_bridge::program::TokenBridge>,

    #[account(
        mut,
        address = config.token_bridge.config @ HelloTokenError::InvalidTokenBridgeConfig
    )]
    /// Token Bridge config. Mutable.
    pub token_bridge_config: Account<'info, token_bridge::Config>,

    #[account(
        mut,
        seeds = [mint.key().as_ref()],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Token Bridge custody. This is the Token Bridge program's token
    /// account that holds this mint's balance. This account needs to be
    /// unchecked because a token account may not have been created for this
    /// mint yet.
    pub token_bridge_custody: UncheckedAccount<'info>,

    #[account(
        address = config.token_bridge.authority_signer @ HelloTokenError::InvalidTokenBridgeAuthoritySigner
    )]
    /// CHECK: Token Bridge authority signer. Read-only.
    pub token_bridge_authority_signer: UncheckedAccount<'info>,

    #[account(
        address = config.token_bridge.custody_signer @ HelloTokenError::InvalidTokenBridgeCustodySigner
    )]
    /// CHECK: Token Bridge custody signer. Read-only.
    pub token_bridge_custody_signer: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.token_bridge.wormhole_bridge @ HelloTokenError::InvalidWormholeBridge,
    )]
    /// Wormhole bridge data. Mutable.
    pub wormhole_bridge: Box<Account<'info, wormhole::BridgeData>>,

    #[account(
        mut,
        seeds = [
            SEED_PREFIX_BRIDGED,
            &token_bridge_sequence.next_value().to_le_bytes()[..]
        ],
        bump,
    )]
    /// CHECK: Wormhole Message. Token Bridge program writes info about the
    /// tokens transferred in this account.
    pub wormhole_message: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.token_bridge.emitter @ HelloTokenError::InvalidTokenBridgeEmitter
    )]
    /// CHECK: Token Bridge emitter. Read-only.
    pub token_bridge_emitter: UncheckedAccount<'info>,

    #[account(
        mut,
        address = config.token_bridge.sequence @ HelloTokenError::InvalidTokenBridgeSequence
    )]
    /// CHECK: Token Bridge sequence. Mutable.
    pub token_bridge_sequence: Account<'info, wormhole::SequenceTracker>,

    #[account(
        mut,
        address = config.token_bridge.wormhole_fee_collector @ HelloTokenError::InvalidWormholeFeeCollector
    )]
    /// Wormhole fee collector. Mutable.
    pub wormhole_fee_collector: Account<'info, wormhole::FeeCollector>,

    /// System program.
    pub system_program: Program<'info, System>,

    /// Token program.
    pub token_program: Program<'info, Token>,

    /// Associated Token program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    #[account(
        address = clock::id() @ HelloTokenError::InvalidSysvar
    )]
    /// CHECK: Clock sysvar (see [`clock::id()`]). Read-only.
    pub clock: UncheckedAccount<'info>,

    #[account(
        address = rent::id() @ HelloTokenError::InvalidSysvar
    )]
    /// CHECK: Rent sysvar (see [`rent::id()`]). Read-only.
    pub rent: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SendWrappedTokensWithPayload<'info> {
    /// System program.
    pub system_program: Program<'info, System>,

    /// Token program.
    pub token_program: Program<'info, Token>,

    /// Associated Token program.
    pub associated_token_program: Program<'info, AssociatedToken>,

    #[account(
        address = clock::id() @ HelloTokenError::InvalidSysvar
    )]
    /// CHECK: Clock sysvar (see [`clock::id()`]). Read-only.
    pub clock: UncheckedAccount<'info>,

    #[account(
        address = rent::id() @ HelloTokenError::InvalidSysvar
    )]
    /// CHECK: Rent sysvar (see [`rent::id()`]). Read-only.
    pub rent: UncheckedAccount<'info>,
}
