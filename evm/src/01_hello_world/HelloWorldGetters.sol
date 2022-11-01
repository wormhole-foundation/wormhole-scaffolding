// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

import "./HelloWorldSetters.sol";

contract HelloWorldGetters is HelloWorldSetters {
    function owner() public view returns (address) {
        return _state.owner;
    }

    function wormhole() public view returns (IWormhole) {
        return IWormhole(_state.wormhole);
    }

    function chainId() public view returns (uint16) {
        return _state.chainId;
    }

    function wormholeFinality() public view returns (uint8) {
        return _state.wormholeFinality;
    }

    function getRegisteredEmitter(uint16 emitterChainId) public view returns (bytes32) {
        return _state.registeredEmitters[emitterChainId];
    }

    function getReceivedMessage(bytes32 hash) public view returns (string memory) {
        return _state.receivedMessages[hash];
    }

    function isMessageConsumed(bytes32 hash) public view returns (bool) {
        return _state.consumedMessages[hash];
    }
}
