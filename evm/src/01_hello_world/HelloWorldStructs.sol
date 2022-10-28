// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

contract HelloWorldStructs {
    struct HelloWorldMessage {
        // unique identifier for this message type
        uint8 payloadID;
        // arbitrary message string
        string message;
    }
}
