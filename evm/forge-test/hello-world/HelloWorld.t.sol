// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../src/hello-world/HelloWorld.sol";
import {IWormhole} from "../../src/interfaces/IWormhole.sol";

import "forge-std/console.sol";

contract HelloWorldTest is Test {
    IWormhole wormhole;
    HelloWorld public helloWorld;

    function setUp() public {
        // Wormhole on AVAX mainnet
        wormhole = IWormhole(0x54a8e5f9c4CbA08F9943965859F6c34eAF03E26c);
        require(wormhole.chainId() == 6, "wrong chainId");
        require(wormhole.messageFee() == 0, "wrong messageFee");

        // init
        helloWorld = new HelloWorld(address(wormhole));
    }
}
