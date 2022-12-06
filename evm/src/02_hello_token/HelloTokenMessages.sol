// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "../libraries/BytesLib.sol";

import "./HelloTokenStructs.sol";

contract HelloTokenMessages is HelloTokenStructs {
    using BytesLib for bytes;

    /**
     * @notice Encodes the HelloTokenMessage struct into bytes
     * @param parsedMessage HelloTokenMessage struct
     * @return encodedMessage HelloTokenMessage struct encoded into bytes
     */
    function encodePayload(
        HelloTokenMessage memory parsedMessage
    ) public pure returns (bytes memory encodedMessage) {
        encodedMessage = abi.encodePacked(
            parsedMessage.payloadID, // payloadID = 1
            parsedMessage.targetRecipient
        );
    }

    /**
     * @notice Decodes bytes into HelloTokenMessage struct
     * @dev reverts if:
     * - the message payloadID is not 1
     * - the encodedMessage length is incorrect
     * @param encodedMessage encoded HelloToken message
     * @return parsedMessage HelloTokenMessage struct
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

        // confirm that the payload was the expected size
        require(index == encodedMessage.length, "invalid payload length");
    }
}
