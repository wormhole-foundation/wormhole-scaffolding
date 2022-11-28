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
        uint8 wormholeFinality_,
        uint32 feePrecision,
        uint32 relayerFeePercentage
    ) {
        // sanity check input values
        require(wormhole_ != address(0), "invalid Wormhole address");
        require(tokenBridge_ != address(0), "invalid TokenBridge address");
        require(chainId_ > 0, "invalid chainId");
        require(wormholeFinality_ > 0, "invalid wormholeFinality");
        require(feePrecision > 0, "invalid fee precision");

        // set constructor state values
        setOwner(msg.sender);
        setWormhole(wormhole_);
        setTokenBridge(tokenBridge_);
        setChainId(chainId_);
        setWormholeFinality(wormholeFinality_);
        setFeePrecision(feePrecision);
        setRelayerFee(relayerFeePercentage);
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
        uint256 amountReceived = custodyTokens(token, amount);

        // Encode message payload to send with the token transfer. We
        // need to convert the targetRecipient address to bytes32
        // (zero-left-padded) to support non-evm smart contracts that
        // have addresses that are longer than 20 bytes.
        bytes memory messagePayload = encodePayload(
            HelloTokenMessage({
                payloadID: 1,
                targetRecipient: addressToBytes32(targetRecipient),
                relayerFee: relayerFee()
            })
        );

        // cache TokenBridge instance
        ITokenBridge bridge = tokenBridge();

        // approve the TokenBridge to spend the caller's tokens
        SafeERC20.safeApprove(
            IERC20(token),
            address(bridge),
            amountReceived
        );

        // call the TokenBridge `transferTokensWithPayload` method
        messageSequence = bridge.transferTokensWithPayload{value: wormholeFee}(
            token,
            amountReceived,
            targetChain,
            targetContract,
            batchId,
            messagePayload
        );
    }

    /**
     * @notice
     */
    function redeemTransferWithPayload(bytes memory encodedTransferMessage) public {
        // call the Token Bridge to the complete the transfer
        (
            ITokenBridge.TransferWithPayload memory transfer,
            address localTokenAddress,
            uint256 amountTransferred
        )
            = _completeTransfer(encodedTransferMessage);

        // parse the HelloToken payload from the `TransferWithPayload` struct
        HelloTokenMessage memory parsedMessage = decodePayload(
            transfer.payload
        );

        // compute the relayer fee
        uint256 feeAmount = calculateRelayerFee(
            amountTransferred,
            parsedMessage.relayerFee
        );

        // cache the recipient address
        address recipient = bytes32ToAddress(parsedMessage.targetRecipient);

        // If the caller is the transferRecipient (self redeem) or the relayer fee
        // is set to zero, send the full token amount to the recipient. Otherwise,
        // send the relayer the calculated fee, and the recipient the remainder.
        if (feeAmount == 0 || msg.sender == recipient) {
            // send the full amount to the recipient
            SafeERC20.safeTransfer(
                IERC20(localTokenAddress),
                recipient,
                amountTransferred
            );
        } else {
            // pay the relayer
            SafeERC20.safeTransfer(
                IERC20(localTokenAddress),
                msg.sender,
                feeAmount
            );

            // send the tokens (less relayer fees) to the recipient
            SafeERC20.safeTransfer(
                IERC20(localTokenAddress),
                recipient,
                amountTransferred - feeAmount
            );
        }
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

    function _completeTransfer(
        bytes memory encodedTransferMessage
    ) internal returns (
        ITokenBridge.TransferWithPayload memory transfer,
        address localTokenAddress,
        uint256 amountTransferred
    ) {
        /**
         * Since this contract allows transfers for any token, it needs
         * to find the token address before redeeming the transfer so that it can
         * compute the balance change before and after redeeming the transfer.
         * The amount encoded in the payload could be incorrect, since fee-on-transfer
         * tokens are supported by the TokenBridge.
         *
         * First, the contract needs to parse the encodedTransferMessage.
         */
        IWormhole.VM memory parsedMessage = wormhole().parseVM(encodedTransferMessage);

        // now fetch the transferred token's address on this chain
        localTokenAddress = fetchLocalAddressFromTransferMessage(parsedMessage.payload);

        // cache the Token Bridge instance
        ITokenBridge bridge = tokenBridge();

        // check balance before completing the transfer
        uint256 balanceBefore = getBalance(localTokenAddress);

        // call``completeTransferWithPayload` on the Token Bridge
        bytes memory transferPayload = bridge.completeTransferWithPayload(
            encodedTransferMessage
        );

        // query token balance after completing the transfer
        uint256 balanceAfter = getBalance(localTokenAddress);

        // parse the encoded transfer message into the TransferWithPayload struct
        transfer = bridge.parseTransferWithPayload(transferPayload);

        // return the computed balance difference
        amountTransferred = balanceAfter - balanceBefore;

        // confirm that the message sender is a registered HelloToken contract
        require(
            transfer.fromAddress == getRegisteredEmitter(parsedMessage.emitterChainId),
            "emitter not registered"
        );
    }

    function calculateRelayerFee(
        uint256 amount,
        uint32 relayerFee_
    ) public view returns (uint256) {
        return amount * relayerFee_ / feePrecision();
    }

    function fetchLocalAddressFromTransferMessage(
        bytes memory payload
    ) public view returns (address localAddress) {
        // parse the source token address and chainId
        bytes32 sourceAddress = payload.toBytes32(33);
        uint16 tokenChain = payload.toUint16(65);

        // Fetch the wrapped address from the token bridge if the token
        // is not from this chain.
        if (tokenChain != chainId()) {
            /// identify wormhole token bridge wrapper
            localAddress = tokenBridge().wrappedAsset(tokenChain, sourceAddress);
            require(localAddress != address(0), "token not attested");
        } else {
            localAddress = bytes32ToAddress(sourceAddress);
        }
    }

    function custodyTokens(
        address token,
        uint256 amount
    ) internal returns (uint256) {
        // query own token balance before transfer
        uint256 balanceBefore = getBalance(token);

        // deposit tokens
        SafeERC20.safeTransferFrom(
            IERC20(token),
            msg.sender,
            address(this),
            amount
        );

        // query own token balance after transfer
        uint256 balanceAfter = getBalance(token);

        // return the balance difference
        return balanceAfter - balanceBefore;
    }

    function getBalance(address token) internal view returns (uint256 balance) {
        (, bytes memory queriedBalance) =
            token.staticcall(
                abi.encodeWithSelector(IERC20.balanceOf.selector, address(this))
            );
        balance = abi.decode(queriedBalance, (uint256));
    }

    function addressToBytes32(address address_) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(address_)));
    }

    function bytes32ToAddress(bytes32 address_) internal pure returns (address) {
        require(bytes12(address_) == 0, "invalid EVM address");
        return address(uint160(uint256(address_)));
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "caller not the owner");
        _;
    }
}
