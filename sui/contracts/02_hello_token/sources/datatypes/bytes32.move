module hello_token::bytes32 {
    use std::bcs::{Self};
    use std::vector::{Self};

    // Errors.
    const E_INVALID_BYTES32: u64 = 0;
    
    // Of course LEN == 32.
    const LEN: u64 = 32;

    struct Bytes32 has copy, drop, store {
        data: vector<u8>,
    }

    public fun new(data: vector<u8>): Bytes32 {
        assert!(is_valid(&data), E_INVALID_BYTES32);
        Bytes32 {
            data
        }
    }

    public fun default(): Bytes32 {
        let data = vector::empty();
        let i = 0;
        while (i < LEN) {
            vector::push_back(&mut data, 0u8);
            i = i + 1;
        };
        new(data)
    }

    public fun from_u64(value: u64): Bytes32 {
        let buf = pad_left(&bcs::to_bytes(&value), true);
        new(buf)
    }

    public fun from_u32(value: u32): Bytes32 {
        let buf = pad_left(&bcs::to_bytes(&value), true);
        new(buf)
    }

    public fun from_u16(value: u16): Bytes32 {
        let buf = pad_left(&bcs::to_bytes(&value), true);
        new(buf)
    }

    public fun from_u8(value: u8): Bytes32 {
        let buf = pad_left(&bcs::to_bytes(&value), true);
        new(buf)
    }

    public fun from_bytes(buf: &vector<u8>): Bytes32 {
        new(pad_left(buf, false))
    }

    public fun update(
        self: &mut Bytes32,
        data: vector<u8>,
    ) {
        assert!(is_valid(&data), E_INVALID_BYTES32);
        self.data = data;
    }

    public fun data(self: &Bytes32): vector<u8> {
        self.data
    }

    public fun equals(self: &Bytes32, other: &Bytes32): bool {
        self.data == other.data
    }

    public fun is_nonzero(
        self: &Bytes32
    ): bool {
        let i = 0;
        while (i < LEN) {
            if (*vector::borrow(&self.data, i) > 0) {
                return true
            };
            i = i + 1;
        };

        false
    }

    fun is_valid(data: &vector<u8>): bool {
        vector::length(data) == LEN
    }

    fun pad_left(data: &vector<u8>, data_reversed: bool): vector<u8> {
        let out = vector::empty();
        let len = vector::length(data);
        let i = len;
        while (i < 32) {
            vector::push_back(&mut out, 0);
            i = i + 1;
        };
        if (data_reversed) {
            let i = 0;
            while (i < len) {
                vector::push_back(
                    &mut out,
                    *vector::borrow(data, len - i - 1)
                );
                i = i + 1;
            };
        } else {
            vector::append(&mut out, *data);
        };

        out
    }
}

#[test_only]
module hello_token::bytes32_tests {
    use std::vector::{Self};

    use hello_token::bytes32::{Self};

    #[test]
    public fun new() {
        let data =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        assert!(vector::length(&data) == 32, 0);
        let actual = bytes32::new(data);

        assert!(bytes32::data(&actual) == data, 0);
    }

    #[test]
    public fun default() {
        let actual = bytes32::default();
        let expected =
            x"0000000000000000000000000000000000000000000000000000000000000000";
        assert!(bytes32::data(&actual) == expected, 0);
    }

    #[test]
    public fun update() {
        let actual = bytes32::default();
        
        let data =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        assert!(vector::length(&data) == 32, 0);
        bytes32::update(&mut actual, data);
        assert!(bytes32::data(&actual) == data, 0);
    }

    #[test]
    public fun from_u64() {
        let actual = bytes32::from_u64(1 << 32);
        let expected =
            x"0000000000000000000000000000000000000000000000000000000100000000";
        assert!(bytes32::data(&actual) == expected, 0);
    }

    #[test]
    public fun from_u32() {
        let actual = bytes32::from_u32(1 << 16);
        let expected =
            x"0000000000000000000000000000000000000000000000000000000000010000";
        assert!(bytes32::data(&actual) == expected, 0);
    }

    #[test]
    public fun from_u16() {
        let actual = bytes32::from_u16(1 << 8);
        let expected =
            x"0000000000000000000000000000000000000000000000000000000000000100";
        assert!(bytes32::data(&actual) == expected, 0);
    }

    #[test]
    public fun from_u8() {
        let actual = bytes32::from_u8(1);
        let expected =
            x"0000000000000000000000000000000000000000000000000000000000000001";
        assert!(bytes32::data(&actual) == expected, 0);
    }

    #[test]
    public fun from_bytes() {
        let actual = bytes32::from_bytes(&x"deadbeef");
        let expected =
            x"00000000000000000000000000000000000000000000000000000000deadbeef";
        assert!(bytes32::data(&actual) == expected, 0);
    }

    #[test]
    public fun is_nonzero() {
        let data =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        let actual = bytes32::new(data);

        assert!(bytes32::is_nonzero(&actual), 0);

        let zeros = bytes32::default();
        assert!(!bytes32::is_nonzero(&zeros), 0);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=bytes32)]
    public fun cannot_new_non_32_byte_vector() {
        let data =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbe";
        assert!(vector::length(&data) != 32, 0);
        bytes32::new(data);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=bytes32)]
    public fun cannot_update_non_32_byte_vector() {
        let actual = bytes32::default();
        let data =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbe";
        assert!(vector::length(&data) != 32, 0);
        bytes32::update(&mut actual, data);
    }
}
