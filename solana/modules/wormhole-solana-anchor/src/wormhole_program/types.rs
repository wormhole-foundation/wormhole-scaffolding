use anchor_lang::prelude::*;

#[derive(AnchorDeserialize, AnchorSerialize)]
pub enum Finality {
    Confirmed,
    Finalized,
}
