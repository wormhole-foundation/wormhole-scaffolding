// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";
import "../libraries/BytesLib.sol";

import "./HelloWorldGetters.sol";
import "./HelloWorldMessages.sol";

contract HelloWorld is HelloWorldGetters, HelloWorldMessages {
    using BytesLib for bytes;

    constructor(address wormhole_, uint16 chainId_, uint8 wormholeFinality_) {
        setOwner(msg.sender);
        setWormhole(wormhole_);
        setChainId(chainId_);
        setWormholeFinality(wormholeFinality_);
    }

    function sendMessage() public payable returns (uint64 messageSequence) {
        // cache wormhole instance and fees to save on gas
        IWormhole wormhole = wormhole();
        uint256 wormholeFee = wormhole.messageFee();

        // Confirm that the caller has sent enough ether to pay for the wormhole
        // message fee.
        require(msg.value == wormholeFee, "insufficient value");

        // create the HelloWorld message struct
        HelloWorldMessage memory parsedMessage = HelloWorldMessage({
            payloadID: uint8(1),
            message: "HelloSolana"
        });

        // encode the HelloWorld message
        bytes memory encodedMessage = encodeMessage(parsedMessage);

        // send the Hello Solana wormhole message
        messageSequence = wormhole.publishMessage{value: wormholeFee}(
            42000, // user specified message ID
            encodedMessage,
            wormholeFinality()
        );
    }

    function receiveMessage(bytes memory encodedMessage) public {
        // call the wormhole core contract to parse and verify the encodedMessage
        (
            IWormhole.VM memory wormholeMessage,
            bool valid,
            string memory reason
        ) = wormhole().parseAndVerifyVM(encodedMessage);

        // confirm that the core layer verified the message
        require(valid, reason);

        // verify that this message was emitted by a trusted contract
        require(verifyEmitter(wormholeMessage), "unknown emitter");

        // decode the message payload into the HelloWorldStruct
        HelloWorldMessage memory parsedMessage = decodeMessage(wormholeMessage.payload);

        /**
         Check to see if this message has been consumed already. If not,
         save the parsed message in the receivedMessages mapping.

         This check can protect against replay attacks in xDapps where messages are
         only meant to be consumed once.
        */
        require(!isMessageConsumed(wormholeMessage.hash), "message already consumed");
        consumeMessage(wormholeMessage.hash, parsedMessage.message);
    }

    function registerEmitter(
        uint16 emitterChainId,
        bytes32 emitterAddress
    ) public onlyOwner {
        // sanity check both input arguments
        require(
            emitterAddress != bytes32(0),
            "emitterAddress cannot equal bytes32(0)"
        );
        require(
            getRegisteredEmitter(emitterChainId) == bytes32(0),
            "emitterAddress already registered"
        );

        // update the registeredEmitters state variable
        setEmitter(emitterChainId, emitterAddress);
    }

    function verifyEmitter(IWormhole.VM memory vm) internal view returns (bool) {
        // Verify that the sender of the wormhole message is a trusted
        // HelloWorld contract.
        if (getRegisteredEmitter(vm.emitterChainId) == vm.emitterAddress) {
            return true;
        }

        return false;
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "only the owner can invoke this method");
        _;
    }
}
