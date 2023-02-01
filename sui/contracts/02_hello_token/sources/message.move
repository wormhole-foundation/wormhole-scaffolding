module hello_token::message {
    use std::vector::{Self};

    use hello_token::utils::{Self};

    // Errors.
    const E_INVALID_RECIPIENT: u64 = 0;
    const E_INVALID_MESSAGE: u64 = 1;

    // Payload IDs.
    const MESSAGE_HELLO: u8 = 1;

    struct Message has drop {
        recipient: vector<u8>,
    }

    public fun new(recipient: vector<u8>): Message {
        assert!(utils::is_nonzero_bytes32(&recipient), E_INVALID_RECIPIENT);

        Message {
            recipient
        }
    }

    public fun recipient(message: &Message): &vector<u8> {
        &message.recipient
    }

    public fun encode(message: &Message): vector<u8> {
        let serialized = vector::empty<u8>();
        vector::push_back(&mut serialized, MESSAGE_HELLO);
        vector::append(&mut serialized, message.recipient);

        serialized
    }

    public fun decode(serialized: vector<u8>): Message {
        assert!(
            vector::remove(&mut serialized, 0) == MESSAGE_HELLO,
            E_INVALID_MESSAGE
        );
        new(serialized)
    }
}

#[test_only]
module hello_token::message_tests {
    use hello_token::message::{Self};

    #[test]
    public fun new() {
        let recipient =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

        let msg = message::new(recipient);
        assert!(*message::recipient(&msg) == recipient, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=message)]
    public fun cannot_new_non_32_byte_recipient() {
        let recipient = x"deadbeef";

        let msg = message::new(recipient);
        assert!(*message::recipient(&msg) == recipient, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=message)]
    public fun cannot_new_zero_address() {
        let recipient =
            x"0000000000000000000000000000000000000000000000000000000000000000";

        let msg = message::new(recipient);
        assert!(*message::recipient(&msg) == recipient, 0);
    }

    #[test]
    public fun encode() {
        let recipient =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

        let serialized = message::encode(&message::new(recipient));
        let expected = 
            x"01deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        assert!(serialized == expected, 0);
    }

    #[test]
    public fun decode() {
        let recipient =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

        let serialized = message::encode(&message::new(recipient));
        assert!(
            *message::recipient(&message::decode(serialized)) == recipient,
            0
        );
    }

    #[test]
    #[expected_failure(abort_code = 1, location=message)]
    public fun cannot_decode_invalid_payload() {
        let recipient =
            x"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

        let serialized = message::encode(&message::new(recipient));
        *std::vector::borrow_mut(&mut serialized, 0) = 2; // payload ID == 2
        assert!(
            *message::recipient(&message::decode(serialized)) == recipient,
            0
        );
    }
}
