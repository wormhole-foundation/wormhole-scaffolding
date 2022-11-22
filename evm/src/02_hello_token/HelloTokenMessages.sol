// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "../libraries/BytesLib.sol";

import "./HelloTokenStructs.sol";

contract HelloTokenMessages is HelloTokenStructs {
    using BytesLib for bytes;

    /**
     * @notice
     */
    function encodePayload(
        HelloTokenMessage memory parsedMessage
    ) public pure returns (bytes memory encodedMessage) {
        encodedMessage = abi.encodePacked(
            parsedMessage.payloadID, // payloadID = 1
            parsedMessage.targetRecipient,
            parsedMessage.relayerFee,
            parsedMessage.isNative ? uint8(1) : uint8(0)
        );
    }

    /**
     * @notice
     */
    function decodePayload(
        bytes memory encodedMessage
    ) public pure returns (HelloTokenMessage memory parsedMessage) {
        uint256 index = 0;

        // parse payloadId
        parsedMessage.payloadID = encodedMessage.toUint8(index);
        require(parsedMessage.payloadID == 1, "invalid payloadID");
        index += 1;

        // target wallet recipient
        parsedMessage.targetRecipient = encodedMessage.toBytes32(index);
        index += 32;

        // relayer fee percentage
        parsedMessage.relayerFee = encodedMessage.toUint32(index);
        index += 4;

        // boolean value for transfer type (native or token)
        parsedMessage.isNative = encodedMessage.toUint8(index) != 0;
        index += 1;

        // confirm that the payload was the expected size
        require(index == encodedMessage.length, "invalid payload length");
    }
}
