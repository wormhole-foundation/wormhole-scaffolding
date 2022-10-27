// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../src/01_hello_world/HelloWorld.sol";
import "../../src/01_hello_world/HelloWorldStructs.sol";
import {WormholeSimulator} from "wormhole-solidity/WormholeSimulator.sol";

import "forge-std/console.sol";

contract HelloWorldTest is Test {
    IWormhole wormhole;
    uint256 guardianSigner;

    // contract instances
    WormholeSimulator public wormholeSimulator;
    HelloWorld public helloWorldSource;
    HelloWorld public helloWorldTarget;

    function setUp() public {
        // verify that we're using the correct fork (AVAX mainnet in this case)
        require(block.chainid == vm.envUint("TESTING_FORK_CHAINID"), "wrong evm");

        // this will be used to sign wormhole messages
        guardianSigner = uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN"));

        // set up Wormhole using Wormhole existing on AVAX mainnet
        wormholeSimulator = new WormholeSimulator(vm.envAddress("TESTING_WORMHOLE_ADDRESS"), guardianSigner);

        // we may need to interact with Wormhole throughout the test
        wormhole = wormholeSimulator.wormhole();

        // verify Wormhole state from fork
        require(wormhole.chainId() == uint16(vm.envUint("TESTING_WORMHOLE_CHAINID")), "wrong chainId");
        require(wormhole.messageFee() == vm.envUint("TESTING_WORMHOLE_MESSAGE_FEE"), "wrong messageFee");
        require(
            wormhole.getCurrentGuardianSetIndex() == uint32(vm.envUint("TESTING_WORMHOLE_GUARDIAN_SET_INDEX")),
            "wrong guardian set index"
        );

        // initialize "source chain" HelloWorld contract
        uint8 wormholeFinality = 15;
        helloWorldSource = new HelloWorld(address(wormhole), wormhole.chainId(), wormholeFinality);

        // Initialize "target chain" HelloWorld contract. This contract will share the same
        // chainID as the source contract, but (for testing purposes) will be treated like a contract living on
        // a different blockchain.
        helloWorldTarget = new HelloWorld(address(wormhole), wormhole.chainId(), wormholeFinality);

        // confirm that the source and target contract addresses are different
        assertTrue(address(helloWorldSource) != address(helloWorldTarget));
    }

    // This test confirms that the contracts are able to serialize and deserialize
    // the HelloWorld message correctly.
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

    // This test confirms that decodeMessage reverts when a message
    // has an unexpected payloadID.
    function testIncorrectMessagePayload() public {
        // encode the message by calling the encodeMessage method
        bytes memory encodedMessage = helloWorldSource.encodeMessage(
            HelloWorldStructs.HelloWorldMessage({
                payloadID: uint8(2),
                message: "HelloSolana"
            })
        );

        // expect a revert when trying to decode a message with payloadID 2
        vm.expectRevert("invalid payloadID");
        helloWorldSource.decodeMessage(encodedMessage);
    }

    // This test confirms that decodeMessage reverts when a message
    // is an unexpected length.
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

        // expect a revert when trying to decode a message with payloadID 2
        vm.expectRevert("invalid message length");
        helloWorldSource.decodeMessage(encodedMessage);
    }

    // This test confirms that the owner can correctly register a trusted emitter
    // with the HelloWorld contracts. It also tests that an emitter chainId can
    // only be registered once.
    function testRegisterEmitter() public {
        // cache the new emitter info
        uint16 newEmitterChainId = helloWorldTarget.chainId();
        bytes32 newEmitterAddress = bytes32(uint256(uint160(address(helloWorldTarget))));

        // register the emitter with the owners wallet
        helloWorldSource.registerEmitter(newEmitterChainId, newEmitterAddress);

        // verify that the contract state was updated correctly
        bytes32 emitterInContractState = helloWorldSource.getRegisteredEmitter(
            helloWorldTarget.chainId()
        );
        assertEq(emitterInContractState, newEmitterAddress);

        // confirm that the target chain emitter can only be registered once
        vm.expectRevert("emitterChainId already registered");
        helloWorldSource.registerEmitter(newEmitterChainId, newEmitterAddress);
    }

    // This test confirms that only the owner can register a trusted emitter
    // with the HelloWorld contracts.
    function testRegisterEmitterNotOwner() public {
        // cache the new emitter info
        uint16 newEmitterChainId = helloWorldTarget.chainId();
        bytes32 newEmitterAddress = bytes32(uint256(uint160(address(helloWorldTarget))));

        // prank the caller address to something different than the owner address
        vm.prank(address(wormholeSimulator));

        // expect the registerEmitter call to revert
        vm.expectRevert("caller not the owner");
        helloWorldSource.registerEmitter(newEmitterChainId, newEmitterAddress);
    }

    // This test confirms that the `sendMessage` method correctly sends the
    // HelloWorld message.
    function testSendMessage() public {
        // start listening to events
        vm.recordLogs();

        // call the source HelloWorld contract and emit the passed HelloWorld message
        uint64 sequence = helloWorldSource.sendMessage("HelloSolana");

        // record the emitted wormhole message
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // simulate signing the wormhole message
        // NOTE: in the wormhole-sdk, signed wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(entries[0]);

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

    // This test confirms that the `receiveMessage` method correctly consumes
    // a HelloWorld messsage from the registered HelloWorld emitter. It also confirms
    // that message replay protection works.
    function testReceiveMessage() public {
        // start listening to events
        vm.recordLogs();

        // call the target HelloWorld contract and emit the HelloWorld message
        helloWorldTarget.sendMessage("HelloSolana");

        // record the emitted wormhole message
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // simulate signing the wormhole message
        // NOTE: in the wormhole-sdk, signed wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(entries[0]);

        // register the emitter on the source contract
        helloWorldSource.registerEmitter(
            helloWorldTarget.chainId(),
            bytes32(uint256(uint160(address(helloWorldTarget))))
        );

        // invoke the source HelloWorld contract and pass the encoded wormhole message
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
        // with the same wormhole message again.
        vm.expectRevert("message already consumed");
        helloWorldSource.receiveMessage(encodedMessage);
    }

    // This test confirms that the `receiveMessage` method correctly verifies the wormhole
    // message emitter.
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

        // record the emitted wormhole message
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // simulate signing the wormhole message
        // NOTE: in the wormhole-sdk, signed wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(entries[0]);

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