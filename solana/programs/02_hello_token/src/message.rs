use anchor_lang::{prelude::Pubkey, AnchorDeserialize, AnchorSerialize};
use std::io;

const PAYLOAD_ID_HELLO: u8 = 1;

#[derive(Clone)]
/// Expected message types for this program. Only valid payloads are:
/// * `Hello`: Payload ID == 1. Emitted when
/// [`send_native_tokens_with_payload`](crate::send_native_tokens_with_payload)
/// is called).
///
/// Payload IDs are encoded as u8.
pub enum HelloTokenMessage {
    Hello {
        recipient: [u8; 32],
        relayer_fee: u32,
        token_account: Pubkey,
    },
}

impl AnchorSerialize for HelloTokenMessage {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        match self {
            HelloTokenMessage::Hello {
                recipient,
                relayer_fee,
                token_account,
            } => {
                PAYLOAD_ID_HELLO.serialize(writer)?;
                recipient.serialize(writer)?;
                relayer_fee.to_be_bytes().serialize(writer)?;
                token_account.serialize(writer)
            }
        }
    }
}

impl AnchorDeserialize for HelloTokenMessage {
    fn deserialize(buf: &mut &[u8]) -> io::Result<Self> {
        match buf[0] {
            PAYLOAD_ID_HELLO => {
                let relayer_fee = {
                    let mut out = [0u8; 4];
                    out.copy_from_slice(&buf[32..36]);
                    u32::from_be_bytes(out)
                };

                Ok(HelloTokenMessage::Hello {
                    recipient: <[u8; 32]>::deserialize(&mut &buf[..32])?,
                    relayer_fee,
                    token_account: Pubkey::deserialize(&mut &buf[36..68])?,
                })
            }
            _ => Err(io::Error::new(io::ErrorKind::Other, "invalid payload ID")),
        }
    }
}
