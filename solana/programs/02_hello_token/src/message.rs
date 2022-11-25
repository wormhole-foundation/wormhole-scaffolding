use anchor_lang::{prelude::Pubkey, AnchorDeserialize, AnchorSerialize};
use std::io;

const PAYLOAD_ID_ALIVE: u8 = 0;
const PAYLOAD_ID_HELLO: u8 = 1;

#[derive(Clone)]
/// Expected message types for this program. Only valid payloads are:
/// * `Alive`: Payload ID == 0. Emitted when [`initialize`](crate::initialize)
///  is called).
/// * `Hello`: Payload ID == 1. Emitted when
/// [`send_message`](crate::send_message) is called).
///
/// Payload IDs are encoded as u8.
pub enum HelloTokenMessage {
    // Alive { program_id: Pubkey },
    Hello {
        recipient: [u8; 32],
        relayer_fee: u32,
    },
}

impl AnchorSerialize for HelloTokenMessage {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        match self {
            // HelloTokenMessage::Alive { program_id } => {
            //     PAYLOAD_ID_ALIVE.serialize(writer)?;
            //     program_id.serialize(writer)
            // }
            HelloTokenMessage::Hello {
                recipient,
                relayer_fee,
            } => {
                PAYLOAD_ID_HELLO.serialize(writer)?;
                recipient.serialize(writer)?;
                relayer_fee.to_be_bytes().serialize(writer)
            }
        }
    }
}

impl AnchorDeserialize for HelloTokenMessage {
    fn deserialize(buf: &mut &[u8]) -> io::Result<Self> {
        match buf[0] {
            // PAYLOAD_ID_ALIVE => Ok(HelloTokenMessage::Alive {
            //     program_id: Pubkey::new(&buf[1..33]),
            // }),
            PAYLOAD_ID_HELLO => {
                let mut recipient = [0u8; 32];
                recipient.copy_from_slice(&buf[..32]);

                let relayer_fee = {
                    let mut out = [0u8; 4];
                    out.copy_from_slice(&buf[32..36]);
                    u32::from_be_bytes(out)
                };
                Ok(HelloTokenMessage::Hello {
                    recipient,
                    relayer_fee,
                })
            }
            _ => Err(io::Error::new(io::ErrorKind::Other, "invalid payload ID")),
        }
    }
}
