use anchor_lang::prelude::*;
use std::io;

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

impl AccountSerialize for Config {
    fn try_serialize<W: io::Write>(&self, _writer: &mut W) -> Result<()> {
        // no-op
        Ok(())
    }
}

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

impl AccountSerialize for EndpointRegistration {
    fn try_serialize<W: io::Write>(&self, _writer: &mut W) -> Result<()> {
        // no-op
        Ok(())
    }
}

impl Owner for EndpointRegistration {
    fn owner() -> Pubkey {
        ID
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

impl AccountSerialize for WrappedMeta {
    fn try_serialize<W: io::Write>(&self, _writer: &mut W) -> Result<()> {
        // no-op
        Ok(())
    }
}

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

impl AccountSerialize for EndpointDerivation {
    fn try_serialize<W: io::Write>(&self, _writer: &mut W) -> Result<()> {
        // no-op
        Ok(())
    }
}

impl Owner for EndpointDerivation {
    fn owner() -> Pubkey {
        ID
    }
}
