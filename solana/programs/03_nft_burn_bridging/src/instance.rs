use anchor_lang::prelude::*;
use crate::error::NftBurnBridging;

#[account]
/// Instance account doubles as (custom) emitter
pub struct Instance {
  pub bump: u8, //required for signing with the instance account
  pub update_authority: Pubkey,
  pub collection_mint: Pubkey, //a seed of the instance account and thus also required for signing
  pub collection_meta: Pubkey,
  pub delegate: Option<Pubkey>,
  pub is_paused: bool,
  pub whitelist_size: u16, // 0 means no whitelisting required
  pub whitelist: Vec<u8>,
}

impl Instance {
  //see https://www.anchor-lang.com/docs/space
  pub const BASE_SIZE: usize
    = 8      // anchor discriminator = [u8; 8]
    + 1      // bump
    + 32     // update_authority
    + 32     // collection_mint
    + 32     // collection_meta
    + 1 + 32 // delegate
    + 1      // is_paused
    + 2      // whitelist_size
    + 4      // whitelist
  ;

  pub const SEED_PREFIX: &'static [u8; 8] = b"instance";

  fn check_token_id(&self, token_id: u16) -> Result<()> {
    if token_id >= self.whitelist_size {
      return Err(NftBurnBridging::TokenIdOutOfBounds.into());
    }
    Ok(())
  }

  pub fn whitelist_enabled(&self) -> bool {
    self.whitelist_size > 0
  }

  pub fn is_whitelisted(&self, token_id: u16) -> Result<bool> {
    self.check_token_id(token_id)?;
    Ok(self.whitelist[token_id as usize / 8] & (1u8 << (token_id % 8)) > 0)
  }

  pub fn whitelist_tokens(&mut self, token_ids: Vec<u16>) -> Result<()> {
    for token_id in token_ids {
      self.check_token_id(token_id)?;
      self.whitelist[token_id as usize / 8] |= 1 << (token_id % 8);
    }
    Ok(())
  }

  pub fn whitelist_bulk(&mut self, offset: u16, slice: Vec<u8>) -> Result<()> {
    if offset + slice.len() as u16 > self.whitelist_size {
      return Err(NftBurnBridging::TokenIdOutOfBounds.into());
    }
    self.whitelist[offset as usize..offset as usize + slice.len()].copy_from_slice(&slice);
    Ok(())
  }
}