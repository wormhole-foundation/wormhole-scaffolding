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
}

impl WormholeAddresses {
    pub const LEN: usize = 32 // program
        + 32 // config
        + 32 // fee_collector
        + 32 // emitter
        + 32 // sequence
    ;
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct TokenBridgeAddresses {
    pub program: Pubkey,
    // program pdas
    pub config: Pubkey,
    pub authority_signer: Pubkey,
    pub custody_signer: Pubkey,
    pub mint_authority: Pubkey,
    pub sender: Pubkey,
    pub redeemer: Pubkey,
    // send/receive bumps
    pub sender_bump: u8,
    pub redeemer_bump: u8,
}

impl TokenBridgeAddresses {
    pub const LEN: usize = 32 // program
        + 32 // config
        + 32 // authority_signer
        + 32 // custody_signer
        + 32 // mint_signer
        + 32 // sender
        + 32 // redeemer
        + 1 // sender_bump
        + 1 // redeemer_bump
    ;
}

#[account]
#[derive(Default)]
pub struct Config {
    pub owner: Pubkey,
    pub token_bridge: TokenBridgeAddresses,
    pub wormhole: WormholeAddresses,

    // Message counter
    pub message_count: u64,
}

impl Config {
    pub const MAXIMUM_SIZE: usize = 8 // discriminator
        + 32 // owner
        + TokenBridgeAddresses::LEN
        + WormholeAddresses::LEN
        + 8 // mesasge_count
    ;
}
