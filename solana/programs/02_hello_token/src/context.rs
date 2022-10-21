use anchor_lang::{
    prelude::*,
    solana_program::sysvar::{clock, rent},
};
use std::str::FromStr;
use wormhole_anchor_sdk::{token_bridge, wormhole};

use super::{
    constants,
    env::{TOKEN_BRIDGE_ADDRESS, WORMHOLE_ADDRESS},
    error::HelloTokenError,
    state::{Config, Received},
};

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

    #[account(
        executable,
        address = Pubkey::from_str(TOKEN_BRIDGE_ADDRESS).unwrap() @ HelloTokenError::InvalidTokenBridgeProgram
    )]
    /// CHECK: Wormhole Program
    pub token_bridge_program: AccountInfo<'info>,

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

    #[account(
        executable,
        address = Pubkey::from_str(WORMHOLE_ADDRESS).unwrap() @ HelloTokenError::InvalidWormholeProgram
    )]
    /// CHECK: Wormhole Program
    pub wormhole_program: AccountInfo<'info>,

    #[account(
        seeds = [wormhole::SEED_PREFIX_CONFIG.as_ref()],
        bump,
        seeds::program = wormhole_program,
    )]
    /// CHECK: Wormhole Config
    pub wormhole_config: AccountInfo<'info>,

    #[account(
        seeds = [wormhole::SEED_PREFIX_FEE_COLLECTOR.as_ref()],
        bump,
        seeds::program = wormhole_program
    )]
    /// CHECK: Wormhole Config
    /// TODO: add fee collector deserializer?
    pub wormhole_fee_collector: AccountInfo<'info>,

    #[account(
        seeds = [wormhole::SEED_PREFIX_EMITTER.as_ref()],
        bump,
        seeds::program = token_bridge_program
    )]
    /// CHECK: Wormhole Emitter
    pub wormhole_emitter: AccountInfo<'info>,

    #[account(
        seeds = [
            wormhole::SEED_PREFIX_SEQUENCE.as_ref(),
            wormhole_emitter.key().as_ref()
        ],
        bump,
        seeds::program = wormhole_program
    )]
    /// CHECK: Wormhole Emitter Sequence
    pub wormhole_sequence: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
