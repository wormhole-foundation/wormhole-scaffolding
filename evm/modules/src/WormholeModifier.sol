// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IWormhole} from "../../src/interfaces/IWormhole.sol";

import "forge-std/Vm.sol";

contract WormholeModifier {
    // Taken from forge-std/Script.sol
    address private constant VM_ADDRESS = address(bytes20(uint160(uint256(keccak256("hevm cheat code")))));
    Vm public constant vm = Vm(VM_ADDRESS);

    // Allow access to Wormhole
    IWormhole public wormhole;

    constructor(address wormhole_, address devnetGuardian) {
        wormhole = IWormhole(wormhole_);
        overrideToDevnetGuardian(devnetGuardian);
    }

    function overrideToDevnetGuardian(address devnetGuardian) internal {
        {
            bytes32 data = vm.load(address(this), bytes32(uint256(2)));
            require(data == bytes32(0), "incorrect slot");

            // Get slot for Guardian Set at the current index
            uint32 guardianSetIndex = wormhole.getCurrentGuardianSetIndex();
            bytes32 guardianSetSlot = keccak256(abi.encode(guardianSetIndex, 2));

            // Overwrite all but first guardian set to zero address. This isn't
            // necessary, but just in case we inadvertently access these slots
            // for any reason.
            uint256 numGuardians = uint256(vm.load(address(wormhole), guardianSetSlot));
            for (uint256 i = 1; i < numGuardians;) {
                vm.store(
                    address(wormhole), bytes32(uint256(keccak256(abi.encodePacked(guardianSetSlot))) + i), bytes32(0)
                );
                unchecked {
                    i += 1;
                }
            }

            // Now overwrite the first guardian key with the devnet key specified
            // in the function argument.
            vm.store(
                address(wormhole),
                bytes32(uint256(keccak256(abi.encodePacked(guardianSetSlot))) + 0), // just explicit w/ index 0
                bytes32(uint256(uint160(devnetGuardian)))
            );

            // Change the length to 1 guardian
            vm.store(
                address(wormhole),
                guardianSetSlot,
                bytes32(uint256(1)) // length == 1
            );

            // Confirm guardian set override
            address[] memory guardians = wormhole.getGuardianSet(guardianSetIndex).keys;
            require(guardians.length == 1, "guardians.length != 1");
            require(guardians[0] == devnetGuardian, "incorrect guardian set override");
        }
    }
}
