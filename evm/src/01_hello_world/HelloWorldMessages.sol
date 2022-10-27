// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "../libraries/BytesLib.sol";

import "./HelloWorldStructs.sol";

contract HelloWorldMessages is HelloWorldStructs {
    using BytesLib for bytes;

    function encodeMessage(HelloWorldMessage memory parsedMessage) public pure returns (bytes memory) {
        // convert message string to bytes so that we can use the .length attribute
        bytes memory encodedMessagePayload = abi.encodePacked(parsedMessage.message);

        // return the encoded message
        return abi.encodePacked(parsedMessage.payloadID, uint16(encodedMessagePayload.length), encodedMessagePayload);
    }

    function decodeMessage(bytes memory encodedMessage) public pure returns (HelloWorldMessage memory parsedMessage) {
        // starting index for byte parsing
        uint256 index = 0;

        // parse and verify the payloadID
        parsedMessage.payloadID = encodedMessage.toUint8(index);
        require(parsedMessage.payloadID == 1, "invalid payloadID");
        index += 1;

        // parse the message string length
        uint256 messageLength = encodedMessage.toUint16(index);
        index += 2;

        // parse the message string
        bytes memory messageBytes = encodedMessage.slice(index, messageLength);
        parsedMessage.message = string(messageBytes);
        index += messageLength;

        // confirm that the message was the expected length
        require(index == encodedMessage.length, "invalid message length");
    }
}
