use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

#[account]
pub struct TokenBridgeSender {
    pub num_transfer_native: u64,
    pub num_transfer_wrapped: u64,
    pub num_transfer_sol: u64,
}

impl TokenBridgeSender {
    pub const MAXIMUM_SIZE: usize = 
      8 // discriminator
    + 8 // num_transfer_native
    + 8 // num_transfer_wrapped
    + 8 // num_transfer_sol
    ;

    pub const SEED_PREFIX: &'static [u8; 6] = token_bridge::SEED_PREFIX_SENDER;
}
