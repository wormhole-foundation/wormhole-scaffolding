use anchor_lang::prelude::*;

#[derive(Debug, Clone)]
pub struct TokenBridge;

pub static ID: Pubkey = wormhole_svm_definitions::TOKEN_BRIDGE_PROGRAM_ID;

impl Id for TokenBridge {
    fn id() -> Pubkey {
        ID
    }
}
