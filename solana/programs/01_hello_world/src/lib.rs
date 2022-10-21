use anchor_lang::prelude::*;

pub use context::*;
pub use error::*;
pub use message::*;
pub use state::*;

pub mod constants;
pub mod context;
pub mod env;
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
        let wormhole = &mut config.wormhole;
        wormhole.program = ctx.accounts.wormhole_program.key();
        wormhole.config = ctx.accounts.wormhole_config.key();
        wormhole.fee_collector = ctx.accounts.wormhole_fee_collector.key();
        wormhole.emitter = ctx.accounts.wormhole_emitter.key();
        wormhole.sequence = ctx.accounts.wormhole_sequence.key();
        wormhole.emitter_bump = *ctx
            .bumps
            .get("wormhole_emitter")
            .ok_or(HelloWorldError::BumpNotFound)?;

        config.message_count = 0;

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

    pub fn send_message(
        ctx: Context<SendMessage>,
        batch_id: u32,
        hello_message: Vec<u8>,
    ) -> Result<()> {
        // Pay Wormhole fee
        {
            let fee = wormhole::get_message_fee(&ctx.accounts.wormhole_config)?;
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
            // format Wormhole payload
            let msg_size = hello_message.len() as u16;
            let mut payload = Vec::with_capacity(
                1 // payload id (u8)
                + 2 // message length (u16)
                + msg_size as usize,
            );
            payload.push(1u8); // payload ID
            payload.extend(msg_size.to_be_bytes());
            payload.extend(&hello_message);

            let config = &ctx.accounts.config;

            wormhole::post_message(
                CpiContext::new_with_signer(
                    ctx.accounts.wormhole_program.to_account_info(),
                    wormhole::PostMessage {
                        config: ctx.accounts.wormhole_config.to_account_info(),
                        message: ctx.accounts.wormhole_message.to_account_info(),
                        emitter: ctx.accounts.wormhole_emitter.to_account_info(),
                        sequence: ctx.accounts.wormhole_sequence.to_account_info(),
                        payer: ctx.accounts.payer.to_account_info(),
                        fee_collector: ctx.accounts.wormhole_fee_collector.to_account_info(),
                        clock: ctx.accounts.clock.to_account_info(),
                        rent: ctx.accounts.rent.to_account_info(),
                        system_program: ctx.accounts.system_program.to_account_info(),
                    },
                    &[
                        &[
                            b"hello_world.wormhole_message",
                            config.message_count.to_le_bytes().as_ref(),
                            &[ctx.bumps["wormhole_message"]],
                        ],
                        &[b"emitter", &[config.wormhole.emitter_bump]],
                    ],
                ),
                batch_id,
                payload,
                wormhole::Finality::Confirmed, // put in config?
            )?;
        }

        // Log the message count in case anyone wanted to parse the logs for it
        msg!("message_count: {}", ctx.accounts.config.message_count);

        // Uptick message count
        ctx.accounts.config.message_count += 1;

        // Done
        Ok(())
    }

    pub fn receive_message(ctx: Context<ReceiveMessage>) -> Result<()> {
        let wormhole_message = &ctx.accounts.wormhole_message;

        // Save batch_id and message payload
        let received = &mut ctx.accounts.received;
        received.batch_id = wormhole::get_batch_id(wormhole_message)?;
        received.message = wormhole::get_message_payload(wormhole_message)?;

        // Done
        Ok(())
    }
}
