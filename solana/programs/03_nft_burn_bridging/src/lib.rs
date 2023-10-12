use anchor_lang::prelude::*;

pub mod error;
pub mod instance;
pub mod instructions;

use instructions::*;

declare_id!("Scaffo1dingNftBurnBridging11111111111111111");

#[program]
pub mod nft_burn_bridging {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, whitelist_size: u16) -> Result<()> {
        instructions::initialize(ctx, whitelist_size)
    }

    //can't use EvmAddress type for evm_recipient because anchor program macro doesn't resolve it
    pub fn burn_and_send(ctx: Context<BurnAndSend>, evm_recipient: [u8; 20]) -> Result<()> {
        instructions::burn_and_send(ctx, &evm_recipient)
    }

    pub fn whitelist(ctx: Context<Whitelist>, token_ids: Vec<u16>) -> Result<()> {
        instructions::whitelist(ctx, token_ids)
    }

    pub fn whitelist_bulk(ctx: Context<Whitelist>, offset: u16, slice: Vec<u8>) -> Result<()> {
        instructions::whitelist_bulk(ctx, offset, slice)
    }

    pub fn set_delegate(ctx: Context<SetDelegate>, delegate: Option<Pubkey>) -> Result<()> {
        instructions::set_delegate(ctx, delegate)
    }

    pub fn set_paused(ctx: Context<SetPaused>, is_paused: bool) -> Result<()> {
        instructions::set_paused(ctx, is_paused)
    }
}
