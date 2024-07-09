use anchor_lang::prelude::*;
use std::{io, slice};

pub const PAYLOAD_ID_TRANSFER: u8 = 1;
pub const PAYLOAD_ID_ASSET_META: u8 = 2;
pub const PAYLOAD_ID_TRANSFER_WITH_PAYLOAD: u8 = 3;

#[derive(Default, AnchorSerialize, Clone, Copy, PartialEq, Eq)]
pub struct TransferWithMeta {
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

impl AnchorDeserialize for TransferWithMeta {
    fn deserialize_reader<R: io::Read>(reader: &mut R) -> io::Result<Self> {
        let mut variant = 0;
        reader.read_exact(slice::from_mut(&mut variant))?;
        // Verify Payload ID is a token transfer with payload.
        if variant != PAYLOAD_ID_TRANSFER_WITH_PAYLOAD {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid Token Bridge Transfer With Payload",
            ));
        }

        // Skip the next 24 bytes:
        {
            let mut _discard = [0u8; 32];
            reader.read_exact(&mut _discard)?;
        }

        // Encoded amount should be the last 8 bytes of bytes 1 through 33,
        // otherwise we will have serious issues in the Token Bridge program.
        let amount = {
            let mut buf = [0u8; 8];
            reader.read_exact(&mut buf)?;
            u64::from_be_bytes(buf)
        };

        let mut token_address = [0u8; 32];
        reader.read_exact(&mut token_address)?;

        let token_chain = {
            let mut buf = [0u8; 2];
            reader.read_exact(&mut buf)?;
            u16::from_be_bytes(buf)
        };

        let mut to_address = [0u8; 32];
        reader.read_exact(&mut to_address)?;

        let to_chain = {
            let mut buf = [0u8; 2];
            reader.read_exact(&mut buf)?;
            u16::from_be_bytes(buf)
        };

        let mut from_address = [0u8; 32];
        reader.read_exact(&mut from_address)?;

        Ok(TransferWithMeta {
            amount,
            token_address,
            token_chain,
            to_address,
            to_chain,
            from_address,
        })
    }
}
