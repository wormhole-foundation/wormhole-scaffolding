// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

contract HelloWorldStorage {
    struct State {
        // owner of this contract
        address owner;

        // address of the Wormhole contract on this chain
        address wormhole;

        // Wormhole chain ID of this contract
        uint16 chainId;

        /**
         * The number of block confirmations needed before the wormhole network
         * will attest a message.
         */
        uint8 wormholeFinality;

        /**
         * Wormhole chain ID to known emitter address mapping. xDapps using
         * Wormhole should register all deployed contracts on each chain to
         * verify that messages being consumed are from trusted contracts.
         */
        mapping(uint16 => bytes32) registeredEmitters;

        // verified message hash to received message mapping
        mapping(bytes32 => string) receivedMessages;

        // verified message hash to boolean
        mapping(bytes32 => bool) consumedMessages;
    }
}

contract HelloWorldState {
    HelloWorldStorage.State _state;
}

