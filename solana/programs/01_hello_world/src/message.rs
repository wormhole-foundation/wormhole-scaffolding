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
pub enum HelloWorldMessage {
    Alive { program_id: Pubkey },
    Hello { message: Vec<u8> },
}

impl AnchorSerialize for HelloWorldMessage {
    fn serialize<W: io::Write>(&self, writer: &mut W) -> io::Result<()> {
        match self {
            HelloWorldMessage::Alive { program_id } => {
                PAYLOAD_ID_ALIVE.serialize(writer)?;
                program_id.serialize(writer)
            }
            HelloWorldMessage::Hello { message } => {
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

impl AnchorDeserialize for HelloWorldMessage {
    fn deserialize(buf: &mut &[u8]) -> io::Result<Self> {
        match buf[0] {
            PAYLOAD_ID_ALIVE => Ok(HelloWorldMessage::Alive {
                program_id: Pubkey::new(&buf[1..33]),
            }),
            PAYLOAD_ID_HELLO => {
                let length = {
                    let mut out = [0u8; 2];
                    out.copy_from_slice(&buf[1..3]);
                    u16::from_be_bytes(out) as usize
                };
                Ok(HelloWorldMessage::Hello {
                    message: buf[3..(3 + length)].to_vec(),
                })
            }
            _ => Err(io::Error::new(io::ErrorKind::Other, "invalid payload ID")),
        }
    }
}

#[cfg(test)]
pub mod test {
    use super::*;
    use anchor_lang::prelude::Result;
    use std::{mem::size_of, str, string::String};

    #[test]
    fn test_message_alive() -> Result<()> {
        let my_program_id = Pubkey::new_unique();
        let msg = HelloWorldMessage::Alive {
            program_id: my_program_id,
        };

        // Serialize program ID above.
        let mut encoded = Vec::new();
        msg.serialize(&mut encoded)?;

        assert_eq!(encoded.len(), size_of::<u8>() + size_of::<Pubkey>());

        // Verify Payload ID.
        assert_eq!(encoded[0], PAYLOAD_ID_ALIVE);

        // Verify Program ID.
        let mut program_id_bytes = [0u8; 32];
        program_id_bytes.copy_from_slice(&encoded[1..33]);
        assert_eq!(program_id_bytes, my_program_id.to_bytes());

        // Now deserialize the encoded message.
        if let HelloWorldMessage::Alive { program_id } =
            HelloWorldMessage::deserialize(&mut encoded.as_slice())?
        {
            assert_eq!(program_id, my_program_id);
        } else {
            return Err(std::io::Error::new(std::io::ErrorKind::Other, "invalid message").into());
        }

        Ok(())
    }

    #[test]
    fn test_message_hello() -> Result<()> {
        let raw_message = "All your base are belong to us";
        let msg = HelloWorldMessage::Hello {
            message: String::from(raw_message).as_bytes().to_vec(),
        };

        // Serialize message above.
        let mut encoded = Vec::new();
        msg.serialize(&mut encoded)?;

        assert_eq!(
            encoded.len(),
            size_of::<u8>() + size_of::<u16>() + raw_message.len()
        );

        // Verify Payload ID.
        assert_eq!(encoded[0], PAYLOAD_ID_HELLO);

        // Verify message length.
        let mut message_len_bytes = [0u8; 2];
        message_len_bytes.copy_from_slice(&encoded[1..3]);
        assert_eq!(
            u16::from_be_bytes(message_len_bytes) as usize,
            raw_message.len()
        );

        // Verify message.
        let from_utf8_result = str::from_utf8(&encoded[3..]);
        assert!(from_utf8_result.is_ok(), "from_utf8 resulted in an error");
        assert_eq!(from_utf8_result.unwrap(), raw_message);

        // Now deserialize the encoded message.
        if let HelloWorldMessage::Hello { message } =
            HelloWorldMessage::deserialize(&mut encoded.as_slice())?
        {
            let from_utf8_result = str::from_utf8(&message);
            assert!(from_utf8_result.is_ok(), "from_utf8 resulted in an error");
            assert_eq!(from_utf8_result.unwrap(), raw_message);
        } else {
            return Err(std::io::Error::new(std::io::ErrorKind::Other, "invalid message").into());
        }

        Ok(())
    }
}
