use anchor_lang::prelude::*;

pub const MESSAGE_MAX_LENGTH: usize = 1024;

#[account]
#[derive(Default)]
/// Received account.
pub struct Received {
    /// AKA nonce. Should always be zero in this example, but we save it anyway.
    pub batch_id: u32,
    /// Keccak256 hash of verified Wormhole message.
    pub wormhole_message_hash: [u8; 32],
    /// Message from [Message::Hello](crate::message::Message).
    pub message: Vec<u8>,
}

impl Received {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 4 // batch_id
        + 32 // wormhole_message_hash
        + 4 // Vec length
        + MESSAGE_MAX_LENGTH // message
    ;
    /// AKA `b"received"`.
    pub const SEED_PREFIX: &'static [u8; 8] = b"received";
}
