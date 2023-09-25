// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "forge-std/console2.sol";

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import "modules/wormhole/IWormhole.sol";
import "modules/wormhole/MockWormhole.sol";
import "modules/utils/BytesLib.sol";
import {WormholeSimulator, FakeWormholeSimulator} from "modules/wormhole/WormholeSimulator.sol";

import {TestNftBurnBridging, TestHelpers} from "./TestHelpers.sol";
import "contracts/03_nft_burn_bridging/NftBurnBridging.sol";

contract NftBurnBridgingTest is TestHelpers {
  using BytesLib for bytes;

  string constant BASEURI = "https://our.metadata.url/";

  // Ethereum has wormhole chain id 2
  uint16  constant wormholeChainId = 2;
  // Solana has wormhole chain id 1
  uint16  constant emitterChainId = 1;
  uint16 constant maxSupply = 15_000;
  bytes32 constant emitterAddress = bytes32("emitter address") >> 12 * 8;
  uint8  constant finality = 201;
  uint16 constant maxBatchSize = 10;
  bytes32 constant userAddress = bytes32("user address") >> 12 * 8;
  uint256 constant wormholeFee = 1e6;

  IWormhole wormhole;
  WormholeSimulator wormholeSimulator;
  TestNftBurnBridging nft;

  function setUp() public {
    MockWormhole mockWormhole = new MockWormhole({
      initChainId: wormholeChainId,
      initEvmChainId: block.chainid
    });
    wormhole = mockWormhole;

    wormholeSimulator = new FakeWormholeSimulator(mockWormhole);
    wormholeSimulator.setMessageFee(wormholeFee);

    nft = new TestNftBurnBridging(
      wormhole, 
      emitterChainId, 
      emitterAddress, 
      finality, 
      maxBatchSize
    );
  }

  function testBurnAndSend(uint16 tokenId) public {
		vm.assume(tokenId < maxSupply);

		address recipient = fromWormholeFormat(userAddress);

		// mint an NFT
		nft.mintTestOnly(recipient, tokenId);

		// burn and send the NFT on polygon
		vm.prank(address(recipient));
		nft.approve(address(this), tokenId);
		vm.deal(address(this), wormholeFee);

    assertEq(nft.balanceOf(recipient), 1);
    assertEq(nft.ownerOf(tokenId), recipient);
    assertTrue(nft.exists(tokenId));

		// start recording logs to capture the wormhole message
		vm.recordLogs();
		nft.burnAndSend{value: wormholeFee}(tokenId, recipient);

		// Fetch the emitted VM and parse the payload. The wormhole message will
		// be the second log, since the first log is the `Transfer` event.
		Vm.Log[] memory entries = vm.getRecordedLogs();

		IWormhole.VM memory vm_ = wormholeSimulator.parseVMFromLogs(entries[1]);
		assertEq(vm_.payload.toUint16(0), tokenId);
		assertEq(vm_.payload.toAddress(BytesLib.uint16Size), recipient);

    assertEq(nft.balanceOf(recipient), 0);
		assertFalse(nft.exists(tokenId));
	}

  function testReceiveAndMint(uint16 tokenId) public {
		vm.assume(tokenId < maxSupply);

    address recipient = fromWormholeFormat(userAddress);

		// craft a VAA to mint an NFT on ethereum
		bytes memory mintVaa = craftValidVaa(
      wormhole, 
      wormholeSimulator,
			tokenId,
			recipient,
			emitterChainId,
			emitterAddress
		);

		// check balances before minting
    assertEq(nft.balanceOf(recipient), 0);
    assertFalse(nft.exists(tokenId));

		nft.receiveAndMint(mintVaa);

		assertEq(nft.ownerOf(tokenId), recipient);
		assertEq(nft.balanceOf(recipient), 1);
	}
}