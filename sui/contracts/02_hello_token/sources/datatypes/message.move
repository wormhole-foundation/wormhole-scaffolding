module hello_token::message {
    use std::vector::{Self};

    use hello_token::bytes32::{Self, Bytes32};

    // Errors.
    const E_INVALID_RECIPIENT: u64 = 0;
    const E_INVALID_MESSAGE: u64 = 1;

    // Payload IDs.
    const MESSAGE_HELLO: u8 = 1;

    struct Message has drop {
        recipient: Bytes32,
    }

    public fun new(recipient: &Bytes32): Message {
        assert!(bytes32::is_nonzero(recipient), E_INVALID_RECIPIENT);
        Message {
            recipient: *recipient
        }
    }

    public fun from_bytes(buf: vector<u8>): Message {
        new(&bytes32::new(buf))
    }

    public fun recipient(self: &Message): &Bytes32 {
        &self.recipient
    }

    public fun encode(self: &Message): vector<u8> {
        let serialized = vector::empty<u8>();
        vector::push_back(&mut serialized, MESSAGE_HELLO);
        vector::append(&mut serialized, bytes32::data(&self.recipient));

        serialized
    }

    public fun decode(buf: vector<u8>): Message {
        assert!(
            vector::remove(&mut buf, 0) == MESSAGE_HELLO,
            E_INVALID_MESSAGE
        );
        new(&bytes32::new(buf))
    }
}

#[test_only]
module hello_token::message_tests {
    use hello_token::bytes32::{Self};
    use hello_token::message::{Self};

    #[test]
    public fun new() {
        let recipient =
            bytes32::new(
                x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
            );

        let msg = message::new(&recipient);
        assert!(bytes32::equals(message::recipient(&msg), &recipient), 0);
    }

    #[test]
    public fun from_bytes() {
        let buf =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

        let msg = message::from_bytes(buf);
        assert!(bytes32::data(message::recipient(&msg)) == buf, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=message)]
    public fun cannot_new_zero_address() {
        message::new(
            &bytes32::new(
                x"0000000000000000000000000000000000000000000000000000000000000000"
            )
        );
    }

    #[test]
    public fun encode() {
        let recipient =
            bytes32::new(
                x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
            );

        let serialized = message::encode(&message::new(&recipient));
        let expected = 
            x"01deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        assert!(serialized == expected, 0);
    }

    #[test]
    public fun decode() {
        let recipient =
            bytes32::new(
                x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
            );

        let serialized = message::encode(&message::new(&recipient));
        assert!(
            bytes32::equals(
                message::recipient(&message::decode(serialized)),
                &recipient,
            ),
            0
        );
    }

    #[test]
    #[expected_failure(abort_code = 1, location=message)]
    public fun cannot_decode_invalid_payload_id() {
        message::decode(
            x"02deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        );
    }

    #[test]
    #[expected_failure(abort_code = 0, location=bytes32)]
    public fun cannot_decode_invalid_recipient() {
        message::decode(x"01deadbeef");
    }
}
