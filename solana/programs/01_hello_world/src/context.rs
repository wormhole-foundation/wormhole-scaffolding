use anchor_lang::prelude::*;

use crate::state::Config;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    /// Whoever initializes the config will be the owner of the program.
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        seeds = [b"hello_world.config"],
        bump,
        space = 8 + Config::MAXIMUM_SIZE,

    )]
    pub config: Account<'info, Config>,

    #[account()]
    /// CHECK: Wormhole Program
    /// TODO:
    pub wormhole_program: AccountInfo<'info>,

    #[account(
        seeds = [b"Bridge"],
        bump,
        seeds::program = wormhole_program
    )]
    /// CHECK: Wormhole Config
    /// TODO: add wormhole config deserializer?
    pub wormhole_config: AccountInfo<'info>,

    #[account(
        seeds = [b"fee_collector"],
        bump,
        seeds::program = wormhole_program
    )]
    /// CHECK: Wormhole Config
    /// TODO: add fee collector deserializer?
    pub wormhole_fee_collector: AccountInfo<'info>,

    #[account(
        seeds = [b"emitter"],
        bump
    )]
    /// CHECK: Wormhole Emitter
    pub wormhole_emitter: AccountInfo<'info>,

    #[account(
        seeds = [
            b"Sequence",
            wormhole_emitter.key().as_ref()
        ],
        bump
    )]
    /// CHECK: Wormhole Emitter Sequence
    pub wormhole_sequence: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
