use anchor_lang::prelude::*;

cfg_if! {
    if #[cfg(feature = "mainnet")] {
        declare_id!("wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb");
    } else if #[cfg(feature = "solana-devnet")] {
        declare_id!("DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe");
    } else if #[cfg(feature = "tilt-devnet")] {
        declare_id!("B6RHG3mfcckmrYN1UhmJzyS1XX3fZKbkeUcpJe9Sy3FE");
    } else if #[cfg(feature = "fogo-devnet")] {
        declare_id!("78HdStBqCMioGii9D8mF3zQaWDqDZBQWTUwjjpdmbJKX");
    }
}

#[derive(Debug, Clone)]
pub struct TokenBridge;

impl Id for TokenBridge {
    fn id() -> Pubkey {
        ID
    }
}
