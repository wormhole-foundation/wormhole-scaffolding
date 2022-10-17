pub fn deserialize_emitter_chain(data: &[u8]) -> u16 {
    let num_signatures = to_u32_be(data, 5) as usize;
    return to_u16_be(&data, 6 + 66 * num_signatures + 8);
}

pub fn deserialize_emitter_address(data: &[u8]) -> [u8; 32] {
    let num_signatures = to_u32_be(data, 5) as usize;

    let index = 6 + 66 * num_signatures + 10;

    let mut out = [0u8; 32];
    out.copy_from_slice(&data[index..(index + 32)]);
    out
}

fn to_u16_be(bytes: &[u8], index: usize) -> u16 {
    u16::from_be_bytes(bytes[index..(index + 2)].try_into().unwrap())
}

fn to_u32_be(bytes: &[u8], index: usize) -> u32 {
    u32::from_be_bytes(bytes[index..(index + 4)].try_into().unwrap())
}
