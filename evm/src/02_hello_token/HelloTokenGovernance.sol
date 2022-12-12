// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./HelloTokenGetters.sol";

contract HelloTokenGovernance is HelloTokenGetters {
    /**
     * @notice Registers foreign emitters (HelloToken contracts) with this contract
     * @dev Only the deployer (owner) can invoke this method
     * @param emitterChainId Wormhole chainId of the contract being registered.
     * See https://book.wormhole.com/reference/contracts.html for more information.
     * @param emitterAddress 32-byte address of the contract being registered. For EVM
     * contracts the first 12 bytes should be zeros.
     */
    function registerEmitter(
        uint16 emitterChainId,
        bytes32 emitterAddress
    ) public onlyOwner {
        // sanity check the emitterChainId and emitterAddress input values
        require(
            emitterChainId != 0 && emitterChainId != chainId(),
            "emitterChainId cannot equal 0 or this chainId"
        );
        require(
            emitterAddress != bytes32(0),
            "emitterAddress cannot equal bytes32(0)"
        );

        // update the registeredEmitters state variable
        setEmitter(emitterChainId, emitterAddress);
    }

    /**
     * @notice Updates the relayer fee percentage and precision
     * @dev Only the deployer (owner) can invoke this method
     * @param relayerFeePercentage The percentage of each transfer that is
     * rewarded to the relayer.
     * @param relayerFeePrecision The precision of the relayer fee
     */
    function updateRelayerFee(
        uint32 relayerFeePercentage,
        uint32 relayerFeePrecision
    ) public onlyOwner {
        require(relayerFeePrecision > 0, "precision must be > 0");
        require(
            relayerFeePercentage < relayerFeePrecision,
            "relayer fee percentage must be < precision"
        );

        setRelayerFeePercentage(relayerFeePercentage);
        setFeePrecision(relayerFeePrecision);
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "caller not the owner");
        _;
    }
}
