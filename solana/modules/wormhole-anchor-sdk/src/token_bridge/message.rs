use anchor_lang::prelude::*;
use std::io;
use wormhole_io::{Readable, Writeable};

pub const PAYLOAD_ID_TRANSFER: u8 = 1;
pub const PAYLOAD_ID_ASSET_META: u8 = 2;
pub const PAYLOAD_ID_TRANSFER_WITH_PAYLOAD: u8 = 3;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct TransferHeader {
    /// Amount being transferred (big-endian uint256 -> u64)
    pub amount: u64,
    /// Address of the token. Left-zero-padded if shorter than 32 bytes
    pub token_address: [u8; 32],
    /// Chain ID of the token
    pub token_chain: u16,
    /// Address of the recipient. Left-zero-padded if shorter than 32 bytes
    pub to_address: [u8; 32],
    /// Chain ID of the recipient
    pub to_chain: u16,
    /// Sender of the transaction
    pub from_address: [u8; 32],
}

impl TransferHeader {
    #[cfg(test)]
    pub fn random(rng: &mut impl rand::Rng) -> Self {
        TransferHeader {
            amount: rng.gen(),
            token_address: rng.gen(),
            token_chain: rng.gen(),
            to_address: rng.gen(),
            to_chain: rng.gen(),
            from_address: rng.gen(),
        }
    }
}

impl Writeable for TransferHeader {
    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        let TransferHeader {
            amount,
            token_address,
            token_chain,
            to_address,
            to_chain,
            from_address,
        } = self;

        PAYLOAD_ID_TRANSFER_WITH_PAYLOAD.write(writer)?;
        U256::new(*amount).write(writer)?;
        token_address.write(writer)?;
        token_chain.write(writer)?;
        to_address.write(writer)?;
        to_chain.write(writer)?;
        from_address.write(writer)?;

        Ok(())
    }

    fn written_size(&self) -> usize {
        Self::SIZE.unwrap()
    }
}

impl Readable for TransferHeader {
    const SIZE: Option<usize> = Some(1 + 32 + 32 + 2 + 32 + 2 + 32);

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        // Verify Payload ID is a token transfer with payload.
        if u8::read(reader)? != PAYLOAD_ID_TRANSFER_WITH_PAYLOAD {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid Token Bridge Transfer With Payload",
            ));
        }

        // Encoded amount should be the last 8 bytes of bytes 1 through 33,
        // otherwise we will have serious issues in the Token Bridge program.
        let amount = U256::read(reader)?.as_u64();

        let token_address = Readable::read(reader)?;
        let token_chain = Readable::read(reader)?;
        let to_address = Readable::read(reader)?;
        let to_chain = u16::read(reader)?;
        let from_address = Readable::read(reader)?;

        Ok(TransferHeader {
            amount,
            token_address,
            token_chain,
            to_address,
            to_chain,
            from_address,
        })
    }
}

impl AnchorSerialize for TransferHeader {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        self.write(writer)
    }
}

impl AnchorDeserialize for TransferHeader {
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        Readable::read(reader)
    }
}

/// Bespoke U256 type which as actually a u64 to abstract the padding in (de)serialization.
#[derive(Debug, PartialEq)]
struct U256(u64);

impl Writeable for U256 {
    fn write<W>(&self, writer: &mut W) -> io::Result<()>
    where
        W: io::Write,
    {
        // 24-bytes padding:
        [0_u8; 24].write(writer)?;

        self.0.write(writer)
    }

    fn written_size(&self) -> usize {
        32
    }
}

impl Readable for U256 {
    const SIZE: Option<usize> = Some(32);

    fn read<R>(reader: &mut R) -> io::Result<Self>
    where
        Self: Sized,
        R: io::Read,
    {
        // Skip the next 24 bytes:
        let padding: [u8; 24] = Readable::read(reader)?;

        if padding != [0; 24] {
            Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "integer is not a valid u64",
            ))
        } else {
            Ok(Self(u64::read(reader)?))
        }
    }
}

impl AnchorSerialize for U256 {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        self.write(writer)
    }
}

impl AnchorDeserialize for U256 {
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        Readable::read(reader)
    }
}

impl U256 {
    pub fn new(n: u64) -> Self {
        Self(n)
    }

    pub fn as_u64(self) -> u64 {
        self.0
    }
}

#[test]
fn u256_roundtrip_serialization() {
    use rand::prelude::*;

    let mut rng = rand::thread_rng();
    let original = U256::new(rng.gen());

    let deserialized = U256::deserialize(
        &mut original
            .try_to_vec()
            .expect("Serialization should work")
            .as_ref(),
    )
    .expect("Deserialization should work");

    assert_eq!(original, deserialized);
}

#[test]
fn transfer_header_roundtrip_serialization() {
    let original = TransferHeader::random(&mut rand::thread_rng());

    let deserialized = TransferHeader::deserialize(
        &mut original
            .try_to_vec()
            .expect("Serialization should work")
            .as_ref(),
    )
    .expect("Deserialization should work");

    assert_eq!(original, deserialized);
}
