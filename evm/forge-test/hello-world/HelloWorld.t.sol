// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../../src/hello-world/HelloWorld.sol";
import {WormholeModifier} from "../helpers/WormholeModifier.sol";

import "forge-std/console.sol";

contract HelloWorldTest is Test {
    IWormhole wormhole;
    HelloWorld public helloWorld;

    function setUp() public {
        // Wormhole on AVAX mainnet
        WormholeModifier wormholeModifier = new WormholeModifier(0x54a8e5f9c4CbA08F9943965859F6c34eAF03E26c);
        wormhole = wormholeModifier.wormhole();

        require(wormhole.chainId() == 6, "wrong chainId");
        require(wormhole.messageFee() == 0, "wrong messageFee");
        require(wormhole.getCurrentGuardianSetIndex() == 2, "wrong guardian set index");

        // init
        helloWorld = new HelloWorld(address(wormhole));
    }

    function testSomething() public {
        // TODO: put a real test here
        require(wormhole.getCurrentGuardianSetIndex() == 2, "wrong guardian set index");
    }
}
