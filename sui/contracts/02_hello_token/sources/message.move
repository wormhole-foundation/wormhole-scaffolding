module hello_token::message {
    use std::vector::{Self};

    use hello_token::utils;

    // Errors.
    const E_INVALID_RECIPIENT: u64 = 0;
    const E_INVALID_MESSAGE: u64 = 1;

    // Payload IDs.
    const MESSAGE_HELLO: u8 = 1;

    struct Message has drop {
        recipient: vector<u8>,
    }

    public fun new(recipient: vector<u8>): Message {
        assert!(utils::is_nonzero_address(&recipient), E_INVALID_RECIPIENT);
        Message {
            recipient
        }
    }

    public fun target_recipient(message: &Message): &vector<u8> {
        &message.recipient
    }

    public fun encode(message: &Message): vector<u8> {
        let out = vector::empty<u8>();
        vector::push_back(&mut out, MESSAGE_HELLO);
        vector::append(&mut out, *target_recipient(message));

        out
    }

    public fun decode(serialized: vector<u8>): Message {
        assert!(
            vector::remove(&mut serialized, 0) == MESSAGE_HELLO,
            E_INVALID_MESSAGE
        );
        new(serialized)
    }
}
