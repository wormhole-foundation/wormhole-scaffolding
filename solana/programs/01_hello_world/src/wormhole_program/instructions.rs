use anchor_lang::prelude::*;

use crate::wormhole_program::Finality;

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
    pub batch_id: u32,

    /// Message payload
    pub payload: Vec<u8>,

    /// Commitment Level required for an attestation to be produced
    pub finality: Finality,
}
