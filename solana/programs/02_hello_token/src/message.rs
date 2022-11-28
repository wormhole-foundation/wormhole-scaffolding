use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use std::io;
use wormhole_anchor_sdk::token_bridge;

const PAYLOAD_ID_HELLO: u8 = 1;

#[derive(Clone, Copy)]
/// Expected message types for this program. Only valid payloads are:
/// * `Hello`: Payload ID == 1. Emitted when
/// [`send_native_tokens_with_payload`](crate::send_native_tokens_with_payload)
/// is called).
///
/// Payload IDs are encoded as u8.
pub enum HelloTokenMessage {
    Hello { recipient: [u8; 32] },
}

impl AnchorSerialize for HelloTokenMessage {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        match self {
            HelloTokenMessage::Hello { recipient } => {
                PAYLOAD_ID_HELLO.serialize(writer)?;
                recipient.serialize(writer)
            }
        }
    }
}

impl AnchorDeserialize for HelloTokenMessage {
    fn deserialize(buf: &mut &[u8]) -> io::Result<Self> {
        match buf[0] {
            PAYLOAD_ID_HELLO => Ok(HelloTokenMessage::Hello {
                recipient: <[u8; 32]>::deserialize(&mut &buf[1..33])?,
            }),
            _ => Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid payload ID",
            )),
        }
    }
}

pub type PostedHelloTokenMessage = token_bridge::PostedTransferWith<HelloTokenMessage>;
