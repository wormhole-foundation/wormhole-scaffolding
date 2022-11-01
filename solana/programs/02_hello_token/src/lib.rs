use anchor_lang::prelude::*;

pub use context::*;
pub use error::*;
pub use message::*;
pub use state::*;

pub mod constants;
pub mod context;
pub mod error;
pub mod message;
pub mod state;

// WARNING: This should be the pubkey of your program's keypair
declare_id!("GDch61JmJpTo9npwenypnk3KdofmozK1hNaTdbYRkNPb");

#[program]
pub mod hello_token {
    use super::*;

    /// This instruction can be used to generate your program's config.
    /// And for convenience, we will store Wormhole-related PDAs in the
    /// config so we can verify these accounts with a simple == constraint.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Initialize program config
        let config = &mut ctx.accounts.config;

        // Set the owner of the config (effectively the owner of the program)
        config.owner = ctx.accounts.owner.key();

        // Set Token Bridge related addresses
        let token_bridge = &mut config.token_bridge;
        token_bridge.config = ctx.accounts.token_bridge_config.key();
        token_bridge.authority_signer = ctx.accounts.token_bridge_authority_signer.key();
        token_bridge.custody_signer = ctx.accounts.token_bridge_custody_signer.key();
        token_bridge.mint_authority = ctx.accounts.token_bridge_mint_authority.key();
        token_bridge.sender = ctx.accounts.token_bridge_sender.key();
        token_bridge.redeemer = ctx.accounts.token_bridge_redeemer.key();

        token_bridge.sender_bump = *ctx
            .bumps
            .get("token_bridge_sender")
            .ok_or(HelloTokenError::BumpNotFound)?;
        token_bridge.redeemer_bump = *ctx
            .bumps
            .get("token_bridge_redeemer")
            .ok_or(HelloTokenError::BumpNotFound)?;

        // Set Wormhole related addresses
        {
            let wormhole = &mut config.wormhole;
            wormhole.config = ctx.accounts.wormhole_bridge.key();
            wormhole.fee_collector = ctx.accounts.wormhole_fee_collector.key();
        }

        // Done
        Ok(())
    }
}
