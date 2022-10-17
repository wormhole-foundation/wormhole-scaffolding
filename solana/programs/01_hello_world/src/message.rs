pub fn deserialize_message<'a>(payload: &'a [u8]) -> Option<(u8, &'a [u8])> {
    if payload.len() < 3
        || payload.len() != 3 + u16::from_be_bytes(payload[1..3].try_into().unwrap()) as usize
    {
        None
    } else {
        Some((payload[0], &payload[3..]))
    }
}
