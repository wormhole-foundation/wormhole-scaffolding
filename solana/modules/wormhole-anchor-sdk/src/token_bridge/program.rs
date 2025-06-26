use anchor_lang::prelude::*;

#[derive(Debug, Clone)]
pub struct TokenBridge;

impl Id for TokenBridge {
    fn id() -> Pubkey {
        use std::str::FromStr;
        cfg_if! {
            if #[cfg(feature = "mainnet")] {
                let pubkey = "wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb";
            } else if #[cfg(feature = "solana-devnet")] {
                let pubkey = "DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe";
            } else if #[cfg(feature = "tilt-devnet")] {
                let pubkey = "B6RHG3mfcckmrYN1UhmJzyS1XX3fZKbkeUcpJe9Sy3FE";
            } else if #[cfg(feature = "fogo-devnet")] {
                let pubkey = "78HdStBqCMioGii9D8mF3zQaWDqDZBQWTUwjjpdmbJKX";
            } else if #[cfg(feature = "bridge-address-from-env")]{
                let pubkey = env!("TOKEN_BRIDGE_ADDRESS");
            } else {
                compile_error!("network not specified");
            }
        };
        Pubkey::from_str(pubkey).unwrap()
    }
}
