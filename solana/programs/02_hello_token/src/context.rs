use anchor_lang::{
    prelude::*,
    solana_program::sysvar::{clock, rent},
};
use wormhole_anchor_sdk::{token_bridge, wormhole};

use super::{constants, error::HelloTokenError, state::Config};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    /// Whoever initializes the config will be the owner of the program.
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [constants::SEED_PREFIX_CONFIG],
        bump,
        space = Config::MAXIMUM_SIZE,

    )]
    pub config: Account<'info, Config>,

    #[account(executable)]
    pub token_bridge_program: Program<'info, token_bridge::program::TokenBridge>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_CONFIG],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Token Bridge Config
    pub token_bridge_config: AccountInfo<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_AUTHORITY_SIGNER],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Token Bridge Authority Signer (used for transfer approvals)
    pub token_bridge_authority_signer: AccountInfo<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_CUSTODY_SIGNER],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Token Bridge Custody Signer
    pub token_bridge_custody_signer: AccountInfo<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_MINT_SIGNER],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Token Bridge Wrapped Mint Authority
    pub token_bridge_mint_authority: AccountInfo<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_SENDER],
        bump
    )]
    /// CHECK: Token Bridge Sender
    pub token_bridge_sender: AccountInfo<'info>,

    #[account(
        seeds = [token_bridge::SEED_PREFIX_REDEEMER],
        bump
    )]
    /// CHECK: Token Bridge Receiver
    pub token_bridge_redeemer: AccountInfo<'info>,

    #[account(executable)]
    pub wormhole_program: Program<'info, wormhole::program::Wormhole>,

    #[account(
        seeds = [wormhole::BridgeData::SEED_PREFIX],
        bump,
        seeds::program = wormhole_program,
    )]
    /// CHECK: Wormhole Config
    pub wormhole_bridge: Account<'info, wormhole::BridgeData>,

    #[account(
        seeds = [wormhole::FeeCollector::SEED_PREFIX],
        bump,
        seeds::program = wormhole_program
    )]
    pub wormhole_fee_collector: Account<'info, wormhole::FeeCollector>,

    #[account(
        seeds = [wormhole::SEED_PREFIX_EMITTER],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Token Bridge Emitter
    pub token_bridge_emitter: AccountInfo<'info>,

    #[account(
        seeds = [
            wormhole::SequenceTracker::SEED_PREFIX,
            token_bridge_emitter.key().as_ref()
        ],
        bump,
        seeds::program = wormhole_program
    )]
    pub token_bridge_sequence: Account<'info, wormhole::SequenceTracker>,

    #[account(executable)]
    pub system_program: Program<'info, System>,
}
