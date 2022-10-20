use anchor_lang::{prelude::*, solana_program};

use super::Finality;

#[derive(AnchorDeserialize, AnchorSerialize)]
pub enum Instruction {
    Initialize,
    PostMessage,
    PostVAA,
    SetFees,
    TransferFees,
    UpgradeContract,
    UpgradeGuardianSet,
    VerifySignatures,
    PostMessageUnreliable,
}

#[derive(AnchorDeserialize, AnchorSerialize)]
pub struct PostMessageData {
    /// Unique id for this message
    pub message_id: u32,

    /// Message payload
    pub payload: Vec<u8>,

    /// Commitment Level required for an attestation to be produced
    pub finality: Finality,
}

#[derive(Accounts)]
pub struct PostMessage<'info> {
    pub config: AccountInfo<'info>,
    pub message: AccountInfo<'info>,
    pub emitter: AccountInfo<'info>,
    pub sequence: AccountInfo<'info>,
    pub payer: AccountInfo<'info>,
    pub fee_collector: AccountInfo<'info>,
    pub clock: AccountInfo<'info>,
    pub rent: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
}

pub fn post_message<'a, 'b, 'c, 'info>(
    ctx: CpiContext<'a, 'b, 'c, 'info, PostMessage<'info>>,
    message_id: u32,
    payload: Vec<u8>,
    finality: Finality,
) -> Result<()> {
    let ix = solana_program::instruction::Instruction {
        program_id: ctx.program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.config.key(), false),
            AccountMeta::new(ctx.accounts.message.key(), true),
            AccountMeta::new_readonly(ctx.accounts.emitter.key(), true),
            AccountMeta::new(ctx.accounts.sequence.key(), false),
            AccountMeta::new(ctx.accounts.payer.key(), true),
            AccountMeta::new(ctx.accounts.fee_collector.key(), false),
            AccountMeta::new_readonly(ctx.accounts.clock.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rent.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
        data: (
            Instruction::PostMessage,
            PostMessageData {
                message_id,
                payload,
                finality,
            },
        )
            .try_to_vec()?,
    };

    solana_program::program::invoke_signed(
        &ix,
        &ToAccountInfos::to_account_infos(&ctx),
        ctx.signer_seeds,
    )
    .map_err(Into::into)
}
