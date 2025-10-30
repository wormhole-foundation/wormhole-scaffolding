use anchor_lang::prelude::*;

#[derive(Debug, Clone)]
pub struct Wormhole;

pub static ID: Pubkey = wormhole_svm_definitions::CORE_BRIDGE_PROGRAM_ID;

impl Id for Wormhole {
    fn id() -> Pubkey {
        ID
    }
}
