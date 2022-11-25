use anchor_lang::{
    prelude::*,
    solana_program::sysvar::{clock, rent},
};
use wormhole_anchor_sdk::{token_bridge, wormhole};

use super::{
    state::{Config, ForeignContract, TokenBridgeRedeemer, TokenBridgeSender},
    HelloTokenError,
};

#[derive(Accounts)]
/// Context used to initialize program data (i.e. config).
pub struct Initialize<'info> {
    #[account(mut)]
    /// Whoever initializes the config will be the owner of the program.
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [Config::SEED_PREFIX],
        bump,
        space = Config::MAXIMUM_SIZE,

    )]
    /// Config account, which saves program data useful for other instructions.
    /// Also saves the payer of the [`initialize`](crate::initialize) instruction
    /// as the program's owner.
    pub config: Account<'info, Config>,

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
        init,
        payer = owner,
        seeds = [TokenBridgeSender::SEED_PREFIX],
        bump,
        space = TokenBridgeSender::MAXIMUM_SIZE,
    )]
    /// Token Bridge sender.
    pub token_bridge_sender: Account<'info, TokenBridgeSender>,

    #[account(
        init,
        payer = owner,
        seeds = [TokenBridgeRedeemer::SEED_PREFIX],
        bump,
        space = TokenBridgeRedeemer::MAXIMUM_SIZE,
    )]
    /// Token Bridge redeemer.
    pub token_bridge_redeemer: Account<'info, TokenBridgeRedeemer>,

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
        seeds = [Config::SEED_PREFIX],
        bump
    )]
    /// Config account. This program requires that the `owner` specified in the
    /// context equals the pubkey specified in this account. Read-only.
    pub config: Account<'info, Config>,

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
