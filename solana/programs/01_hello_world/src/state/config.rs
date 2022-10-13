use anchor_lang::prelude::*;

#[derive(Default, AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct WormholeAddresses {
    pub program: Pubkey,
    // program pdas
    pub config: Pubkey,
    pub fee_collector: Pubkey,
    // emitter related pdas
    pub emitter: Pubkey,
    pub sequence: Pubkey,
    // bumps
    pub emitter_bump: u8,
}

impl WormholeAddresses {
    pub const LEN: usize = 32 // program
        + 32 // config
        + 32 // fee_collector
        + 32 // emitter
        + 32 // sequence
        + 1 // emitter_bump
    ;
}

#[account]
#[derive(Default)]
pub struct Config {
    pub owner: Pubkey,
    pub wormhole: WormholeAddresses,

    // Saving once account is created
    pub bump: u8,

    // Message counter
    pub message_count: u64,
}

impl Config {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 32 // owner
        + WormholeAddresses::LEN
        + 1 // bump
        + 8 // mesasge_count
    ;
}
