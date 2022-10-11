// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../src/01_hello_world/HelloWorld.sol";
import {WormholeModifier} from "wormhole-solidity/WormholeModifier.sol";

import "forge-std/console.sol";

contract HelloWorldTest is Test {
    IWormhole wormhole;
    uint256 guardianSigner;

    HelloWorld public helloWorld;

    function setUp() public {
        // Verify that we're using the correct fork (AVAX mainnet in this case)
        require(block.chainid == vm.envUint("TESTING_FORK_CHAINID"), "wrong evm");

        // This will be used to sign wormhole messages
        guardianSigner = uint256(vm.envBytes32("TESTING_DEVNET_GUARDIAN"));

        // Set up Wormhole using Wormhole existing on AVAX mainnet
        WormholeModifier wormholeModifier =
            new WormholeModifier(vm.envAddress("TESTING_WORMHOLE_ADDRESS"), vm.addr(guardianSigner));

        // We may need to interact with Wormhole throughout the test
        wormhole = wormholeModifier.wormhole();

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

    function testSomething(uint256 something) public {
        // TODO: put a real test here
        require(something == something, "something != something");
    }
}
