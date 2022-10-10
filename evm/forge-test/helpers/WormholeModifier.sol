// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IWormhole} from "../../src/interfaces/IWormhole.sol";

import "forge-std/Test.sol";

contract WormholeModifier is Test {
    IWormhole public wormhole;

    constructor(address wormhole_) {
        wormhole = IWormhole(wormhole_);
        overrideToDevnetGuardian(0xbeFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe);
    }

    function overrideToDevnetGuardian(address devnetGuardian) internal {
        // override current guardian set with devnet guardian
        {
            bytes32 data = vm.load(address(this), bytes32(uint256(2)));
            require(data == bytes32(0), "incorrect slot");

            bytes32 guardianSetSlot = keccak256(abi.encode(wormhole.getCurrentGuardianSetIndex(), 2));

            // overwrite all but first guardian set to zero address
            uint256 numGuardians = uint256(vm.load(address(wormhole), guardianSetSlot));
            for (uint256 i = 1; i < numGuardians;) {
                vm.store(
                    address(wormhole), bytes32(uint256(keccak256(abi.encodePacked(guardianSetSlot))) + i), bytes32(0)
                );
                unchecked {
                    i += 1;
                }
            }

            // now override the first guardian key with the devnet key
            vm.store(
                address(wormhole),
                bytes32(uint256(keccak256(abi.encodePacked(guardianSetSlot))) + 0), // just explicit w/ index
                bytes32(uint256(uint160(devnetGuardian)))
            );

            // change the length to 1 guardian
            vm.store(address(wormhole), guardianSetSlot, bytes32(uint256(1)));

            // confirm guardian set override
            address[] memory guardians = wormhole.getGuardianSet(wormhole.getCurrentGuardianSetIndex()).keys;
            for (uint256 i = 0; i < guardians.length; ++i) {
                if (i == 0) {
                    require(guardians[i] == devnetGuardian, "incorrect guardian set override");
                } else {
                    // this shouldn't hit because we overrode the length to 1, but
                    // keeping this here just in case
                    require(guardians[i] == address(0), "incorrect guardian set override");
                }
            }
        }
    }
}
