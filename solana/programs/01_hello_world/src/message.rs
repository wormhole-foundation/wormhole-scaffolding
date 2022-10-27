use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use std::io;

const PAYLOAD_ID_HELLO: u8 = 1;

pub enum Message {
    Hello { message: Vec<u8> },
}

impl AnchorSerialize for Message {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        match self {
            Message::Hello { message } => {
                PAYLOAD_ID_HELLO.serialize(writer)?;
                (message.len() as u16).to_be_bytes().serialize(writer)?;
                for item in message {
                    item.serialize(writer)?;
                }
                Ok(())
            }
        }
    }
}

impl AnchorDeserialize for Message {
    fn deserialize(buf: &mut &[u8]) -> io::Result<Self> {
        match buf[0] {
            PAYLOAD_ID_HELLO => {
                let length = {
                    let mut out = [0u8; 2];
                    out.copy_from_slice(&buf[1..3]);
                    u16::from_be_bytes(out) as usize
                };
                Ok(Message::Hello {
                    message: buf[3..(3 + length)].to_vec(),
                })
            }
            _ => Err(io::Error::new(io::ErrorKind::Other, "invalid payload ID")),
        }
    }
}
