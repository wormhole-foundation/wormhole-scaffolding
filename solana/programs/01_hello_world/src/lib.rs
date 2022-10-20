use anchor_lang::prelude::*;

pub use context::*;
pub use error::*;
pub use message::*;
pub use state::*;

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
    use wormhole_solana_anchor::wormhole_program;

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
            config.wormhole.emitter_bump = *ctx
                .bumps
                .get("wormhole_emitter")
                .ok_or(HelloWorldError::BumpNotFound)?;

            // Save bump
            config.bump = ctx.bumps["config"];
            config.message_count = 0;
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

    pub fn send_message(
        ctx: Context<SendMessage>,
        message_id: u32,
        hello_message: Vec<u8>,
    ) -> Result<()> {
        // Pay Wormhole fee
        {
            let mut buf: &[u8] = &ctx.accounts.wormhole_config.try_borrow_data()?;
            let wormhole_program_data =
                wormhole_program::WormholeProgramData::deserialize(&mut buf)?;
            let fee = wormhole_program_data.config.fee;

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

            wormhole_program::post_message(
                CpiContext::new_with_signer(
                    ctx.accounts.wormhole_program.to_account_info(),
                    wormhole_program::PostMessage {
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
                message_id,
                payload,
                wormhole_program::Finality::Confirmed, // put in config?
            )?;
        }

        // Log the message count in case anyone wanted to parse the logs for it
        msg!("message_count: {}", ctx.accounts.config.message_count);

        // Uptick message count
        ctx.accounts.config.message_count += 1;

        // Done
        Ok(())
    }
}
