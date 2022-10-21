use anchor_lang::prelude::*;
use wormhole_anchor_sdk::wormhole;

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

    pub fn verify(&self, wormhole_message: &AccountInfo) -> Result<bool> {
        Ok(wormhole::get_emitter_address(&wormhole_message)? == self.address)
    }
}
