use anchor_lang::prelude::*;
use crate::instance::Instance;

#[derive(Accounts)]
pub struct SetDelegate<'info> {
  #[account(mut, has_one = update_authority)]
  pub instance: Account<'info, Instance>,

  #[account()]
  pub update_authority: Signer<'info>,
}

pub fn set_delegate(ctx: Context<SetDelegate>, delegate: Option<Pubkey>) -> Result<()> {
  ctx.accounts.instance.delegate = delegate;

  Ok(())
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
  #[account(
    mut,
    constraint = 
      instance.update_authority.key() == authority.key() || 
      instance.delegate == Some(authority.key()),
  )]
  pub instance: Account<'info, Instance>,

  #[account()]
  pub authority: Signer<'info>,
}

pub fn set_paused(ctx: Context<SetPaused>, is_paused: bool) -> Result<()> {
  ctx.accounts.instance.is_paused = is_paused;

  Ok(())
}

#[derive(Accounts)]
pub struct Whitelist<'info> {
  #[account(
    mut,
    constraint = (
        instance.update_authority.key() == authority.key() || 
        instance.delegate == Some(authority.key())
      ) && instance.whitelist_enabled(),
  )]
  pub instance: Account<'info, Instance>,

  #[account()]
  pub authority: Signer<'info>,
}

pub fn whitelist(ctx: Context<Whitelist>, token_ids: Vec<u16>) -> Result<()> {
  ctx.accounts.instance.whitelist_tokens(token_ids)
}

pub fn whitelist_bulk(ctx: Context<Whitelist>, offset: u16, slice: Vec<u8>) -> Result<()> {
  ctx.accounts.instance.whitelist_bulk(offset, slice)
}