// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

contract HelloTokenStructs {
    struct HelloTokenMessage {
        // unique identifier for this message type
        uint8 payloadID;
        /**
         * The recipient's wallet address on the target chain, in bytes32
         * format (zero-left-padded if less than 20 bytes).
         */
        bytes32 targetRecipient;
        /**
         * Bytes32 associated token account for the bridged token. This field
         * will be empty (bytes32(0)) for outbound EVM transfers.
         */
        bytes32 solanaTokenAccount;
    }
}
