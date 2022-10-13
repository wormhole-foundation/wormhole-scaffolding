use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct ForeignEmitter {
    pub chain: u16,
    pub address: [u8; 32],
}

impl ForeignEmitter {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 2 // chain
        + 32 // address
    ;
}
