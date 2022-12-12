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

#[cfg(test)]
pub mod test {
    use super::*;
    use std::mem::size_of;

    #[test]
    fn test_foreign_emitter() -> Result<()> {
        assert_eq!(
            ForeignEmitter::MAXIMUM_SIZE,
            size_of::<u64>() + size_of::<u16>() + size_of::<[u8; 32]>()
        );

        let chain = 2u16;
        let address = [
            4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8,
            4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8,
        ];
        let foreign_emitter = ForeignEmitter { chain, address };
        assert!(
            foreign_emitter.verify(&address),
            "foreign_emitter.verify(address) failed"
        );

        Ok(())
    }
}
