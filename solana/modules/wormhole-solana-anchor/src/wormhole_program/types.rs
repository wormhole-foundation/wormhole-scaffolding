use anchor_lang::prelude::*;

#[derive(AnchorDeserialize, AnchorSerialize, Clone, PartialEq, Eq)]
pub enum Finality {
    Confirmed,
    Finalized,
}

impl Default for Finality {
    fn default() -> Finality {
        Finality::Confirmed
    }
}
