use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
/// Foreign emitter account data.
pub struct ForeignEmitter {
    /// Emitter chain. Cannot equal `1` (Solana's Chain ID).
    pub chain: u16,
    /// Emitter address. Cannot be zero address.
    pub address: [u8; 32],
}

impl ForeignEmitter {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 2 // chain
        + 32 // address
    ;
    /// AKA `b"foreign_emitter"`.
    pub const SEED_PREFIX: &'static [u8; 15] = b"foreign_emitter";

    /// Convenience method to check whether an address equals the one saved in
    /// this account.
    pub fn verify(&self, address: &[u8; 32]) -> bool {
        *address == self.address
    }
}
