use anchor_lang::prelude::*;
use std::ops::Deref;

use crate::token_bridge::program::ID;

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct Config {
    pub wormhole_bridge: Pubkey,
}

impl Config {
    pub const SEED_PREFIX: &'static [u8; 6] = b"config";
}

impl AccountDeserialize for Config {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        Self::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl AccountSerialize for Config {}

impl Owner for Config {
    fn owner() -> Pubkey {
        ID
    }
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct EndpointRegistration {
    pub chain: u16,
    pub contract: [u8; 32],
}

impl AccountDeserialize for EndpointRegistration {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        Self::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl AccountSerialize for EndpointRegistration {}

impl Owner for EndpointRegistration {
    fn owner() -> Pubkey {
        ID
    }
}

#[derive(Default, Clone, PartialEq)]
pub struct WrappedMint(anchor_spl::token::Mint);

impl WrappedMint {
    pub const SEED_PREFIX: &'static [u8; 7] = b"wrapped";
}

impl AccountDeserialize for WrappedMint {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        Self::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Ok(Self(anchor_spl::token::Mint::try_deserialize_unchecked(
            buf,
        )?))
    }
}

impl AccountSerialize for WrappedMint {}

impl Owner for WrappedMint {
    fn owner() -> Pubkey {
        anchor_spl::token::ID
    }
}

impl Deref for WrappedMint {
    type Target = anchor_spl::token::Mint;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct WrappedMeta {
    pub chain: u16,
    pub token_address: [u8; 32],
    pub original_decimals: u8,
}

impl WrappedMeta {
    pub const SEED_PREFIX: &'static [u8; 4] = b"meta";
}

impl AccountDeserialize for WrappedMeta {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        Self::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl AccountSerialize for WrappedMeta {}

impl Owner for WrappedMeta {
    fn owner() -> Pubkey {
        ID
    }
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct EndpointDerivation {
    pub emitter_chain: u16,
    pub emitter_address: [u8; 32],
}

impl AccountDeserialize for EndpointDerivation {
    fn try_deserialize(buf: &mut &[u8]) -> Result<Self> {
        Self::try_deserialize_unchecked(buf)
    }

    fn try_deserialize_unchecked(buf: &mut &[u8]) -> Result<Self> {
        Self::deserialize(buf).map_err(Into::into)
    }
}

impl AccountSerialize for EndpointDerivation {}

impl Owner for EndpointDerivation {
    fn owner() -> Pubkey {
        ID
    }
}
