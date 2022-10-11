// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../src/01_hello_world/HelloWorld.sol";
import {WormholeSimulator} from "wormhole-solidity/WormholeSimulator.sol";

import "forge-std/console.sol";

contract HelloWorldTest is Test {
    IWormhole wormhole;
    uint256 guardianSigner;

    WormholeSimulator public wormholeSimulator;
    HelloWorld public helloWorld;

    function setUp() public {
        // Verify that we're using the correct fork (AVAX mainnet in this case)
        require(block.chainid == vm.envUint("TESTING_FORK_CHAINID"), "wrong evm");

        // This will be used to sign wormhole messages
        guardianSigner = uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN"));

        // Set up Wormhole using Wormhole existing on AVAX mainnet
        wormholeSimulator = new WormholeSimulator(vm.envAddress("TESTING_WORMHOLE_ADDRESS"), guardianSigner);

        // We may need to interact with Wormhole throughout the test
        wormhole = wormholeSimulator.wormhole();

        // Verify Wormhole state from fork
        require(wormhole.chainId() == uint16(vm.envUint("TESTING_WORMHOLE_CHAINID")), "wrong chainId");
        require(wormhole.messageFee() == vm.envUint("TESTING_WORMHOLE_MESSAGE_FEE"), "wrong messageFee");
        require(
            wormhole.getCurrentGuardianSetIndex() == uint32(vm.envUint("TESTING_WORMHOLE_GUARDIAN_SET_INDEX")),
            "wrong guardian set index"
        );

        // init
        helloWorld = new HelloWorld(address(wormhole));
    }

    function testSomething() public {
        // start listening to events
        vm.recordLogs();

        // publish a message
        wormhole.publishMessage(69, hex"12", 15);

        // record the emitted wormhole message
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // simulate signing the wormhole message
        // NOTE: in the wormhole-sdk, signed wormhole messages are referred to as signed VAAs
        bytes memory encodedMessage = wormholeSimulator.fetchSignedMessageFromLogs(entries[0]);

        // try to verify the vm
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole.parseAndVerifyVM(encodedMessage);
        require(valid, reason);
    }
}
