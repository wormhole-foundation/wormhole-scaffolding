/// This module implements serialization and deserialization for the Hello
/// Token message. This message is a specific message encoded as an arbitrary
/// payload via the Wormhole Token Bridge. The `HelloTokenMessage` only
/// has one field, but the following module can serve as a template for
/// more complicated messages.
module hello_token::message {
    // Standard lib.
    use std::vector;

    // Wormhole dependencies.
    use wormhole::cursor;
    use wormhole::external_address::{Self, ExternalAddress};
    use wormhole::bytes::{Self};

    /// Errors.
    const E_INVALID_MESSAGE: u64 = 0;

    /// Transfer with relay payload ID.
    const MESSAGE_HELLO_TOKEN: u8 = 1;

    /// Container that warehouses transfer information sent from registered
    /// Hello Token contracts.
    struct HelloTokenMessage has drop {
        /// The recipient of the token transfer on the target chain.
        recipient: ExternalAddress,

        // This is where other fields can be encoded in a custom
        // message in your dapp.
    }

    /// Creates new `HelloTokenMessage` type.
    public fun new(
        recipient: ExternalAddress
    ): HelloTokenMessage {
        HelloTokenMessage {
            recipient
        }
    }

    /// Encodes a `HelloTokenMessage` message to be sent by the Wormhole
    /// Token Bridge.
    public fun serialize(transfer_with_relay: HelloTokenMessage): vector<u8> {
        let encoded = vector::empty<u8>();

        // Message payload ID.
        bytes::push_u8(&mut encoded, MESSAGE_HELLO_TOKEN);

        // `recipient`
        vector::append(
            &mut encoded,
            external_address::to_bytes(transfer_with_relay.recipient)
        );

        // Return.
        encoded
    }

    /// Decodes a `HelloTokenMessage` message into the the `HelloTokenMessage`
    /// container.
    public fun deserialize(buf: vector<u8>): HelloTokenMessage {
        let cur = cursor::new(buf);

        // Verify the message type.
        assert!(
            bytes::take_u8(&mut cur) == MESSAGE_HELLO_TOKEN,
            E_INVALID_MESSAGE
        );

        // Deserialize the rest of the payload.
        let recipient = external_address::take_bytes(&mut cur);

        // Destory the cursor.
        cursor::destroy_empty(cur);

        // Return the deserialized struct.
        new(
            recipient
        )
    }

    // Getters.

    public fun recipient(self: &HelloTokenMessage): ExternalAddress {
        self.recipient
    }
}

#[test_only]
module hello_token::message_tests {
    // Hello Token modules.
    use hello_token::message::{Self};

    // Wormhole dependencies.
    use wormhole::external_address::{Self};

    // Test consts.
    const TEST_HELLO_TOKEN_MESSAGE: vector<u8> = x"01000000000000000000000000000000000000000000000000000000000000beef";
    const TEST_RECIPIENT: address = @0xbeef;

    #[test]
    public fun new() {
        let recipient = external_address::from_address(TEST_RECIPIENT);

        // Create a `HelloTokenMessage` struct.
        let transfer_with_relay = message::new(
            recipient
        );

        assert!(
            recipient == message::recipient(&transfer_with_relay),
            0
        );
    }

    #[test]
    public fun serialize() {
        let recipient = external_address::from_address(TEST_RECIPIENT);

        // Create a `HelloTokenMessage` struct.
        let transfer_with_relay = message::new(
            recipient
        );

        // Serialize the struct and confirm it was serialized correctly.
        let serialized_transfer_with_relay = message::serialize(
            transfer_with_relay
        );

        assert!(serialized_transfer_with_relay == TEST_HELLO_TOKEN_MESSAGE, 0);
    }

    #[test]
    public fun deserialize() {
        // Expected output from parsing the encoded message above.
        let recipient = external_address::from_address(TEST_RECIPIENT);

        // Deserialize the `HelloTokenMessage` struct.
        let deserialized_transfer_with_relay =
            message::deserialize(TEST_HELLO_TOKEN_MESSAGE);

        // Confirm that the deserialized struct is correct.
        assert!(
            recipient == message::recipient(
                &deserialized_transfer_with_relay
            ),
            0
        );
    }
}
