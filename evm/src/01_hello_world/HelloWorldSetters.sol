// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "./HelloWorldState.sol";

contract HelloWorldSetters is HelloWorldState {
    function setOwner(address owner_) internal {
        _state.owner = owner_;
    }

    function setWormhole(address wormhole_) internal {
        _state.wormhole = payable(wormhole_);
    }

    function setChainId(uint16 chainId_) internal {
        _state.chainId = chainId_;
    }

    function setWormholeFinality(uint8 finality) internal {
        _state.wormholeFinality = finality;
    }

    function setEmitter(uint16 chainId, bytes32 emitter) internal {
        _state.registeredEmitters[chainId] = emitter;
    }

    function consumeMessage(bytes32 hash, string memory message) internal {
        _state.receivedMessages[hash] = message;
        _state.consumedMessages[hash] = true;
    }
}
