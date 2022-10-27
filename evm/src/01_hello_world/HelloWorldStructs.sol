// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract HelloWorldStructs {
    struct HelloWorldMessage {
        // unique identifier
        uint8 payloadID;
        // message payload (max size uint256)
        string message;
    }
}