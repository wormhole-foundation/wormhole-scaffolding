// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

contract HelloTokenStructs {
    struct HelloTokenMessage {
        // unique identifier for this message type
        uint8 payloadID;
        bytes32 targetRecipient;
    }
}
