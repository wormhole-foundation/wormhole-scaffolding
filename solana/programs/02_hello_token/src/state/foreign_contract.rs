use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
/// Foreign emitter account data.
pub struct ForeignContract {
    /// Emitter chain. Cannot equal `1` (Solana's Chain ID).
    pub chain: u16,
    /// Emitter address. Cannot be zero address.
    pub address: [u8; 32],
}

impl ForeignContract {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 2 // chain
        + 32 // address
    ;
    /// AKA `b"foreign_emitter"`.
    pub const SEED_PREFIX: &'static [u8; 16] = b"foreign_contract";

    /// Convenience method to check whether an address equals the one saved in
    /// this account.
    pub fn verify(&self, address: &[u8; 32]) -> bool {
        *address == self.address
    }
}

#[cfg(test)]
pub mod test {
    use super::*;

    #[test]
    fn test_foreign_emitter() -> Result<()> {
        assert!(
            ForeignContract::MAXIMUM_SIZE == 42,
            "ForeignContract::MAXIMUM_SIZE wrong value"
        );

        let chain = 2u16;
        let address = [
            4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8,
            4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8, 4u8, 20u8, 6u8, 9u8,
        ];
        let foreign_contract = ForeignContract { chain, address };
        assert!(
            foreign_contract.verify(&address),
            "foreign_contract.verify(address) failed"
        );

        Ok(())
    }
}
