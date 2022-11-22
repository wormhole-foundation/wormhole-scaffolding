// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "./HelloTokenState.sol";

contract HelloTokenSetters is HelloTokenState {
    function setOwner(address owner_) internal {
        _state.owner = owner_;
    }

    function setWormhole(address wormhole_) internal {
        _state.wormhole = payable(wormhole_);
    }

    function setTokenBridge(address tokenBridge_) internal {
        _state.tokenBridge = payable(tokenBridge_);
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

    function setFeePrecision(uint32 feePrecision_) internal {
        _state.feePrecision = feePrecision_;
    }

    function setRelayerFee(uint32 relayerFee_) internal {
        _state.relayerFee = relayerFee_;
    }

    function consumeMessage(bytes32 hash, string memory message) internal {
        _state.receivedMessages[hash] = message;
        _state.consumedMessages[hash] = true;
    }
}
