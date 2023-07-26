// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "forge-std/console2.sol";

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import "modules/wormhole/IWormhole.sol";
import "modules/wormhole/MockWormhole.sol";
import "modules/utils/BytesLib.sol";
import {WormholeSimulator, FakeWormholeSimulator} from "modules/wormhole/WormholeSimulator.sol";

import "contracts/03_nft_burn_bridging/NftBurnBridging.sol";

contract NftBurnBridgingTest is Test {
  using BytesLib for bytes;

  string constant BASEURI = "https://our.metadata.url/";

  // Ethereum has wormhole chain id 2
  uint16  constant wormholeChainId = 2;
  // Solana has wormhole chain id 1
  uint16  constant emitterChainId = 1;
  bytes32 constant emitterAddress = bytes32("emitter address") >> 12 * 8;
  bytes32 constant userAddress = bytes32("user address") >> 12 * 8;

  IWormhole wormhole;
  WormholeSimulator wormholeSimulator;
  NftBurnBridging nftBurnBridging;

  function setUp() public {
    MockWormhole mockWormhole = new MockWormhole({
      initChainId: wormholeChainId,
      initEvmChainId: block.chainid
    });
    wormhole = mockWormhole;

    wormholeSimulator = new FakeWormholeSimulator(mockWormhole);
    nftBurnBridging = new NftBurnBridging(wormhole, emitterChainId, emitterAddress);
  }

  /**
    * TESTS
    */

  function toWormholeFormat(address addr) internal pure returns (bytes32 whFormat) {
    return bytes32(uint256(uint160(addr)));
  }

  function fromWormholeFormat(bytes32 whFormatAddress) internal pure returns (address addr) {
    return address(uint160(uint256(whFormatAddress)));
  }

  function craftValidVaa(uint16 tokenId, address evmRecipient) internal returns (bytes memory) {
    IWormhole.VM memory vaa = IWormhole.VM({
      version: 1,
      timestamp: 0,
      nonce: 0,
      emitterChainId: emitterChainId,
      emitterAddress: emitterAddress,
      sequence: 0,
      consistencyLevel: 1,
      payload: abi.encodePacked(tokenId, evmRecipient),
      guardianSetIndex: wormhole.getCurrentGuardianSetIndex(),
      signatures: new IWormhole.Signature[](0),
      hash: 0x00
    });

    return wormholeSimulator.encodeAndSignMessage(vaa);
  }

  function testReceiveAndMintAndURI() public {
    uint16 tokenId = 5;
    bytes memory mintVaa = craftValidVaa(tokenId, fromWormholeFormat(userAddress));
    nftBurnBridging.receiveAndMint(mintVaa);
    assertEq(nftBurnBridging.ownerOf(tokenId), fromWormholeFormat(userAddress));
    //can't have that as a separate testcase because tokenURI requires the tokenId to exist
    assertEq(
      nftBurnBridging.tokenURI(tokenId),
      string(abi.encodePacked(BASEURI, Strings.toString(tokenId), string(".json")))
    );
  }
}
