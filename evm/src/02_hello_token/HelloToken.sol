// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

import "../libraries/BytesLib.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./HelloTokenGetters.sol";
import "./HelloTokenMessages.sol";

/**
 * @title A Cross-Chain HelloToken Application
 * @notice
 */
contract HelloToken is HelloTokenGetters, HelloTokenMessages, ReentrancyGuard {
    using BytesLib for bytes;

    /**
     * @notice Deploys the smart contract and sanity checks initial deployment values
     * @dev Sets the owner, wormhole, tokenBridge, chainId and wormholeFinality state
     * variables. See HelloTokenState.sol for descriptions of each state variable.
     */
    constructor(
        address wormhole_,
        address tokenBridge_,
        uint16 chainId_,
        uint8 wormholeFinality_
    ) {
        // sanity check input values
        require(wormhole_ != address(0), "invalid Wormhole address");
        require(tokenBridge_ != address(0), "invalid TokenBridge address");
        require(chainId_ > 0, "invalid chainId");
        require(wormholeFinality_ > 0, "invalid wormholeFinality");

        // set constructor state values
        setOwner(msg.sender);
        setWormhole(wormhole_);
        setTokenBridge(tokenBridge_);
        setChainId(chainId_);
        setWormholeFinality(wormholeFinality_);
    }

    /**
     * @notice
     */
    function sendTokensWithPayload(
        address token,
        uint256 amount,
        uint16 targetChain,
        uint32 batchId,
        address targetRecipient
    ) public payable nonReentrant returns (uint64 messageSequence) {
        // sanity check input values
        require(token != address(0), "token cannot be address(0)");
        require(amount > 0, "amount must be greater than 0");
        require(
            targetRecipient != address(0),
            "targetRecipient cannot be address(0)"
        );

        // Cache the target chain contract, and verify that
        // a contract for the target chain has been registered.
        bytes32 targetContract = getRegisteredEmitter(targetChain);
        require(
            targetContract != bytes32(0),
            "target chain must have a registered emitter"
        );

        // cache Wormhole instance and fees to save on gas
        IWormhole wormhole = wormhole();
        uint256 wormholeFee = wormhole.messageFee();

        // Confirm that the caller has sent enough value to pay for the Wormhole
        // message fee.
        require(msg.value == wormholeFee, "insufficient value");

        // transfer tokens to this contract
        custodyTokens(token, amount);

        // Encode message payload to send with the token transfer. We
        // need to convert the targetRecipient address to bytes32
        // (zero-left-padded) to support non-evm smart contracts that
        // have addresses that are longer than 20 bytes.
        bytes memory messagePayload = encodePayload(
            HelloTokenMessage({
                payloadID: 1,
                targetRecipient: addressToBytes32(targetRecipient)
            })
        );

        // cache TokenBridge instance
        ITokenBridge bridge = tokenBridge();

        // approve the TokenBridge to spend the caller's tokens
        SafeERC20.safeApprove(
            IERC20(token),
            address(bridge),
            amount
        );

        // call the TokenBridge `transferTokensWithPayload` method
        messageSequence = bridge.transferTokensWithPayload{value: wormholeFee}(
            token,
            amount,
            targetChain,
            targetContract,
            batchId,
            messagePayload
        );
    }

    function custodyTokens(address token, uint256 amount) internal {
        // query own token balance before transfer
        (, bytes memory queriedBalanceBefore) =
            token.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
        uint256 balanceBefore = abi.decode(queriedBalanceBefore, (uint256));

        // deposit tokens
        SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);

        // query own token balance after transfer
        (, bytes memory queriedBalanceAfter) =
            token.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
        uint256 balanceAfter = abi.decode(queriedBalanceAfter, (uint256));

        require(
            balanceAfter - balanceBefore == amount,
            "fee-on-transfer tokens not supported"
        );
    }

    /**
     * @notice Registers foreign emitters (HelloToken contracts) with this contract
     * @dev Only the deployer (owner) can invoke this method
     * @param emitterChainId Wormhole chainId of the contract being registered.
     * See https://book.wormhole.com/reference/contracts.html for more information.
     * @param emitterAddress 32 byte address of the contract being registered. For EVM
     * contracts the first 12 bytes should be zeros.
     */
    function registerEmitter(
        uint16 emitterChainId,
        bytes32 emitterAddress
    ) public onlyOwner {
        // sanity check the emitterChainId and emitterAddress input values
        require(
            emitterChainId != 0 && emitterChainId != chainId(),
            "emitterChainId cannot equal 0 or this chainId"
        );
        require(
            emitterAddress != bytes32(0),
            "emitterAddress cannot equal bytes32(0)"
        );

        // update the registeredEmitters state variable
        setEmitter(emitterChainId, emitterAddress);
    }

    function addressToBytes32(address address_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(address_)));
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "caller not the owner");
        _;
    }
}
