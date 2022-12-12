// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {HelloWorld} from "../src/01_hello_world/HelloWorld.sol";

contract ContractScript is Script {
    IWormhole wormhole;
    HelloWorld helloWorld;

    function setUp() public {
        wormhole = IWormhole(vm.envAddress("TESTING_WORMHOLE_ADDRESS"));
    }

    function deployHelloWorld() public {
        // deploy the HelloWorld contract
        helloWorld = new HelloWorld(
            address(wormhole),
            wormhole.chainId(),
            1 // wormholeFinality
        );
    }

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        // HelloWorld.sol
        deployHelloWorld();

        // finished
        vm.stopBroadcast();
    }
}
