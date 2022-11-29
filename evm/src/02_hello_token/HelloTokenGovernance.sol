// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./HelloTokenGetters.sol";

/**
 * @title A Cross-Chain HelloToken Application
 * @notice
 */
contract HelloTokenGovernance is HelloTokenGetters {
    /**
     * @notice Registers foreign emitters (HelloToken contracts) with this contract
     * @dev Only the deployer (owner) can invoke this method
     * @param emitterChainId Wormhole chainId of the contract being registered.
     * See https://book.wormhole.com/reference/contracts.html for more information.
     * @param emitterAddress 32 byte address of the contract being registered. For EVM
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
     * @notice Registers Solana ATAs (Associated Token Accounts) to allow this
     * contract to send ERC20 tokens to Solana via the token bridge.
     * @dev Only the deployer (owner) can invoke this method
     * @param token ERC20 token address
     * @param solanaTokenAccount Associated ATA for the `token`
     */
    function registerSolanaTokenAccount(
        address token,
        bytes32 solanaTokenAccount
    ) public onlyOwner {
        // sanity check the emitterChainId and emitterAddress input values
        require(token != address(0), "invalid token address");
        require(
            solanaTokenAccount != bytes32(0),
            "solanaTokenAccount cannot equal bytes32(0)"
        );

        // register the solanaTokenAccount
        setSolanaTokenAccount(token, solanaTokenAccount);
    }

    /**
     * @notice Updates the relayer fee percentage
     * @dev Only the deployer (owner) can invoke this method
     * @param relayerFeePercentage The percentage of each transfer that is
     * rewarded to the relayer.
     */
    function updateRelayerFee(uint32 relayerFeePercentage) public onlyOwner {
        setRelayerFee(relayerFeePercentage);
    }

    modifier onlyOwner() {
        require(owner() == msg.sender, "caller not the owner");
        _;
    }
}
