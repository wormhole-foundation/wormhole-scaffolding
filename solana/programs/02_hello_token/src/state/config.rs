use anchor_lang::prelude::*;

#[derive(Default, AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct WormholeAddresses {
    /// [BridgeData](wormhole_anchor_sdk::wormhole::BridgeData) address.
    pub bridge: Pubkey,
    /// [FeeCollector](wormhole_anchor_sdk::wormhole::FeeCollector) address.
    pub fee_collector: Pubkey,
}

impl WormholeAddresses {
    pub const LEN: usize =
          32 // config
        + 32 // fee_collector
    ;
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct TokenBridgeAddresses {
    // program pdas
    pub config: Pubkey,
    pub authority_signer: Pubkey,
    pub custody_signer: Pubkey,
    pub mint_authority: Pubkey,
    pub sender: Pubkey,
    pub redeemer: Pubkey,
    pub emitter: Pubkey,
    pub sequence: Pubkey,
    // send/receive bumps
    pub sender_bump: u8,
    pub redeemer_bump: u8,
}

impl TokenBridgeAddresses {
    pub const LEN: usize =
          32 // config
        + 32 // authority_signer
        + 32 // custody_signer
        + 32 // mint_signer
        + 32 // sender
        + 32 // redeemer
        + 32 // token_bridge_emitter
        + 32 // token_bridge_sequence
        + 1 // sender_bump
        + 1 // redeemer_bump
    ;
}

#[account]
#[derive(Default)]
pub struct Config {
    /// Program's owner.
    pub owner: Pubkey,
    /// Token Bridge program's relevant addresses.
    pub token_bridge: TokenBridgeAddresses,
    /// Wormhole program's relevant addresses.
    pub wormhole: WormholeAddresses,

    /// AKA consistency level. u8 representation of Solana's
    /// [Finality](wormhole_anchor_sdk::wormhole::Finality).
    pub finality: u8,
}

impl Config {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 32 // owner
        + TokenBridgeAddresses::LEN
        + WormholeAddresses::LEN
        + 1 // finality
        
    ;
    /// AKA `b"config"`.
    pub const SEED_PREFIX: &'static [u8; 6] = b"config";
}

#[cfg(test)]
pub mod test {
    use super::*;

    #[test]
    fn test_config() -> Result<()> {
        assert_eq!(TokenBridgeAddresses::LEN, 258, "TokenBridgeAddresses::LEN wrong value");
        assert_eq!(WormholeAddresses::LEN, 64, "WormholeAddress::LEN wrong value");
        assert_eq!(Config::MAXIMUM_SIZE, 363, "Config::MAXIMUM_SIZE wrong value");

        Ok(())
    }
}