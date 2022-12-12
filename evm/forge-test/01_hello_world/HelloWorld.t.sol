// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../src/01_hello_world/HelloWorld.sol";
import "../../src/01_hello_world/HelloWorldStructs.sol";
import {WormholeSimulator} from "wormhole-solidity/WormholeSimulator.sol";

import "forge-std/console.sol";

/**
 * @title A Test Suite for the EVM HelloWorld Contracts
 */
contract HelloWorldTest is Test {
    // guardian private key for simulated signing of Wormhole messages
    uint256 guardianSigner;

    // contract instances
    IWormhole wormhole;
    WormholeSimulator wormholeSimulator;
    HelloWorld helloWorldSource;
    HelloWorld helloWorldTarget;

    /**
     * @notice Sets up the wormholeSimulator contracts and deploys HelloWorld
     * contracts before each test is executed.
     */
    function setUp() public {
        // verify that we're using the correct fork (AVAX mainnet in this case)
        require(block.chainid == vm.envUint("TESTING_AVAX_FORK_CHAINID"), "wrong evm");

        // this will be used to sign Wormhole messages
        guardianSigner = uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN"));

        // set up Wormhole using Wormhole existing on AVAX mainnet
        wormholeSimulator = new WormholeSimulator(vm.envAddress("TESTING_AVAX_WORMHOLE_ADDRESS"), guardianSigner);

        // we may need to interact with Wormhole throughout the test
        wormhole = wormholeSimulator.wormhole();

        // verify Wormhole state from fork
        require(wormhole.chainId() == uint16(vm.envUint("TESTING_AVAX_WORMHOLE_CHAINID")), "wrong chainId");
        require(wormhole.messageFee() == vm.envUint("TESTING_AVAX_WORMHOLE_MESSAGE_FEE"), "wrong messageFee");
        require(
            wormhole.getCurrentGuardianSetIndex() == uint32(vm.envUint("TESTING_AVAX_WORMHOLE_GUARDIAN_SET_INDEX")),
            "wrong guardian set index"
        );

        // initialize "source chain" HelloWorld contract
        helloWorldSource = new HelloWorld(address(wormhole), wormhole.chainId(), uint8(1));

        // initialize "target chain" HelloWorld contract
        helloWorldTarget = new HelloWorld(address(wormhole), uint8(2), uint8(1));

        // confirm that the source and target contract addresses are different
        assertTrue(address(helloWorldSource) != address(helloWorldTarget));
    }

    /**
     * @notice This test confirms that the contracts are able to serialize and deserialize
     * the HelloWorld message correctly.
     */
    function testMessageDeserialization(
        string memory messageToSend
    ) public {
        // encode the message by calling the encodeMessage method
        bytes memory encodedMessage = helloWorldSource.encodeMessage(
            HelloWorldStructs.HelloWorldMessage({
                payloadID: uint8(1),
                message: messageToSend
            })
        );

        // decode the message by calling the decodeMessage method
        HelloWorldStructs.HelloWorldMessage memory results = helloWorldSource.decodeMessage(encodedMessage);

        // verify the parsed output
        assertEq(results.payloadID, 1);
        assertEq(results.message, messageToSend);
    }

    /**
     * @notice This test confirms that decodeMessage reverts when a message
     * has an unexpected payloadID.
     */
    function testIncorrectMessagePayload() public {
        // encode the message by calling the encodeMessage method
        bytes memory encodedMessage = helloWorldSource.encodeMessage(
            HelloWorldStructs.HelloWorldMessage({
                payloadID: uint8(2), // add invalid payloadID (uint8(2))
                message: "HelloSolana"
            })
        );

        // expect a revert when trying to decode a message the wrong payloadID
        vm.expectRevert("invalid payloadID");
        helloWorldSource.decodeMessage(encodedMessage);
    }

    /**
     * @notice This test confirms that decodeMessage reverts when a message
     * is an unexpected length.
     */
    function testIncorrectMessageLength() public {
        // encode the message by calling the encodeMessage method
        bytes memory encodedMessage = helloWorldSource.encodeMessage(
            HelloWorldStructs.HelloWorldMessage({
                payloadID: uint8(1),
                message: "HelloSolana"
            })
        );

        // add some bytes to the encodedMessage
        encodedMessage = abi.encodePacked(
            encodedMessage,
            uint256(42000)
        );

        // expect a revert when trying to decode a message an invalid length
        vm.expectRevert("invalid message length");
        helloWorldSource.decodeMessage(encodedMessage);
    }

    /**
     * @notice This test confirms that the owner can correctly register a foreign emitter
     * with the HelloWorld contracts.
     */
    function testRegisterEmitter() public {
        // cache the new emitter info
        uint16 newEmitterChainId = helloWorldTarget.chainId();
        bytes32 newEmitterAddress = bytes32(uint256(uint160(address(helloWorldTarget))));

        // register the emitter with the owner's wallet
        helloWorldSource.registerEmitter(newEmitterChainId, newEmitterAddress);

        // verify that the contract state was updated correctly
        bytes32 emitterInContractState = helloWorldSource.getRegisteredEmitter(
            helloWorldTarget.chainId()
        );
        assertEq(emitterInContractState, newEmitterAddress);
    }

    /**
     * @notice This test confirms that ONLY the owner can register a foreign emitter
     * with the HelloWorld contracts.
     */
    function testRegisterEmitterNotOwner() public {
        // cache the new emitter info
        uint16 newEmitterChainId = helloWorldTarget.chainId();
        bytes32 newEmitterAddress = bytes32(uint256(uint160(address(helloWorldTarget))));

        // prank the caller address to something different than the owner's address
        vm.prank(address(wormholeSimulator));

        // expect the registerEmitter call to revert
        vm.expectRevert("caller not the owner");
        helloWorldSource.registerEmitter(newEmitterChainId, newEmitterAddress);
    }

    /**
     * @notice This test confirms that the `sendMessage` method correctly sends the
     * HelloWorld message.
     */
    function testSendMessage() public {
        // start listening to events
        vm.recordLogs();

        // call the source HelloWorld contract and emit the passed HelloWorld message
        uint64 sequence = helloWorldSource.sendMessage("HelloSolana");

        // record the emitted Wormhole message
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // simulate signing the Wormhole message
        // NOTE: in the wormhole-sdk, signed Wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(
            entries[0],
            helloWorldSource.chainId(),
            address(helloWorldSource)
        );

        // parse and verify the message
        (
            IWormhole.VM memory wormholeMessage,
            bool valid,
            string memory reason
        ) = wormhole.parseAndVerifyVM(encodedMessage);
        require(valid, reason);

        // verify the message payload
        HelloWorldStructs.HelloWorldMessage memory results = helloWorldSource.decodeMessage(wormholeMessage.payload);

        // verify the parsed output
        assertEq(results.payloadID, 1);
        assertEq(results.message, "HelloSolana");
        assertEq(wormholeMessage.sequence, sequence);
        assertEq(wormholeMessage.nonce, 0); // batchID
        assertEq(wormholeMessage.consistencyLevel, helloWorldSource.wormholeFinality());
    }

    /**
     * @notice This test confirms that the `receiveMessage` method correctly consumes
     * a HelloWorld messsage from the registered HelloWorld emitter. It also confirms
     * that message replay protection works.
     */
    function testReceiveMessage() public {
        // start listening to events
        vm.recordLogs();

        // call the target HelloWorld contract and emit the HelloWorld message
        helloWorldTarget.sendMessage("HelloSolana");

        // record the emitted wormhole message
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // simulate signing the Wormhole message
        // NOTE: in the wormhole-sdk, signed Wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(
            entries[0],
            helloWorldTarget.chainId(),
            address(helloWorldTarget)
        );

        // register the emitter on the source contract
        helloWorldSource.registerEmitter(
            helloWorldTarget.chainId(),
            bytes32(uint256(uint160(address(helloWorldTarget))))
        );

        // invoke the source HelloWorld contract and pass the encoded Wormhole message
        helloWorldSource.receiveMessage(encodedMessage);

        // Parse the encodedMessage to retrieve the hash. This is a safe operation
        // since the source HelloWorld contract already verfied the message in the
        // previous call.
        IWormhole.VM memory parsedMessage = wormhole.parseVM(encodedMessage);

        // Verify that the message was consumed and the payload was saved
        // in the contract state.
        bool messageWasConsumed = helloWorldSource.isMessageConsumed(parsedMessage.hash);
        string memory savedMessage = helloWorldSource.getReceivedMessage(parsedMessage.hash);

        assertTrue(messageWasConsumed);
        assertEq(savedMessage, "HelloSolana");

        // Confirm that message replay protection works by trying to call receiveMessage
        // with the same Wormhole message again.
        vm.expectRevert("message already consumed");
        helloWorldSource.receiveMessage(encodedMessage);
    }

    /**
     * @notice This test confirms that the `receiveMessage` method correctly verifies the Wormhole
     * message emitter.
     */
    function testReceiveMessageEmitterVerification() public {
        // start listening to events
        vm.recordLogs();

        // publish the HelloWorld message from an untrusted emitter
        bytes memory helloWorldMessage = helloWorldSource.encodeMessage(
            HelloWorldStructs.HelloWorldMessage({
                payloadID: uint8(1),
                message: "HelloSolana"
            })
        );
        wormhole.publishMessage(0, helloWorldMessage, helloWorldSource.wormholeFinality());

        // record the emitted Wormhole message
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // simulate signing the Wormhole message
        // NOTE: in the wormhole-sdk, signed Wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(
            entries[0],
            helloWorldSource.chainId(),
            address(helloWorldSource)
        );

        // register the emitter on the source contract
        helloWorldSource.registerEmitter(
            helloWorldTarget.chainId(),
            bytes32(uint256(uint160(address(helloWorldTarget))))
        );

        // Expect the receiveMessage call to revert, since the message was generated
        // by an untrusted emitter.
        vm.expectRevert("unknown emitter");
        helloWorldSource.receiveMessage(encodedMessage);
    }
}
