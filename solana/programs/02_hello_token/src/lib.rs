use anchor_lang::prelude::*;

pub use context::*;
pub use error::*;
pub use message::*;
pub use state::*;

pub mod context;
pub mod error;
pub mod message;
pub mod state;

// WARNING: This should be the pubkey of your program's keypair
declare_id!("GDch61JmJpTo9npwenypnk3KdofmozK1hNaTdbYRkNPb");

#[program]
pub mod hello_token {
    use super::*;
    use wormhole_anchor_sdk::wormhole;

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
        token_bridge.emitter = ctx.accounts.token_bridge_emitter.key();
        token_bridge.sequence = ctx.accounts.token_bridge_sequence.key();

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
            wormhole.bridge = ctx.accounts.wormhole_bridge.key();
            wormhole.fee_collector = ctx.accounts.wormhole_fee_collector.key();
        }

        // Done
        Ok(())
    }

    /// This instruction registers a new foreign contract (from another
    /// network) and saves the emitter information in a ForeignEmitter account.
    /// This instruction is owner-only, meaning that only the owner of the
    /// program (defined in the [Config] account) can add and update foreign
    /// contracts.
    ///
    /// # Arguments
    ///
    /// * `ctx`     - `RegisterForeignContract` context
    /// * `chain`   - Wormhole Chain ID
    /// * `address` - Wormhole Emitter Address
    pub fn register_foreign_contract(
        ctx: Context<RegisterForeignContract>,
        chain: u16,
        address: [u8; 32],
    ) -> Result<()> {
        // Foreign emitter cannot share the same Wormhole Chain ID as the
        // Solana Wormhole program's. And cannot register a zero address.
        require!(
            chain > 0 && chain != wormhole::CHAIN_ID_SOLANA && !address.iter().all(|&x| x == 0),
            HelloTokenError::InvalidForeignContract,
        );

        // Save the emitter info into the ForeignEmitter account.
        let emitter = &mut ctx.accounts.foreign_contract;
        emitter.chain = chain;
        emitter.address = address;

        // Done.
        Ok(())
    }
}
