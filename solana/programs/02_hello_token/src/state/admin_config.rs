use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct AdminConfig {
    /// Program's owner.
    pub owner: Pubkey,
}

impl AdminConfig {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 32 // owner
        
    ;
    /// AKA `b"admin"`.
    pub const SEED_PREFIX: &'static [u8; 5] = b"admin";
}

#[cfg(test)]
pub mod test {
    use super::*;

    #[test]
    fn test_config() -> Result<()> {
        assert_eq!(AdminConfig::MAXIMUM_SIZE, 40, "AdminConfig::MAXIMUM_SIZE wrong value");

        Ok(())
    }
}