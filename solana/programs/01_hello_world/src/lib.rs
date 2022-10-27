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
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod hello_world {
    use super::*;
    use anchor_lang::solana_program;
    use wormhole_anchor_sdk::wormhole;

    /// This instruction can be used to generate your program's config.
    /// And for convenience, we will store Wormhole-related PDAs in the
    /// config so we can verify these accounts with a simple == constraint.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // Initialize program config
        let config = &mut ctx.accounts.config;

        // Set the owner of the config (effectively the owner of the program)
        config.owner = ctx.accounts.owner.key();

        // Set Wormhole related addresses
        {
            let wormhole = &mut config.wormhole;
            wormhole.bridge = ctx.accounts.wormhole_bridge.key();
            wormhole.fee_collector = ctx.accounts.wormhole_fee_collector.key();
            wormhole.sequence = ctx.accounts.wormhole_sequence.key();
        }

        config.batch_id = 0; // no batching
        config.finality = wormhole::Finality::Confirmed as u8;

        // Initialize our wormhole emitter account
        ctx.accounts.wormhole_emitter.bump = *ctx
            .bumps
            .get("wormhole_emitter")
            .ok_or(HelloWorldError::BumpNotFound)?;

        {
            let fee = ctx.accounts.wormhole_bridge.fee();
            if fee > 0 {
                solana_program::program::invoke(
                    &solana_program::system_instruction::transfer(
                        &ctx.accounts.owner.key(),
                        &ctx.accounts.wormhole_fee_collector.key(),
                        fee,
                    ),
                    &ctx.accounts.to_account_infos(),
                )?;
            }
        };

        // Send Wormhole message (basically to initialize the Sequence account)
        // so it can be deserialized when send_message is called.
        {
            let wormhole_emitter = &ctx.accounts.wormhole_emitter;
            let config = &ctx.accounts.config;

            wormhole::post_message(
                CpiContext::new_with_signer(
                    ctx.accounts.wormhole_program.to_account_info(),
                    wormhole::PostMessage {
                        config: ctx.accounts.wormhole_bridge.to_account_info(),
                        message: ctx.accounts.wormhole_message.to_account_info(),
                        emitter: wormhole_emitter.to_account_info(),
                        sequence: ctx.accounts.wormhole_sequence.to_account_info(),
                        payer: ctx.accounts.owner.to_account_info(),
                        fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                        clock: ctx.accounts.clock.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                    &[
                        &[
                            constants::SEED_PREFIX_SENT,
                            &wormhole::INITIAL_SEQUENCE.to_le_bytes()[..],
                            &[*ctx
                                .bumps
                                .get("wormhole_message")
                                .ok_or(HelloWorldError::BumpNotFound)?],
                        ],
                        &[wormhole::SEED_PREFIX_EMITTER, &[wormhole_emitter.bump]],
                    ],
                ),
                config.batch_id,
                ctx.program_id.try_to_vec()?,
                config.finality.into(),
            )?;
        }

        // Done
        Ok(())
    }

    pub fn register_foreign_emitter(
        ctx: Context<RegisterForeignEmitter>,
        chain: u16,
        address: [u8; 32],
    ) -> Result<()> {
        // Foreign emitter cannot be zero address
        require!(
            !address.iter().all(|&x| x == 0),
            HelloWorldError::InvalidForeignEmitter,
        );

        // Save emitter
        {
            let emitter = &mut ctx.accounts.foreign_emitter;
            emitter.chain = chain;
            emitter.address = address;
        }

        // Done
        Ok(())
    }

    pub fn send_message(ctx: Context<SendMessage>, hello_message: Vec<u8>) -> Result<()> {
        // Pay Wormhole fee
        {
            let fee = ctx.accounts.wormhole_bridge.fee();
            if fee > 0 {
                solana_program::program::invoke(
                    &solana_program::system_instruction::transfer(
                        &ctx.accounts.payer.key(),
                        &ctx.accounts.wormhole_fee_collector.key(),
                        fee,
                    ),
                    &ctx.accounts.to_account_infos(),
                )?;
            }
        };

        // Send Wormhole message
        {
            // Format Wormhole payload
            let mut payload: Vec<u8> = Vec::new();
            Message::serialize(
                &Message::Hello {
                    message: hello_message,
                },
                &mut payload,
            )?;

            let wormhole_emitter = &ctx.accounts.wormhole_emitter;
            let config = &ctx.accounts.config;

            // Post Wormhole message
            wormhole::post_message(
                CpiContext::new_with_signer(
                    ctx.accounts.wormhole_program.to_account_info(),
                    wormhole::PostMessage {
                        config: ctx.accounts.wormhole_bridge.to_account_info(),
                        message: ctx.accounts.wormhole_message.to_account_info(),
                        emitter: wormhole_emitter.to_account_info(),
                        sequence: ctx.accounts.wormhole_sequence.to_account_info(),
                        payer: ctx.accounts.payer.to_account_info(),
                        fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                        clock: ctx.accounts.clock.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                    &[
                        &[
                            constants::SEED_PREFIX_SENT,
                            &ctx.accounts.wormhole_sequence.next_value().to_le_bytes()[..],
                            &[*ctx
                                .bumps
                                .get("wormhole_message")
                                .ok_or(HelloWorldError::BumpNotFound)?],
                        ],
                        &[wormhole::SEED_PREFIX_EMITTER, &[wormhole_emitter.bump]],
                    ],
                ),
                config.batch_id,
                payload,
                config.finality.into(),
            )?;
        }

        // Done
        Ok(())
    }

    pub fn receive_message(ctx: Context<ReceiveMessage>, _vaa_hash: [u8; 32]) -> Result<()> {
        let posted_message_data = &ctx.accounts.posted.message_data;

        let deserialized = Message::deserialize(&mut &posted_message_data.payload[..])
            .map_err(|_| HelloWorldError::InvalidMessage)?;
        match deserialized {
            Message::Hello { message } => {
                // Save batch_id and message payload
                let received = &mut ctx.accounts.received;
                received.batch_id = posted_message_data.batch_id;
                received.message = message;
            }
        }

        // Done
        Ok(())
    }
}
