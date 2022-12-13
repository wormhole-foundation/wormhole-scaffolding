// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

import "../libraries/BytesLib.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./HelloTokenGovernance.sol";
import "./HelloTokenMessages.sol";

/**
 * @title A Cross-Chain HelloToken Application
 * @notice This contract uses Wormhole's token bridge contract to send tokens
 * cross chain with an aribtrary message payload.
 */
contract HelloToken is HelloTokenGovernance, HelloTokenMessages, ReentrancyGuard {
    using BytesLib for bytes;

    /**
     * @notice Deploys the smart contract and sanity checks initial deployment values
     * @dev Sets the owner, wormhole, tokenBridge, chainId, wormholeFinality,
     * feePrecision and relayerFeePercentage state variables. See HelloTokenState.sol
     * for descriptions of each state variable.
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

        // set constructor state variables
        setOwner(msg.sender);
        setWormhole(wormhole_);
        setTokenBridge(tokenBridge_);
        setChainId(chainId_);
        setWormholeFinality(wormholeFinality_);
        setFeePrecision(feePrecision);
        setRelayerFeePercentage(relayerFeePercentage);
    }

    /**
     * @notice Transfers specified tokens to any registered HelloToken contract
     * by invoking the `transferTokensWithPayload` method on the Wormhole token
     * bridge contract. `transferTokensWithPayload` allows the caller to send
     * an arbitrary message payload along with a token transfer. In this case,
     * the arbitrary message includes the transfer recipient's target-chain
     * wallet address.
     * @dev reverts if:
     * - `token` is address(0)
     * - `amount` is zero
     * - `targetRecipient` is bytes32(0)
     * - a registered HelloToken contract does not exist for the `targetChain`
     * - caller doesn't pass enough value to pay the Wormhole network fee
     * - normalized `amount` is zero
     * @param token Address of `token` to be transferred
     * @param amount Amount of `token` to be transferred
     * @param targetChain Wormhole chain ID of the target blockchain
     * @param batchId Wormhole message ID
     * @param targetRecipient Address in bytes32 format (zero-left-padded if
     * less than 20 bytes) of the recipient's wallet on the target blockchain.
     * @return messageSequence Wormhole message sequence for the Wormhole token
     * bridge contract. This sequence is incremented (per message) for each
     * message emitter.
     */
    function sendTokensWithPayload(
        address token,
        uint256 amount,
        uint16 targetChain,
        uint32 batchId,
        bytes32 targetRecipient
    ) public payable nonReentrant returns (uint64 messageSequence) {
        // sanity check function arguments
        require(token != address(0), "token cannot be address(0)");
        require(amount > 0, "amount must be greater than 0");
        require(
            targetRecipient != bytes32(0),
            "targetRecipient cannot be bytes32(0)"
        );

        /**
         * Compute the normalized amount to verify that it's nonzero.
         * The token bridge peforms the same operation before encoding
         * the amount in the `TransferWithPayload` message.
         */
        require(
            normalizeAmount(amount, getDecimals(token)) > 0,
            "normalized amount must be > 0"
        );

        // Cache the target contract address and verify that there
        // is a registered emitter for the specified targetChain.
        bytes32 targetContract = getRegisteredEmitter(targetChain);
        require(targetContract != bytes32(0), "emitter not registered");

        // Cache Wormhole fee value, and confirm that the caller has sent
        // enough value to pay for the Wormhole message fee.
        uint256 wormholeFee = wormhole().messageFee();
        require(msg.value == wormholeFee, "insufficient value");

        // transfer tokens from user to the this contract
        uint256 amountReceived = custodyTokens(token, amount);

        /**
         * Encode instructions (HelloTokenMessage) to send with the token transfer.
         * The `targetRecipient` address is in bytes32 format (zero-left-padded) to
         * support non-evm smart contracts that have addresses that are longer
         * than 20 bytes.
         */
        bytes memory messagePayload = encodePayload(
            HelloTokenMessage({
                payloadID: 1,
                targetRecipient: targetRecipient
            })
        );

        // cache TokenBridge instance
        ITokenBridge bridge = tokenBridge();

        // approve the token bridge to spend the specified tokens
        SafeERC20.safeApprove(
            IERC20(token),
            address(bridge),
            amountReceived
        );

        /**
         * Call `transferTokensWithPayload`method on the token bridge and pay
         * the Wormhole network fee. The token bridge will emit a Wormhole
         * message with an encoded `TransferWithPayload` struct (see the
         * ITokenBridge.sol interface file in this repo).
         */
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
     * @notice Consumes `TransferWithPayload` message which includes the additional
     * `HelloTokenMessage` payload with additional transfer instructions.
     * @dev The token bridge contract calls the Wormhole core endpoint to verify
     * the `TransferWithPayload` message. The token bridge contract saves the message
     * hash in storage to prevent `TransferWithPayload` messages from being replayed.
     * @dev reverts if:
     * - The token being transferred has not been attested yet. This means that a
     * wrapped contract for the token does not exist.
     * - The caller of the token bridge on the source chain is not a registered
     * HelloToken contract.
     * @param encodedTransferMessage Encoded `TransferWithPayload` message
     */
    function redeemTransferWithPayload(bytes memory encodedTransferMessage) public {
        /**
         * parse the encoded Wormhole message
         *
         * SECURITY: This message not been verified by the Wormhole core layer yet.
         * The encoded payload can only be trusted once the message has been verified
         * by the Wormhole core contract. In this case, the message will be verified
         * by a call to the token bridge contract in subsequent actions.
         */
        IWormhole.VM memory parsedMessage = wormhole().parseVM(
            encodedTransferMessage
        );

        /**
         * Since this contract allows transfers for any token, it needs
         * to find the token address (on this chain) before redeeming the transfer
         * so that it can compute the balance change before and after redeeming
         * the transfer. The amount encoded in the payload could be incorrect,
         * since fee-on-transfer tokens are supported by the token bridge.
         *
         * NOTE: The token bridge truncates the encoded amount for any token
         * with decimals greater than 8. This is to support blockchains that
         * cannot handle transfer amounts exceeding max(uint64).
         */
        address localTokenAddress = fetchLocalAddressFromTransferMessage(
            parsedMessage.payload
        );

        // check balance before completing the transfer
        uint256 balanceBefore = getBalance(localTokenAddress);

        // cache the token bridge instance
        ITokenBridge bridge = tokenBridge();

        /**
         * Call `completeTransferWithPayload` on the token bridge. This
         * method acts as a reentrancy protection since it does not allow
         * transfers to be redeemed more than once.
         */
        bytes memory transferPayload = bridge.completeTransferWithPayload(
            encodedTransferMessage
        );

        // compute and save the balance difference after completing the transfer
        uint256 amountTransferred = getBalance(localTokenAddress) - balanceBefore;

        // parse the wormhole message payload into the `TransferWithPayload` struct
        ITokenBridge.TransferWithPayload memory transfer =
            bridge.parseTransferWithPayload(transferPayload);

        // confirm that the message sender is a registered HelloToken contract
        require(
            transfer.fromAddress == getRegisteredEmitter(parsedMessage.emitterChainId),
            "emitter not registered"
        );

        // parse the HelloToken payload from the `TransferWithPayload` struct
        HelloTokenMessage memory helloTokenPayload = decodePayload(
            transfer.payload
        );

        // compute the relayer fee in terms of the transferred token
        uint256 relayerFee = calculateRelayerFee(amountTransferred);

        // cache the recipient address
        address recipient = bytes32ToAddress(helloTokenPayload.targetRecipient);

        /**
         * If the caller is the `transferRecipient` (self redeem) or the relayer fee
         * is set to zero, send the full token amount to the recipient. Otherwise,
         * send the relayer the calculated fee and the recipient the remainder.
         */
        if (relayerFee == 0 || msg.sender == recipient) {
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
                relayerFee
            );

            // send the tokens (less relayer fees) to the recipient
            SafeERC20.safeTransfer(
                IERC20(localTokenAddress),
                recipient,
                amountTransferred - relayerFee
            );
        }
    }

    /**
     * @notice Calculates the amount of tokens to send the redeemer (relayer)
     * in terms of the transferred token based on the set `relayerFeePercentage`
     * on this chain.
     * @param amount The number of tokens being transferred
     * @return Fee Uint256 amount of tokens to send the relayer
     */
    function calculateRelayerFee(uint256 amount) public view returns (uint256) {
        return amount * relayerFeePercentage() / feePrecision();
    }

    /**
     * @notice Parses the encoded address and chainId from a `TransferWithPayload`
     * message. Finds the address of the wrapped token contract if the token is not
     * native to this chain.
     * @param payload Encoded `TransferWithPayload` message
     * @return localAddress Address of the encoded (bytes32 format) token address on
     * this chain.
     */
    function fetchLocalAddressFromTransferMessage(
        bytes memory payload
    ) public view returns (address localAddress) {
        // parse the source token address and chainId
        bytes32 sourceAddress = payload.toBytes32(33);
        uint16 tokenChain = payload.toUint16(65);

        // Fetch the wrapped address from the token bridge if the token
        // is not from this chain.
        if (tokenChain != chainId()) {
            // identify wormhole token bridge wrapper
            localAddress = tokenBridge().wrappedAsset(tokenChain, sourceAddress);
            require(localAddress != address(0), "token not attested");
        } else {
            // return the encoded address if the token is native to this chain
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

        // return the balance difference
        return getBalance(token) - balanceBefore;
    }

    function getBalance(address token) internal view returns (uint256 balance) {
        // fetch the specified token balance for this contract
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

    function getDecimals(
        address token
    ) internal view returns (uint8) {
        (,bytes memory queriedDecimals) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        return abi.decode(queriedDecimals, (uint8));
    }

    function normalizeAmount(
        uint256 amount,
        uint8 decimals
    ) internal pure returns(uint256) {
        if (decimals > 8) {
            amount /= 10 ** (decimals - 8);
        }
        return amount;
    }
}
