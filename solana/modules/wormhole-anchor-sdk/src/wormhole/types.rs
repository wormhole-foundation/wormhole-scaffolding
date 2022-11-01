use anchor_lang::prelude::*;

#[derive(AnchorDeserialize, AnchorSerialize, Clone, Copy, PartialEq, Eq)]
pub enum Finality {
    Confirmed,
    Finalized,
}

impl Default for Finality {
    fn default() -> Finality {
        Finality::Confirmed
    }
}

impl From<u8> for Finality {
    fn from(value: u8) -> Self {
        match value {
            1u8 => Finality::Finalized,
            _ => Finality::default(),
        }
    }
}
