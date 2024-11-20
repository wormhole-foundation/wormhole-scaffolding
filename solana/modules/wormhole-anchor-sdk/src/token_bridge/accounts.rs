use anchor_lang::prelude::*;
use std::io::Write;
use std::{io, ops::Deref};
use wormhole_io::{Readable, Writeable, WriteableBytes};

#[cfg(feature = "idl-build")]
use anchor_lang::{Discriminator, IdlBuild};

use crate::token_bridge::{message::TransferHeader, program::ID};
use crate::wormhole::{PostedVaa, CHAIN_ID_SOLANA};

#[derive(Debug, Default, AnchorDeserialize, Clone, PartialEq, Eq)]
/// Token Bridge config data.
pub struct Config {
    pub wormhole_bridge: Pubkey,
}

impl Config {
    /// AKA `b"config"`
    pub const SEED_PREFIX: &'static [u8; 6] = b"config";
}

impl AccountDeserialize for Config {
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

#[derive(Debug, Default, Clone, PartialEq)]
/// Token Bridge wrapped mint. See [`anchor_spl::token::Mint`].
pub struct WrappedMint(anchor_spl::token::Mint);

impl WrappedMint {
    /// AKA `b"wrapped"`
    pub const SEED_PREFIX: &'static [u8; 7] = b"wrapped";
}

impl AccountDeserialize for WrappedMint {
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

#[derive(Debug, Default, AnchorDeserialize, Clone, PartialEq, Eq)]
/// Token Bridge wrapped metadata (for native token data).
pub struct WrappedMeta {
    pub chain: u16,
    pub token_address: [u8; 32],
    pub original_decimals: u8,
}

impl WrappedMeta {
    /// AKA `b"meta"`
    pub const SEED_PREFIX: &'static [u8; 4] = b"meta";
}

impl AccountDeserialize for WrappedMeta {
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

#[derive(Debug, Default, AnchorDeserialize, Clone, PartialEq, Eq)]
/// Token Bridge foreign endpoint registration data.
pub struct EndpointRegistration {
    pub emitter_chain: u16,
    pub emitter_address: [u8; 32],
}

impl AccountDeserialize for EndpointRegistration {
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

#[derive(Debug, Clone, PartialEq, Eq)]
/// Token Bridge Transfer With Payload data. This data is found as the payload
/// of a posted Wormhole message.
pub struct TransferWithPayload {
    meta: TransferHeader,
    payload: WriteableBytes,
}

impl TransferWithPayload {
    pub fn amount(&self) -> u64 {
        self.meta.amount
    }

    pub fn token_address(&self) -> &[u8; 32] {
        &self.meta.token_address
    }

    pub fn mint(&self) -> Pubkey {
        if self.token_chain() == CHAIN_ID_SOLANA {
            Pubkey::new_from_array(*self.token_address())
        } else {
            Pubkey::default()
        }
    }

    pub fn token_chain(&self) -> u16 {
        self.meta.token_chain
    }

    pub fn to_address(&self) -> &[u8; 32] {
        &self.meta.to_address
    }

    pub fn to(&self) -> Pubkey {
        Pubkey::new_from_array(*self.to_address())
    }

    pub fn to_chain(&self) -> u16 {
        self.meta.to_chain
    }

    pub fn from_address(&self) -> &[u8; 32] {
        &self.meta.from_address
    }

    pub fn data(&self) -> &[u8] {
        &self.payload
    }

    pub fn message(&self) -> &[u8] {
        self.data()
    }
}

impl Writeable for TransferWithPayload {
    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        let Self { meta, payload } = self;

        meta.write(writer)?;
        payload.write(writer)?;

        Ok(())
    }

    fn written_size(&self) -> usize {
        let Self { meta, payload } = self;

        meta.written_size() + payload.written_size()
    }
}

impl Readable for TransferWithPayload {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        Ok(TransferWithPayload {
            meta: TransferHeader::read(reader)?,
            payload: WriteableBytes::read(reader)?.into(),
        })
    }
}

impl AnchorSerialize for TransferWithPayload {
    fn serialize<W: Write>(&self, writer: &mut W) -> io::Result<()> {
        self.write(writer)
    }
}

impl AnchorDeserialize for TransferWithPayload {
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        Readable::read(reader)
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
/// Token Bridge Transfer with generic payload type `P`. This data is found as
/// the payload of a posted Wormhole message.
pub struct TransferWith<P> {
    meta: TransferHeader,
    payload: P,
}

impl<P: Writeable> Writeable for TransferWith<P> {
    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        let Self { meta, payload } = self;

        meta.write(writer)?;
        payload.write(writer)?;

        Ok(())
    }

    fn written_size(&self) -> usize {
        let Self { meta, payload } = self;

        meta.written_size() + payload.written_size()
    }
}

impl<P: Readable> Readable for TransferWith<P> {
    const SIZE: Option<usize> = None;

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        Ok(TransferWith {
            meta: TransferHeader::read(reader)?,
            payload: P::read(reader)?.into(),
        })
    }
}

impl<P: AnchorDeserialize + AnchorSerialize + Copy> TransferWith<P> {
    pub fn new(meta: &TransferHeader, payload: &P) -> Self {
        Self {
            meta: *meta,
            payload: *payload,
        }
    }

    pub fn amount(&self) -> u64 {
        self.meta.amount
    }

    pub fn token_address(&self) -> &[u8; 32] {
        &self.meta.token_address
    }

    pub fn mint(&self) -> Pubkey {
        if self.token_chain() == CHAIN_ID_SOLANA {
            Pubkey::new_from_array(*self.token_address())
        } else {
            Pubkey::default()
        }
    }

    pub fn token_chain(&self) -> u16 {
        self.meta.token_chain
    }

    pub fn to_address(&self) -> &[u8; 32] {
        &self.meta.to_address
    }

    pub fn to(&self) -> Pubkey {
        Pubkey::new_from_array(*self.to_address())
    }

    pub fn to_chain(&self) -> u16 {
        self.meta.to_chain
    }

    pub fn from_address(&self) -> &[u8; 32] {
        &self.meta.from_address
    }

    pub fn data(&self) -> &P {
        &self.payload
    }

    pub fn message(&self) -> &P {
        self.data()
    }
}

impl<P: AnchorSerialize + AnchorDeserialize> AnchorDeserialize for TransferWith<P> {
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        Ok(TransferWith {
            meta: TransferHeader::read(reader)?,
            payload: P::deserialize_reader(reader)?,
        })
    }
}

impl<P: AnchorSerialize + AnchorDeserialize> AnchorSerialize for TransferWith<P> {
    fn serialize<W: Write>(&self, writer: &mut W) -> io::Result<()> {
        let Self { meta, payload } = self;

        meta.write(writer)?;
        payload.serialize(writer)?;

        Ok(())
    }
}

/// Posted VAA (verified Wormhole message) of a Token Bridge transfer with
/// payload.
pub type PostedTransferWithPayload = PostedVaa<TransferWithPayload>;

/// Posted VAA (verified Wormhole message) of a Token Bridge transfer with
/// generic payload type `P`.
pub type PostedTransferWith<P> = PostedVaa<TransferWith<P>>;

#[cfg(feature = "idl-build")]
impl Discriminator for Config {
    const DISCRIMINATOR: &'static [u8] = &[];
}

#[cfg(feature = "idl-build")]
impl Discriminator for EndpointRegistration {
    const DISCRIMINATOR: &'static [u8] = &[];
}

#[cfg(feature = "idl-build")]
impl Discriminator for WrappedMint {
    const DISCRIMINATOR: &'static [u8] = &[];
}

#[cfg(feature = "idl-build")]
impl Discriminator for WrappedMeta {
    const DISCRIMINATOR: &'static [u8] = &[];
}

#[cfg(feature = "idl-build")]
impl IdlBuild for Config {}

#[cfg(feature = "idl-build")]
impl IdlBuild for EndpointRegistration {}

#[cfg(feature = "idl-build")]
impl IdlBuild for WrappedMint {}

#[cfg(feature = "idl-build")]
impl IdlBuild for WrappedMeta {}

#[test]
fn transfer_with_payload_roundtrip_serialization() {
    use rand::prelude::*;

    let rng = &mut rand::thread_rng();
    let payload: [u8; 32] = rng.gen();

    let original = TransferWithPayload {
        meta: TransferHeader::random(rng),
        payload: Vec::from(payload).into(),
    };

    let deserialized = TransferWithPayload::deserialize(
        &mut original
            .try_to_vec()
            .expect("Serialization should work")
            .as_ref(),
    )
    .expect("Deserialization should work");

    assert_eq!(original, deserialized);
}

#[test]
fn transfer_with_roundtrip_serialization() {
    let rng = &mut rand::thread_rng();

    let original = TransferWith {
        meta: TransferHeader::random(rng),
        payload: Pubkey::new_unique(),
    };

    let deserialized = TransferWith::deserialize(
        &mut original
            .try_to_vec()
            .expect("Serialization should work")
            .as_ref(),
    )
    .expect("Deserialization should work");

    assert_eq!(original, deserialized);
}
