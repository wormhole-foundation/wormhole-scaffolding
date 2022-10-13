use anchor_lang::{prelude::*, solana_program};

pub use context::*;
pub use error::*;
pub use state::*;

pub mod context;
pub mod env;
pub mod error;
pub mod state;
pub mod wormhole_program;

// WARNING: This should be the pubkey of your program's keypair
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod hello_world {
    use super::*;
    use solana_program::{
        program::{invoke, invoke_signed},
        system_instruction,
    };

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

    pub fn send_message(ctx: Context<SendMessage>, batch_id: u32, payload: Vec<u8>) -> Result<()> {
        // Pay Wormhole fee
        {
            let mut buf: &[u8] = &ctx.accounts.wormhole_config.try_borrow_data()?;
            let wormhole_program_data =
                wormhole_program::WormholeProgramData::deserialize(&mut buf)?;
            let fee = wormhole_program_data.config.fee;

            if fee > 0 {
                invoke(
                    &system_instruction::transfer(
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
            let config = &ctx.accounts.config;
            invoke_signed(
                &solana_program::instruction::Instruction {
                    program_id: ctx.accounts.wormhole_program.key(),
                    accounts: vec![
                        AccountMeta::new(ctx.accounts.wormhole_config.key(), false),
                        AccountMeta::new(ctx.accounts.wormhole_message.key(), true),
                        AccountMeta::new_readonly(ctx.accounts.wormhole_emitter.key(), true),
                        AccountMeta::new(ctx.accounts.wormhole_sequence.key(), false),
                        AccountMeta::new(ctx.accounts.payer.key(), true),
                        AccountMeta::new(ctx.accounts.wormhole_fee_collector.key(), false),
                        AccountMeta::new_readonly(ctx.accounts.clock.key(), false),
                        AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
                        AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                    ],
                    data: (
                        wormhole_program::Instruction::PostMessage,
                        wormhole_program::PostMessageData {
                            batch_id,
                            payload,
                            finality: wormhole_program::Finality::Confirmed, // put in config?
                        },
                    )
                        .try_to_vec()?,
                },
                &ctx.accounts.to_account_infos(),
                &[
                    &[
                        b"hello_world.wormhole_message",
                        config.message_count.to_le_bytes().as_ref(),
                        &[ctx.bumps["wormhole_message"]],
                    ],
                    &[b"emitter", &[config.wormhole.emitter_bump]],
                ],
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
