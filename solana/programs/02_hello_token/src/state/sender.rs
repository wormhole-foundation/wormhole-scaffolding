use anchor_lang::prelude::*;

#[account]
pub struct Sender {
    pub num_transfers: u64,
}

impl Sender {
    pub const MAXIMUM_SIZE: usize = 
      8 // discriminator
    + 8 // num_transfers
    ;
    pub const SEED_PREFIX: [u8; 6] = b"sender";
}
