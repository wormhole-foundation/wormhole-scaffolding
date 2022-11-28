use anchor_lang::prelude::*;
use wormhole_anchor_sdk::token_bridge;

#[derive(Default, AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct InboundTokenBridgeAddresses {
    // program pdas
    pub config: Pubkey,
    pub custody_signer: Pubkey,
    pub mint_authority: Pubkey,
}

impl InboundTokenBridgeAddresses {
    pub const LEN: usize =
          32 // config
        + 32 // custody_signer
        + 32 // mint_authority
    ;
}

#[account]
#[derive(Default)]
pub struct RedeemerConfig {
    /// Program's owner.
    pub owner: Pubkey,
    /// PDA bump.
    pub bump: u8,
    /// Token Bridge program's relevant addresses.
    pub token_bridge: InboundTokenBridgeAddresses,
}

impl RedeemerConfig {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 32 // owner
        + 1 // bump
        + InboundTokenBridgeAddresses::LEN;

    /// AKA `b"redeemer"`.
    pub const SEED_PREFIX: &'static [u8; 8] = token_bridge::SEED_PREFIX_REDEEMER;
}

#[cfg(test)]
pub mod test {
    use super::*;

    #[test]
    fn test_config() -> Result<()> {
        assert_eq!(
            InboundTokenBridgeAddresses::LEN,
            96,
            "InboundTokenBridgeAddresses::LEN wrong value"
        );
        assert_eq!(
            RedeemerConfig::MAXIMUM_SIZE,
            137,
            "RedeemerConfig::MAXIMUM_SIZE wrong value"
        );

        Ok(())
    }
}
