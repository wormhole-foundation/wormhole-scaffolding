// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.19;

import {IWormhole} from "modules/wormhole/IWormhole.sol";
import {WormholeSimulator, FakeWormholeSimulator} from "modules/wormhole/WormholeSimulator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "forge-std/Test.sol";
import "forge-std/console2.sol";

import "contracts/03_nft_burn_bridging/NftBurnBridging.sol";

contract TestNftBurnBridging is NftBurnBridging {
    constructor(
        IWormhole wormhole,
        uint16 emitterChainId,
        bytes32 emitterAddress,
        uint8 finality,
        uint16 maxBatchSize
    ) NftBurnBridging(wormhole, emitterChainId, emitterAddress, finality, maxBatchSize) {}

    function mintTestOnly(address recipient, uint16 tokenId) public {
		_safeMint(recipient, uint256(tokenId));
	}

	function exists(uint tokenId) external view returns (bool) {
		return _exists(tokenId);
	}
}

contract TestHelpers is Test {
	function createBatchAndMint(
		TestNftBurnBridging nft,
		address recipient,
		uint256 len,
		uint256 start
	) public returns (uint256[] memory) {
		uint256[] memory arr = new uint256[](len);
		for (uint256 i = 0; i < len; i++) {
			uint256 tokenId = start + i;
			arr[i] = tokenId;

			nft.mintTestOnly(recipient, uint16(tokenId));
		}
		return arr;
	}

	function createBatchIds(uint256 len, uint256 start) public pure returns (uint256[] memory) {
		uint256[] memory arr = new uint256[](len);
		for (uint256 i = 0; i < len; i++) {
			arr[i] = start + i;
		}
		return arr;
	}

	function createBatchPayload(
		uint256[] memory tokenIds,
		address recipient
	) public pure returns (bytes memory) {
		bytes memory payload;
		for (uint256 i = 0; i < tokenIds.length; i++) {
			payload = abi.encodePacked(payload, uint16(tokenIds[i]));
		}
		return abi.encodePacked(payload, recipient);
	}

	function toWormholeFormat(address addr) public pure returns (bytes32 whFormat) {
		return bytes32(uint256(uint160(addr)));
	}

	function fromWormholeFormat(bytes32 whFormatAddress) public pure returns (address addr) {
		return address(uint160(uint256(whFormatAddress)));
	}

	function craftValidVaa(
        IWormhole wormhole,
        WormholeSimulator wormholeSimulator,
		uint16 tokenId,
		address evmRecipient,
		uint16 emitterChainId,
		bytes32 emitterAddress
	) internal returns (bytes memory) {
		return
			craftValidVaa(
                wormhole, 
                wormholeSimulator,
				emitterChainId,
				emitterAddress,
				abi.encodePacked(tokenId, evmRecipient)
			);
	}

	function craftValidVaa(
        IWormhole wormhole,
        WormholeSimulator wormholeSimulator,
		uint16 emitterChainId,
		bytes32 emitterAddress,
		bytes memory payload
	) internal returns (bytes memory) {
		IWormhole.VM memory vaa = IWormhole.VM({
			version: 1,
			timestamp: 0,
			nonce: 0,
			emitterChainId: emitterChainId,
			emitterAddress: emitterAddress,
			sequence: 0,
			consistencyLevel: 1,
			payload: payload,
			guardianSetIndex: wormhole.getCurrentGuardianSetIndex(),
			signatures: new IWormhole.Signature[](0),
			hash: 0x00
		});

		return wormholeSimulator.encodeAndSignMessage(vaa);
	}
}