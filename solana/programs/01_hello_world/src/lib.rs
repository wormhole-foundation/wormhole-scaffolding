use anchor_lang::prelude::*;

pub use context::*;
pub use error::*;
pub use state::*;

pub mod context;
pub mod error;
pub mod state;

// WARNING: This should be the pubkey of your program's keypair
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod hello_world {
    use super::*;

    /// This instruction can be used to generate your program's config.
    /// And for convenience, we will store Wormhole-related PDAs in the
    /// config so we can verify these accounts with a simple == constraint.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        require!(
            ctx.accounts.config.owner == Pubkey::default(),
            HelloWorldError::AlreadyInitialized
        );

        // Initialize program config
        {
            let config = &mut ctx.accounts.config;

            // Set the owner of the config (effectively the owner of the program)
            config.owner = ctx.accounts.owner.key();

            // Set Wormhole related addresses
            config.wormhole.program = ctx.accounts.wormhole_program.key();
            config.wormhole.config = ctx.accounts.wormhole_config.key();
            config.wormhole.fee_collector = ctx.accounts.wormhole_fee_collector.key();
            config.wormhole.emitter = ctx.accounts.wormhole_emitter.key();
            config.wormhole.sequence = ctx.accounts.wormhole_sequence.key();
        }

        // Done
        Ok(())
    }
}
