use anchor_lang::prelude::*;

use super::Finality;

#[derive(Default, AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct WormholeProgramData {
    /// The current guardian set index, used to decide which signature sets to accept.
    pub guardian_set_index: u32,

    /// Lamports in the collection account
    pub last_lamports: u64,

    /// Bridge configuration, which is set once upon initialization.
    pub config: WormholeConfig,
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Copy, Clone, PartialEq, Eq)]
pub struct WormholeConfig {
    /// Period for how long a guardian set is valid after it has been replaced by a new one.  This
    /// guarantees that VAAs issued by that set can still be submitted for a certain period.  In
    /// this period we still trust the old guardian set.
    pub guardian_set_expiration_time: u32,

    /// Amount of lamports that needs to be paid to the protocol to post a message
    pub fee: u64,
}

#[derive(Default, AnchorSerialize, Clone, PartialEq, Eq)]
pub struct PostedMessageData {
    pub message: MessageData,
}

#[derive(Default, AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub struct MessageData {
    /// Header of the posted VAA
    pub version: u8,

    /// Level of consistency requested by the emitter
    pub finality: Finality,

    /// Time the message was submitted
    pub timestamp: u32,

    /// Account where signatures are stored
    pub signature_account: Pubkey,

    /// Time the posted message was created
    pub posted_timestamp: u32,

    /// Unique id for this message
    pub batch_id: u32,

    /// Sequence number of this message
    pub sequence: u64,

    /// Emitter of the message
    pub emitter_chain: u16,

    /// Emitter of the message
    pub emitter_address: [u8; 32],

    /// Message payload
    pub payload: Vec<u8>,
}

impl AnchorDeserialize for PostedMessageData {
    fn deserialize(buf: &mut &[u8]) -> std::io::Result<Self> {
        if buf.len() < 3 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Invalid Wormhole Message",
            ));
        }

        // We accept "vaa", "msg", or "msu" because it's convenient to read all of these as PostedVAAData
        let expected: [&[u8]; 3] = [b"vaa", b"msg", b"msu"];
        let magic: &[u8] = &buf[0..3];
        if !expected.contains(&magic) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "Invalid Wormhole Message",
            ));
        };
        *buf = &buf[3..];
        Ok(PostedMessageData {
            message: MessageData::deserialize(buf)?,
        })
    }
}
