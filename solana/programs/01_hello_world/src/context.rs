use anchor_lang::{
    prelude::*,
    solana_program::sysvar::{clock, rent},
};
use std::str::FromStr;
use wormhole_anchor_sdk::wormhole;

use super::{
    constants,
    env::WORMHOLE_ADDRESS,
    error::HelloWorldError,
    state::{Config, ForeignEmitter, Received},
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
        address = Pubkey::from_str(WORMHOLE_ADDRESS).unwrap() @ HelloWorldError::InvalidWormholeProgram
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
        bump
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

#[derive(Accounts)]
#[instruction(chain: u16)]
pub struct RegisterForeignEmitter<'info> {
    /// Owner of the program.
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        has_one = owner @ HelloWorldError::PermissionDenied,
        seeds = [constants::SEED_PREFIX_CONFIG],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = owner,
        seeds = [
            constants::SEED_PREFIX_FOREIGN_EMITTER,
            chain.to_le_bytes().as_ref()
        ],
        bump,
        space = ForeignEmitter::MAXIMUM_SIZE
    )]
    pub foreign_emitter: Account<'info, ForeignEmitter>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(mut)]
    /// Payer will initialize an account that tracks his own message IDs
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [constants::SEED_PREFIX_CONFIG],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        address = config.wormhole.program @ HelloWorldError::InvalidWormholeProgram
    )]
    /// CHECK: Wormhole Program
    pub wormhole_program: AccountInfo<'info>,

    #[account(
        mut,
        address = config.wormhole.config @ HelloWorldError::InvalidWormholeConfig
    )]
    /// CHECK: Wormhole Config
    /// TODO: add wormhole config deserializer?
    pub wormhole_config: AccountInfo<'info>,

    #[account(
        mut,
        address = config.wormhole.fee_collector @ HelloWorldError::InvalidWormholeFeeCollector
    )]
    /// CHECK: Wormhole Config
    /// TODO: add fee collector deserializer?
    pub wormhole_fee_collector: AccountInfo<'info>,

    #[account(
        address = config.wormhole.emitter @ HelloWorldError::InvalidWormholeEmitter
    )]
    /// CHECK: Wormhole Emitter
    pub wormhole_emitter: AccountInfo<'info>,

    #[account(
        mut,
        address = config.wormhole.sequence @ HelloWorldError::InvalidWormholeSequence
    )]
    /// CHECK: Wormhole Emitter Sequence
    pub wormhole_sequence: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            constants::SEED_PREFIX_MESSAGE,
            config.message_count.to_le_bytes().as_ref()
        ],
        bump,
    )]
    /// CHECK: Wormhole Message
    pub wormhole_message: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    #[account(
        address = clock::id() @ HelloWorldError::InvalidSystemProgram
    )]
    /// CHECK: Clock
    pub clock: AccountInfo<'info>,

    #[account(
        address = rent::id() @ HelloWorldError::InvalidSystemProgram
    )]
    /// CHECK: Rent
    pub rent: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ReceiveMessage<'info> {
    #[account(mut)]
    /// Payer will initialize an account that tracks his own message IDs
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [constants::SEED_PREFIX_CONFIG],
        bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        address = config.wormhole.program @ HelloWorldError::InvalidWormholeProgram
    )]
    /// CHECK: Wormhole Program
    pub wormhole_program: AccountInfo<'info>,

    #[account(
        owner = wormhole_program.key()
    )]
    /// CHECK: Posted Wormhole Message
    pub wormhole_message: AccountInfo<'info>,

    #[account(
        seeds = [
            constants::SEED_PREFIX_FOREIGN_EMITTER,
            wormhole::get_emitter_chain(&wormhole_message)?.to_le_bytes().as_ref()
        ],
        bump,
        constraint = foreign_emitter.verify(&wormhole_message)? @ HelloWorldError::InvalidForeignEmitter
    )]
    pub foreign_emitter: Account<'info, ForeignEmitter>,

    #[account(
        init,
        payer = payer,
        seeds = [
            constants::SEED_PREFIX_RECEIVED,
            wormhole::get_sequence(&wormhole_message)?.to_le_bytes().as_ref()
        ],
        bump,
        space = Received::MAXIMUM_SIZE
    )]
    pub received: Account<'info, Received>,
    pub system_program: Program<'info, System>,
}
