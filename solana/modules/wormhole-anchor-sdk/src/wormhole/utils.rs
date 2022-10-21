use anchor_lang::prelude::*;
use solana_program::account_info::AccountInfo;

use super::{constants::*, PostedMessageData, WormholeProgramData};

pub fn verify_emitter<'info>(
    posted_message_acct: &AccountInfo<'info>,
    chain: u16,
    address: &[u8; 32],
) -> Result<bool> {
    let mut buf: &[u8] = &posted_message_acct.try_borrow_data()?;
    let posted = PostedMessageData::deserialize(&mut buf)?;
    Ok(posted.message.emitter_chain == chain && posted.message.emitter_address == *address)
}

pub fn get_batch_id<'info>(posted_message_acct: &AccountInfo<'info>) -> Result<u32> {
    let buf: &[u8] = &posted_message_acct.try_borrow_data()?;
    let mut out = [0u8; 4];
    out.copy_from_slice(&buf[MESSAGE_INDEX_BATCH_ID..(MESSAGE_INDEX_BATCH_ID + 4)]);
    Ok(u32::from_le_bytes(out))
}

pub fn get_sequence<'info>(posted_message_acct: &AccountInfo<'info>) -> Result<u64> {
    let buf: &[u8] = &posted_message_acct.try_borrow_data()?;
    let mut out = [0u8; 8];
    out.copy_from_slice(&buf[MESSAGE_INDEX_SEQUENCE..(MESSAGE_INDEX_SEQUENCE + 8)]);
    Ok(u64::from_le_bytes(out))
}

pub fn get_emitter_chain<'info>(posted_message_acct: &AccountInfo<'info>) -> Result<u16> {
    let buf: &[u8] = &posted_message_acct.try_borrow_data()?;
    let mut out = [0u8; 2];
    out.copy_from_slice(&buf[MESSAGE_INDEX_EMITTER_CHAIN..(MESSAGE_INDEX_EMITTER_CHAIN + 2)]);
    Ok(u16::from_le_bytes(out))
}

pub fn get_emitter_address<'info>(posted_message_acct: &AccountInfo<'info>) -> Result<[u8; 32]> {
    let buf: &[u8] = &posted_message_acct.try_borrow_data()?;
    let mut out = [0u8; 32];
    out.copy_from_slice(&buf[MESSAGE_INDEX_EMITTER_ADDRESS..(MESSAGE_INDEX_EMITTER_ADDRESS + 32)]);
    Ok(out)
}

pub fn get_message_payload<'info>(posted_message_acct: &AccountInfo<'info>) -> Result<Vec<u8>> {
    let buf: &[u8] = &posted_message_acct.try_borrow_data()?;
    let length = buf[MESSAGE_INDEX_PAYLOAD_LENGTH] as usize;
    Ok(buf[MESSAGE_INDEX_PAYLOAD..(MESSAGE_INDEX_PAYLOAD + length)].to_vec())
}

pub fn get_message_fee<'info>(config: &AccountInfo<'info>) -> Result<u64> {
    // TODO: consider skipping directly to where the fees are encoded
    // instead of deserializing the whole account
    let mut buf: &[u8] = &config.try_borrow_data()?;
    let wormhole_program_data = WormholeProgramData::deserialize(&mut buf)?;
    Ok(wormhole_program_data.config.fee)
}
