// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "forge-std/console.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {HelloToken} from "../src/02_hello_token/HelloToken.sol";

contract ContractScript is Script {
    IWormhole wormhole;
    HelloToken helloToken;

    function setUp() public {
        wormhole = IWormhole(vm.envAddress("TESTING_WORMHOLE_ADDRESS"));
    }

    function deployHelloToken() public {
        // deploy the HelloWorld contract
        helloToken = new HelloToken(
            address(wormhole),
            vm.envAddress("TESTING_BRIDGE_ADDRESS"),
            wormhole.chainId(),
            1, // wormholeFinality
            1e6, // feePrecision
            10000 // relayerFee (percentage terms)
        );
    }

    function run() public {
        // begin sending transactions
        vm.startBroadcast();

        // HelloToken.sol
        deployHelloToken();

        // finished
        vm.stopBroadcast();
    }
}
