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
            parsedMessage.solanaTokenAccount
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

        // solana token account (relevant for Solana inbound transfers)
        parsedMessage.solanaTokenAccount = encodedMessage.toBytes32(index);
        index += 32;

        // confirm that the payload was the expected size
        require(index == encodedMessage.length, "invalid payload length");
    }
}
