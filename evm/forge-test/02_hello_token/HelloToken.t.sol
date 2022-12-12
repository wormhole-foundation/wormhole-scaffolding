// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "forge-std/console.sol";

import {IWETH} from "../../src/interfaces/IWETH.sol";

import {WormholeSimulator} from "wormhole-solidity/WormholeSimulator.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../src/02_hello_token/HelloToken.sol";
import "../../src/02_hello_token/HelloTokenStructs.sol";

/**
 * @title A Test Suite for the EVM HelloToken Contracts
 */
contract HelloTokenTest is Test {
    // guardian private key for simulated signing of Wormhole messages
    uint256 guardianSigner;

    // relayer fee precision
    uint32 relayerFeePrecision;

    // ethereum test info
    uint16 ethereumChainId;
    address ethereumTokenBridge;
    address weth;

    // contract instances
    IWETH wavax;
    IWormhole wormhole;
    ITokenBridge bridge;
    WormholeSimulator wormholeSimulator;
    HelloToken helloToken;

    // used to compute balance changes before/after redeeming token transfers
    struct Balances {
        uint256 recipientBefore;
        uint256 recipientAfter;
        uint256 relayerBefore;
        uint256 relayerAfter;
    }

    /**
     * @notice Sets up the wormholeSimulator contracts and deploys HelloToken
     * contracts before each test is executed.
     */
    function setUp() public {
        // verify that we're using the correct fork (AVAX mainnet in this case)
        require(block.chainid == vm.envUint("TESTING_AVAX_FORK_CHAINID"), "wrong evm");

        // this will be used to sign Wormhole messages
        guardianSigner = uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN"));

        // set up Wormhole using Wormhole existing on AVAX mainnet
        wormholeSimulator = new WormholeSimulator(
            vm.envAddress("TESTING_AVAX_WORMHOLE_ADDRESS"),
            guardianSigner
        );

        // we may need to interact with Wormhole throughout the test
        wormhole = wormholeSimulator.wormhole();

        // verify Wormhole state from fork
        require(
            wormhole.chainId() == uint16(vm.envUint("TESTING_AVAX_WORMHOLE_CHAINID")),
            "wrong chainId"
        );
        require(
            wormhole.messageFee() == vm.envUint("TESTING_AVAX_WORMHOLE_MESSAGE_FEE"),
            "wrong messageFee"
        );
        require(
            wormhole.getCurrentGuardianSetIndex() == uint32(
                vm.envUint("TESTING_AVAX_WORMHOLE_GUARDIAN_SET_INDEX")
            ),
            "wrong guardian set index"
        );

        // instantiate wavax interface
        wavax = IWETH(vm.envAddress("TESTING_WRAPPED_AVAX_ADDRESS"));

        // instantiate TokenBridge interface
        bridge = ITokenBridge(vm.envAddress("TESTING_AVAX_BRIDGE_ADDRESS"));

        // set the ethereum token bridge, chainId and WETH addresses
        ethereumTokenBridge = vm.envAddress("TESTING_ETH_BRIDGE_ADDRESS");
        ethereumChainId = uint16(vm.envUint("TESTING_ETH_WORMHOLE_CHAINID"));
        weth = vm.envAddress("TESTING_WRAPPED_ETH_ADDRESS");

        // relayer fee percentage and precision
        relayerFeePrecision = 1e6;
        uint32 relayerFeePercentage = 1000; // 10 basis point

        // deploy the HelloToken contract
        helloToken = new HelloToken(
            address(wormhole),
            address(bridge),
            wormhole.chainId(),
            uint8(1), // wormhole finality
            relayerFeePrecision,
            relayerFeePercentage
        );
    }

    function wrapAvax(uint256 amount) internal {
        // wrap specified amount of WAVAX
        wavax.deposit{value: amount}();
    }

    function addressToBytes32(address address_) internal pure returns (bytes32) {
        // convert address to bytes32 (left-zero-padded if less than 20 bytes)
        return bytes32(uint256(uint160(address_)));
    }

    function normalizeAmount(
        uint256 amount,
        uint8 decimals
    ) internal pure returns(uint256) {
        // Truncate amount if decimals are greater than 8, this is to support
        // blockchains that can't handle uint256 type amounts.
        if (decimals > 8) {
            amount /= 10 ** (decimals - 8);
        }
        return amount;
    }

    function denormalizeAmount(
        uint256 amount,
        uint8 decimals
    ) internal pure returns(uint256) {
        // convert truncated amount back to original format
        if (decimals > 8) {
            amount *= 10 ** (decimals - 8);
        }
        return amount;
    }

    function getBalance(
        address token,
        address wallet
    ) internal view returns (uint256 balance) {
        (, bytes memory queriedBalance) =
            token.staticcall(
                abi.encodeWithSelector(IERC20.balanceOf.selector, wallet)
            );
        balance = abi.decode(queriedBalance, (uint256));
    }

    function getDecimals(
        address token
    ) internal view returns (uint8 decimals) {
        (,bytes memory queriedDecimals) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        decimals = abi.decode(queriedDecimals, (uint8));
    }

    function getTransferWithPayloadMessage(
        ITokenBridge.TransferWithPayload memory transfer,
        uint16 emitterChainId,
        bytes32 emitterAddress
    ) internal returns (bytes memory signedTransfer) {
        // construct `TransferWithPayload` Wormhole message
        IWormhole.VM memory vm;

        // set the vm values inline
        vm.version = uint8(1);
        vm.timestamp = uint32(block.timestamp);
        vm.emitterChainId = emitterChainId;
        vm.emitterAddress = emitterAddress;
        vm.sequence = wormhole.nextSequence(
            address(uint160(uint256(emitterAddress)))
        );
        vm.consistencyLevel = bridge.finality();
        vm.payload = bridge.encodeTransferWithPayload(transfer);

        // encode the bservation
        signedTransfer = wormholeSimulator.encodeAndSignMessage(vm);
    }

    /**
     * @notice This test confirms that the contracts are able to serialize and
     * deserialize the HelloToken message correctly.
     */
    function testMessageDeserialization(bytes32 targetRecipient) public {
        vm.assume(targetRecipient != bytes32(0));

        // encode the message by calling the encodePayload method
        bytes memory encodedMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: targetRecipient
            })
        );

        // decode the message by calling the decodePayload method
        HelloTokenStructs.HelloTokenMessage memory results =
            helloToken.decodePayload(encodedMessage);

        // verify the parsed output
        assertEq(results.payloadID, 1);
        assertEq(results.targetRecipient, targetRecipient);
    }

    /**
     * @notice This test confirms that decodePayload reverts when a message
     * has an unexpected payloadID.
     */
    function testIncorrectMessagePayload() public {
        // create garbage targetRecipient address
        bytes32 targetRecipient = bytes32(uint256(uint160(address(this))));

        // encode the message by calling the encodePayload method
        bytes memory encodedMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(2), // encode wrong payloadID
                targetRecipient: targetRecipient
            })
        );

        // expect a revert when trying to decode a message the wrong payloadID
        vm.expectRevert("invalid payloadID");
        helloToken.decodePayload(encodedMessage);
    }

    /**
     * @notice This test confirms that decodePayload reverts when a message
     * is an unexpected length.
     */
    function testIncorrectMessageLength() public {
        // create garbage targetRecipient address
        bytes32 targetRecipient = bytes32(uint256(uint160(address(this))));

        // encode the message by calling the encodePayload method
        bytes memory encodedMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: targetRecipient
            })
        );

        // add some bytes to the encodedMessage
        encodedMessage = abi.encodePacked(
            encodedMessage,
            uint256(42000) // random bytes
        );

        // expect a revert when trying to decode a message an invalid length
        vm.expectRevert("invalid payload length");
        helloToken.decodePayload(encodedMessage);
    }

    /**
     * @notice This test confirms that the owner can correctly register a foreign emitter
     * with the HelloToken contracts.
     */
    function testRegisterEmitter(
        bytes32 newEmitterAddress
    ) public {
        vm.assume(newEmitterAddress != bytes32(0));

        // cache the new emitter info
        uint16 newEmitterChainId = ethereumChainId;

        // register the emitter with the owner's wallet
        helloToken.registerEmitter(newEmitterChainId, newEmitterAddress);

        // verify that the contract state was updated correctly
        bytes32 emitterInContractState = helloToken.getRegisteredEmitter(
            ethereumChainId
        );
        assertEq(emitterInContractState, newEmitterAddress);
    }

    /**
     * @notice This test confirms that ONLY the owner can register a foreign emitter
     * with the HelloToken contracts.
     */
    function testRegisterEmitterNotOwner(
        bytes32 newEmitterAddress
    ) public {
        vm.assume(newEmitterAddress != bytes32(0));

        // cache the new emitter info
        uint16 newEmitterChainId = ethereumChainId;

        // prank the caller address to something different than the owner's address
        vm.prank(address(wormholeSimulator));

        // expect the registerEmitter call to revert
        vm.expectRevert("caller not the owner");
        helloToken.registerEmitter(newEmitterChainId, newEmitterAddress);
    }

    /**
     * @notice This test confirms that the owner can correctly update the
     * relayer fee.
     */
    function testUpdateRelayerFee(uint32 relayerFeePercentage) public {
        vm.assume(
            relayerFeePercentage < helloToken.feePrecision() &&
            relayerFeePercentage != helloToken.relayerFeePercentage()
        );

        // set the new relayer fee
        helloToken.updateRelayerFee(
            relayerFeePercentage,
            relayerFeePrecision
        );
        assertEq(helloToken.relayerFeePercentage(), relayerFeePercentage);
    }

    /**
     * @notice This test confirms that ONLY the owner can update the relayer fee.
     */
    function testUpdateRelayerFeeNotOwner(uint32 relayerFeePercentage) public {
        vm.assume(
            relayerFeePercentage < helloToken.feePrecision() &&
            relayerFeePercentage != helloToken.relayerFeePercentage()
        );

        // prank the caller address to something different than the owner's address
        vm.prank(address(wormholeSimulator));

        // expect the updateRelayerFee call to revert
        vm.expectRevert("caller not the owner");
        helloToken.updateRelayerFee(relayerFeePercentage, relayerFeePrecision);
    }

    /**
     * @notice This test confirms that the owner can't update the relayerFeePrecision
     * to a value of zero.
     */
    function testUpdateRelayerFeeZeroPrecision(uint32 relayerFeePercentage) public {
        // expect the updateRelayerFee call to revert
        vm.expectRevert("precision must be > 0");
        helloToken.updateRelayerFee(
            relayerFeePercentage,
            0
        );
    }

    /**
     * @notice This test confirms that the owner can't update the relayerFeePercentage
     * to a value greater than the feePrecision.
     */
    function testUpdateRelayerFeePrecisionLessThanPercentage() public {
        uint32 relayerFeePercentage = 42000;
        uint32 relayerFeePrecision_ = relayerFeePercentage - 69;

        // expect the updateRelayerFee call to revert
        vm.expectRevert("relayer fee percentage must be < precision");
        helloToken.updateRelayerFee(
            relayerFeePercentage,
            relayerFeePrecision_
        );
    }

    /**
     * @notice This test confirms that the `sendTokensWithPayload` method correctly sends
     * a token with an addtional payload.
     */
    function testSendTokensWithPayload(
        uint256 amount,
        bytes32 targetRecipient,
        bytes32 ethereumEmitter
    ) public {
        vm.assume(amount > 1e10 && amount < type(uint96).max);
        vm.assume(targetRecipient != bytes32(0));
        vm.assume(
            ethereumEmitter != bytes32(0) &&
            bytes12(ethereumEmitter) == 0
        );

        // wrap some avax
        wrapAvax(amount);

        // register the emitter on the source contract
        helloToken.registerEmitter(
            ethereumChainId,
            ethereumEmitter
        );

        // start listening to events
        vm.recordLogs();

        // approve the HelloToken contract to spend wavax
        SafeERC20.safeApprove(
            IERC20(address(wavax)),
            address(helloToken),
            amount
        );

        // call the source HelloToken contract to transfer tokens to ethereum
        uint64 sequence = helloToken.sendTokensWithPayload(
            address(wavax),
            amount,
            ethereumChainId,
            0, // opt out of batching
            targetRecipient
        );

        // record the emitted Wormhole message
        Vm.Log[] memory logs = vm.getRecordedLogs();
        require(logs.length > 0, "no events recorded");

        // find published wormhole messages from log
        Vm.Log[] memory publishedMessages =
            wormholeSimulator.fetchWormholeMessageFromLog(logs, 1);

        // simulate signing the Wormhole message
        // NOTE: in the wormhole-sdk, signed Wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(
            publishedMessages[0],
            helloToken.chainId(),
            address(helloToken)
        );

        // parse and verify the message
        (
            IWormhole.VM memory wormholeMessage,
            bool valid,
            string memory reason
        ) = wormhole.parseAndVerifyVM(encodedMessage);
        require(valid, reason);

        // call the token bridge to parse the TransferWithPayload message
        ITokenBridge.TransferWithPayload memory transfer =
            bridge.parseTransferWithPayload(wormholeMessage.payload);

        /**
         * The token bridge normalizes the transfer amount to support
         * blockchains that don't support type uint256. We need to normalize the
         * amount we passed to the contract to compare the value against what
         * is encoded in the payload.
         */
        assertEq(
            transfer.amount,
            normalizeAmount(amount, getDecimals(address(wavax)))
        );

        // verify the remaining TransferWithPayload values
        assertEq(transfer.tokenAddress, addressToBytes32(address(wavax)));
        assertEq(transfer.tokenChain, helloToken.chainId());
        assertEq(transfer.to, ethereumEmitter);
        assertEq(transfer.toChain, ethereumChainId);
        assertEq(transfer.fromAddress, addressToBytes32(address(helloToken)));
        assertEq(transfer.amount > 0, true);

        // verify VAA values
        assertEq(wormholeMessage.sequence, sequence);
        assertEq(wormholeMessage.nonce, 0); // batchID
        assertEq(wormholeMessage.consistencyLevel, helloToken.wormholeFinality());

        // parse additional payload and verify the values
        HelloTokenStructs.HelloTokenMessage memory message =
            helloToken.decodePayload(transfer.payload);

        assertEq(message.payloadID, 1);
        assertEq(message.targetRecipient, targetRecipient);
    }

    /**
     * @notice This test confirms that the `sendTokensWithPayload` method reverts when
     * the `amount` is zero.
     */
    function testSendTokensWithPayloadAmountZero() public {
        uint256 amount = 0;
        address token = address(wavax);
        bytes32 targetRecipient = addressToBytes32(address(this));

        // call `sendTokensWithPayload` should revert
        vm.expectRevert("amount must be greater than 0");
        helloToken.sendTokensWithPayload(
            token,
            amount,
            ethereumChainId,
            0, // opt out of batching
            targetRecipient
        );
    }

    /**
     * @notice This test confirms that the `sendTokensWithPayload` method reverts when
     * the `targetRecipient` is the zero address (bytes32 format).
     */
    function testSendTokensWithPayloadInvalidRecipient() public {
        uint256 amount = 1e18;
        address token = address(wavax);
        bytes32 targetRecipient = bytes32(0);

        // call `sendTokensWithPayload` should revert
        vm.expectRevert("targetRecipient cannot be bytes32(0)");
        helloToken.sendTokensWithPayload(
            token,
            amount,
            ethereumChainId,
            0, // opt out of batching
            targetRecipient
        );
    }

    /**
     * @notice This test confirms that the `sendTokensWithPayload` method reverts when
     * the `token` is the zero address.
     */
    function testSendTokensWithPayloadInvalidToken() public {
        uint256 amount = 1e18;
        address token = address(0);
        bytes32 targetRecipient = addressToBytes32(address(this));

        // call `sendTokensWithPayload` should revert
        vm.expectRevert("token cannot be address(0)");
        helloToken.sendTokensWithPayload(
            token,
            amount,
            ethereumChainId,
            0, // opt out of batching
            targetRecipient
        );
    }

    /**
     * @notice This test confirms that the `sendTokensWithPayload` method reverts when
     * the targetChain does not have a registered emitter.
     */
    function testSendTokensWithPayloadInvalidTargetContract() public {
        uint256 amount = 1e19;
        bytes32 targetRecipient = addressToBytes32(address(this));
        uint16 targetChain = 6;

        // call `sendTokensWithPayload` should revert
        vm.expectRevert("emitter not registered");
        helloToken.sendTokensWithPayload(
            address(wavax),
            amount,
            targetChain,
            0, // opt out of batching
            targetRecipient
        );
    }

    /**
     * @notice This test confirms that the `sendTokensWithPayload` method reverts when
     * the normalized amount is zero.
     */
    function testSendTokensWithPayloadInvalidNormalizedAmount(uint256 amount) public {
        vm.assume(amount > 0 && amount < 1e10);

        // NOTE: the token needs to have 18 decimals for this test to pass
        address token = address(wavax);
        bytes32 targetRecipient = addressToBytes32(address(this));
        uint16 targetChain = 69;

        // register the emitter on the source contract
        helloToken.registerEmitter(
            targetChain,
            targetRecipient
        );

        // call `sendTokensWithPayload` should revert
        vm.expectRevert("normalized amount must be > 0");
        helloToken.sendTokensWithPayload(
            token,
            amount,
            targetChain,
            0, // opt out of batching
            targetRecipient
        );
    }

    /**
     * @notice This test confirms that HelloToken correctly redeems wrapped
     * tokens to the encoded recipient and handles relayer payments correctly.
     */
    function testRedeemTransferWithPayloadWrappedToken(uint256 amount) public {
        vm.assume(
            amount > 1e10 &&
            amount < type(uint256).max / helloToken.relayerFeePercentage()
        );

        // create a bogus eth emitter address
        bytes32 ethereumEmitter = addressToBytes32(address(this));

        // Fetch the wrapped weth contract on avalanche, since the token
        // address encoded in the signedMessage is weth from Ethereum.
        address wrappedAsset = bridge.wrappedAsset(
            ethereumChainId,
            addressToBytes32(weth)
        );
        uint8 tokenDecimals = getDecimals(wrappedAsset);

        // Normalize and denormalize the transfer amount the same way the
        // token bridge does.
        uint256 normalizedAmount = normalizeAmount(amount, tokenDecimals);
        uint256 denormalizedAmount = denormalizeAmount(
            normalizedAmount,
            tokenDecimals
        );

        // encode the message by calling the encodePayload method
        bytes memory encodedHelloTokenMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: addressToBytes32(address(this))
            })
        );

        // Create a simulated version of the wormhole message that the
        // HelloToken contract will emit.
        ITokenBridge.TransferWithPayload memory transfer =
            ITokenBridge.TransferWithPayload({
                payloadID: uint8(3), // payload3 transfer
                amount: normalizedAmount,
                tokenAddress: addressToBytes32(weth),
                tokenChain: ethereumChainId,
                to: addressToBytes32(address(helloToken)),
                toChain: helloToken.chainId(),
                fromAddress: ethereumEmitter,
                payload: encodedHelloTokenMessage
            });

        // Encode the TransferWithPayload struct and simulate signing
        // the message with the devnet guardian key.
        bytes memory signedMessage = getTransferWithPayloadMessage(
            transfer,
            ethereumChainId,
            addressToBytes32(ethereumTokenBridge)
        );

        // register the emitter on the source contract
        helloToken.registerEmitter(ethereumChainId, ethereumEmitter);

        // store balances in the Balances struct (reduces local variable count)
        Balances memory balances;
        balances.recipientBefore = getBalance(wrappedAsset, address(this));
        balances.relayerBefore = getBalance(wrappedAsset, vm.addr(guardianSigner));

        /**
         * Call redeemTransferWithPayload using the signed VM. Prank the
         * calling address to confirm that the relayer fees are paid
         * out correctly.
         */
        vm.prank(vm.addr(guardianSigner));
        helloToken.redeemTransferWithPayload(signedMessage);

        // check balance of wrapped weth after redeeming the transfer
        balances.recipientAfter = getBalance(wrappedAsset, address(this));
        balances.relayerAfter = getBalance(wrappedAsset, vm.addr(guardianSigner));

        // compute the relayer fee
        uint256 relayerFee = helloToken.calculateRelayerFee(denormalizedAmount);

        // confirm balance changes on the caller and recipient
        assertEq(
            balances.recipientAfter - balances.recipientBefore,
            denormalizedAmount - relayerFee
        );
        assertEq(balances.relayerAfter - balances.relayerBefore, relayerFee);
    }

    /**
     * @notice This test confirms that HelloToken correctly redeems native
     * tokens to the encoded recipient and handles relayer payments correctly.
     * In this case, native tokens means that the token originates on the
     * target blockchain (the HelloToken chain).
     */
    function testRedeemTransferWithPayloadNativeToken(
        uint256 amount
    ) public {
        // save the WAVAX address
        address wavaxAddress = address(wavax);
        uint8 tokenDecimals = getDecimals(wavaxAddress);

        // create a bogus eth emitter address
        bytes32 ethereumEmitter = addressToBytes32(address(this));

        // can't transfer more than the outstanding supply
        vm.assume(
            amount > 1e10 &&
            amount < bridge.outstandingBridged(wavaxAddress)
        );

        // Normalize and denormalize the transfer amount the same way the
        // token bridge does.
        uint256 normalizedAmount = normalizeAmount(amount, tokenDecimals);
        uint256 denormalizedAmount = denormalizeAmount(normalizedAmount, tokenDecimals);

        // encode the message by calling the encodePayload method
        bytes memory encodedHelloTokenMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: addressToBytes32(address(this))
            })
        );

        /**
         * Create a simulated version of the wormhole message that the
         * HelloToken contract will emit. The token bridge will convert
         * the wrapped avax token address to the native token on the target chain,
         * so we need to encode the wavax address in the TransferWithPayload
         * struct.
         */
        ITokenBridge.TransferWithPayload memory transfer =
            ITokenBridge.TransferWithPayload({
                payloadID: uint8(3), // payload3 transfer
                amount: normalizedAmount,
                tokenAddress: addressToBytes32(wavaxAddress),
                tokenChain: helloToken.chainId(),
                to: addressToBytes32(address(helloToken)),
                toChain: helloToken.chainId(),
                fromAddress: ethereumEmitter,
                payload: encodedHelloTokenMessage
            });

        // Encode the TransferWithPayload struct and simulate signing
        // the message with the devnet guardian key.
        bytes memory signedMessage = getTransferWithPayloadMessage(
            transfer,
            ethereumChainId,
            addressToBytes32(ethereumTokenBridge)
        );

        // register the emitter on the source contract
        helloToken.registerEmitter(ethereumChainId, ethereumEmitter);

        // store balances in the Balances struct (reduces local variable count)
        Balances memory balances;
        balances.recipientBefore = getBalance(wavaxAddress, address(this));
        balances.relayerBefore = getBalance(wavaxAddress, vm.addr(guardianSigner));

        /**
         * Call redeemTransferWithPayload using the signed VM. Prank the
         * calling address to confirm that the relayer fees are paid
         * out correctly.
         */
        vm.prank(vm.addr(guardianSigner));
        helloToken.redeemTransferWithPayload(signedMessage);

        // check balance of wavax after redeeming the transfer
        balances.recipientAfter = getBalance(wavaxAddress, address(this));
        balances.relayerAfter = getBalance(wavaxAddress, vm.addr(guardianSigner));

        // compute the relayer fee
        uint256 relayerFee = helloToken.calculateRelayerFee(denormalizedAmount);

        // confirm balance changes on the caller and recipient
        assertEq(
            balances.recipientAfter - balances.recipientBefore,
            denormalizedAmount - relayerFee
        );
        assertEq(balances.relayerAfter - balances.relayerBefore, relayerFee);
    }

    /**
     * @notice This test confirms that HelloToken correctly redeems wrapped
     * tokens to the encoded recipient and handles relayer payments correctly.
     * This test explicitly sets the relayerFeePercentage to zero to confirm
     * that the recipient receives the full amount when relayer fees are
     * disabled.
     */
    function testRedeemTransferWithPayloadWrappedTokenZeroRelayerFee(
        uint256 amount
    ) public {
        vm.assume(
            amount > 1e10 &&
            amount < type(uint256).max / helloToken.relayerFeePercentage()
        );

        // create a bogus eth emitter address
        bytes32 ethereumEmitter = addressToBytes32(address(this));

        // Fetch the wrapped weth contract on avalanche, since the token
        // address encoded in the signedMessage is weth from Ethereum.
        address wrappedAsset = bridge.wrappedAsset(
            ethereumChainId,
            addressToBytes32(weth)
        );
        uint8 tokenDecimals = getDecimals(wrappedAsset);

        // Normalize and denormalize the transfer amount the same way the
        // token bridge does.
        uint256 normalizedAmount = normalizeAmount(amount, tokenDecimals);
        uint256 denormalizedAmount = denormalizeAmount(
            normalizedAmount,
            tokenDecimals
        );

        // encode the message by calling the encodePayload method
        bytes memory encodedHelloTokenMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: addressToBytes32(address(this))
            })
        );

        // Create a simulated version of the wormhole message that the
        // HelloToken contract will emit.
        ITokenBridge.TransferWithPayload memory transfer =
            ITokenBridge.TransferWithPayload({
                payloadID: uint8(3), // payload3 transfer
                amount: normalizedAmount,
                tokenAddress: addressToBytes32(weth),
                tokenChain: ethereumChainId,
                to: addressToBytes32(address(helloToken)),
                toChain: helloToken.chainId(),
                fromAddress: ethereumEmitter,
                payload: encodedHelloTokenMessage
            });

        // Encode the TransferWithPayload struct and simulate signing
        // the message with the devnet guardian key.
        bytes memory signedMessage = getTransferWithPayloadMessage(
            transfer,
            ethereumChainId,
            addressToBytes32(ethereumTokenBridge)
        );

        // register the emitter on the source contract
        helloToken.registerEmitter(ethereumChainId, ethereumEmitter);

        // NOTE: update the relayer fee to 0
        helloToken.updateRelayerFee(0, relayerFeePrecision);
        assertEq(helloToken.relayerFeePercentage(), 0);

        // store balances in the Balances struct (reduces local variable count)
        Balances memory balances;
        balances.recipientBefore = getBalance(wrappedAsset, address(this));
        balances.relayerBefore = getBalance(wrappedAsset, vm.addr(guardianSigner));

        /**
         * Call redeemTransferWithPayload using the signed VM. Prank the
         * calling address to confirm that the relayer fees are paid
         * out correctly.
         */
        vm.prank(vm.addr(guardianSigner));
        helloToken.redeemTransferWithPayload(signedMessage);

        // check balance of wavax after redeeming the transfer
        balances.recipientAfter = getBalance(wrappedAsset, address(this));
        balances.relayerAfter = getBalance(wrappedAsset, vm.addr(guardianSigner));

        // confirm that the recipient received the full amount of tokens
        assertEq(
            balances.recipientAfter - balances.recipientBefore,
            denormalizedAmount
        );

        // confirm that the relayer didn't receive any tokens
        assertEq(balances.relayerAfter - balances.relayerBefore, 0);
    }

    /**
     * @notice This test confirms that HelloToken correctly redeems native
     * tokens to the encoded recipient and handles relayer payments correctly.
     * This test explicitly calls the redeemTransferWithPayload method from
     * the recipient wallet to confirm that the contract handles relayer
     * payments correctly.
     */
    function testRedeemTransferWithPayloadNativeTokenWithoutRelayer(
        uint256 amount
    ) public {
        // save the WAVAX address
        address wavaxAddress = address(wavax);
        uint8 tokenDecimals = getDecimals(wavaxAddress);

        // create a bogus eth emitter address
        bytes32 ethereumEmitter = addressToBytes32(address(this));

        // can't transfer more than the outstanding supply
        vm.assume(
            amount > 1e10 &&
            amount < bridge.outstandingBridged(wavaxAddress)
        );

        // Normalize and denormalize the transfer amount the same way the
        // token bridge does.
        uint256 normalizedAmount = normalizeAmount(amount, tokenDecimals);
        uint256 denormalizedAmount = denormalizeAmount(normalizedAmount, tokenDecimals);

        // encode the message by calling the encodePayload method
        bytes memory encodedHelloTokenMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: addressToBytes32(address(this))
            })
        );

        /**
         * Create a simulated version of the wormhole message that the
         * HelloToken contract will emit. The token bridge will convert
         * the wrapped avax token address to the native token on the target chain,
         * so we need to encode the wavax address in the TransferWithPayload
         * struct.
         */
        ITokenBridge.TransferWithPayload memory transfer =
            ITokenBridge.TransferWithPayload({
                payloadID: uint8(3), // payload3 transfer
                amount: normalizedAmount,
                tokenAddress: addressToBytes32(wavaxAddress),
                tokenChain: helloToken.chainId(),
                to: addressToBytes32(address(helloToken)),
                toChain: helloToken.chainId(),
                fromAddress: ethereumEmitter,
                payload: encodedHelloTokenMessage
            });

        // Encode the TransferWithPayload struct and simulate signing
        // the message with the devnet guardian key.
        bytes memory signedMessage = getTransferWithPayloadMessage(
            transfer,
            ethereumChainId,
            addressToBytes32(ethereumTokenBridge)
        );

        // register the emitter on the source contract
        helloToken.registerEmitter(ethereumChainId, ethereumEmitter);

        // store balance of the recipient before redeeming the transfer
        Balances memory balances;
        balances.recipientBefore = getBalance(wavaxAddress, address(this));

        // call redeemTransferWithPayload using the signed VM
        helloToken.redeemTransferWithPayload(signedMessage);

        // Check balance of wavax after redeeming the transfer. The recipient
        // should receive the entire amount.
        balances.recipientAfter = getBalance(wavaxAddress, address(this));

        // confirm balance changes on the caller and recipient
        assertEq(
            balances.recipientAfter - balances.recipientBefore,
            denormalizedAmount
        );
    }

    /**
     * @notice This test confirms that the HelloToken contract reverts
     * when attempting to redeem a transfer for an unattested token.
     */
    function testRedeemTransferWithPayloadUnattestedToken() public {
        uint256 amount = 1e18;
        bytes32 ethereumEmitter = addressToBytes32(address(this));

        // instantiate a bogus emitter and token
        IERC20 unattestedToken = IERC20(address(this));

        // Normalize and denormalize the transfer amount the same way the
        // token bridge does.
        uint256 normalizedAmount = normalizeAmount(amount, 18);

        // encode the message by calling the encodePayload method
        bytes memory encodedHelloTokenMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: addressToBytes32(address(this))
            })
        );

        /**
         * Create a simulated version of the wormhole message that the
         * HelloToken contract will emit. Encode an unattested token
         * in the payload.
         */
        ITokenBridge.TransferWithPayload memory transfer =
            ITokenBridge.TransferWithPayload({
                payloadID: uint8(3), // payload3 transfer
                amount: normalizedAmount,
                tokenAddress: addressToBytes32(address(unattestedToken)),
                tokenChain: ethereumChainId,
                to: addressToBytes32(address(helloToken)),
                toChain: helloToken.chainId(),
                fromAddress: ethereumEmitter,
                payload: encodedHelloTokenMessage
            });

        // Encode the TransferWithPayload struct and simulate signing
        // the message with the devnet guardian key.
        bytes memory signedMessage = getTransferWithPayloadMessage(
            transfer,
            ethereumChainId,
            addressToBytes32(ethereumTokenBridge)
        );

        // register the emitter on the source contract
        helloToken.registerEmitter(ethereumChainId, ethereumEmitter);

        // redeemTransferWithPayload should revert
        vm.expectRevert("token not attested");
        helloToken.redeemTransferWithPayload(signedMessage);
    }

     /**
     * @notice This test confirms that HelloToken correctly reverts
     * when receiving a `TransferWithPayload` message from an
     * unregistered emitter.
     */
    function testRedeemTransferWithPayloadInvalidSender() public {
        uint256 amount = 1e18;
        bytes32 ethereumEmitter = addressToBytes32(address(this));

        // save the WAVAX address
        address wavaxAddress = address(wavax);
        uint8 tokenDecimals = getDecimals(wavaxAddress);

        // Normalize and denormalize the transfer amount the same way the
        // token bridge does.
        uint256 normalizedAmount = normalizeAmount(amount, tokenDecimals);

        // encode the message by calling the encodePayload method
        bytes memory encodedHelloTokenMessage = helloToken.encodePayload(
            HelloTokenStructs.HelloTokenMessage({
                payloadID: uint8(1),
                targetRecipient: addressToBytes32(address(this))
            })
        );

        // Create a simulated version of the wormhole message that the
        // HelloToken contract will emit.
        ITokenBridge.TransferWithPayload memory transfer =
            ITokenBridge.TransferWithPayload({
                payloadID: uint8(3), // payload3 transfer
                amount: normalizedAmount,
                tokenAddress: addressToBytes32(wavaxAddress),
                tokenChain: helloToken.chainId(),
                to: addressToBytes32(address(helloToken)),
                toChain: helloToken.chainId(),
                fromAddress: ethereumEmitter,
                payload: encodedHelloTokenMessage
            });

        // Encode the TransferWithPayload struct and simulate signing
        // the message with the devnet guardian key.
        bytes memory signedMessage = getTransferWithPayloadMessage(
            transfer,
            ethereumChainId,
            addressToBytes32(ethereumTokenBridge)
        );

        // NOTE: We purposely don't register an emitter on the HelloToken contract
        // for this test. The redeemTransferWithPayload call should revert for
        // this reason.
        vm.expectRevert("emitter not registered");
        helloToken.redeemTransferWithPayload(signedMessage);
    }
}
