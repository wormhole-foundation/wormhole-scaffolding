use anchor_lang::prelude::*;

#[derive(Debug, Clone)]
pub struct Wormhole;

impl Id for Wormhole {
    fn id() -> Pubkey {
        use std::str::FromStr;
        cfg_if! {
            if #[cfg(feature = "mainnet")] {
                let pubkey = "worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth";
            } else if #[cfg(feature = "solana-devnet")] {
                let pubkey = "3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5";
            } else if #[cfg(feature = "tilt-devnet")]{
                let pubkey = "Bridge1p5gheXUvJ6jGWGeCsgPKgnE3YgdGKRVCMY9o";
            } else if #[cfg(feature = "fogo-testnet")] {
                let pubkey = "BhnQyKoQQgpuRTRo6D8Emz93PvXCYfVgHhnrR4T3qhw4";
            } else if #[cfg(feature = "bridge-address-from-env")]{
                let pubkey = env!("BRIDGE_ADDRESS");
            } else {
                compile_error!("network not specified");
            }
        };
        Pubkey::from_str(pubkey).unwrap()
    }
}
