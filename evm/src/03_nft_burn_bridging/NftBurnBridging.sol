// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "modules/wormhole/IWormhole.sol";
import "modules/utils/BytesLib.sol";

//An ERC721 NFT contract that mints tokens based on VAAs.
contract NftBurnBridging is ERC721Enumerable {
  using BytesLib for bytes;

  //immutable strings are not supported by Solidity so we use constants instead
  string constant NAME = "NFT Collection Name";
  string constant SYMBOL = "NFT_SYMBOL";
  string constant BASEURI = "https://our.metadata.url/";
  
  //Core layer Wormhole contract
  IWormhole private immutable _wormhole;
  //Only VAAs emitted from this Wormhole chain id can mint NFTs
  uint16    private immutable _emitterChainId;
  //Only VAAs from this emitter can mint NFTs
  bytes32   private immutable _emitterAddress;

  //VAA hash => claimed flag dictionary to prevent minting from the same VAA twice
  // (e.g. to prevent mint -> burn -> remint)
  mapping(bytes32 => bool) private _claimedVaas;

  error WrongEmitterChainId();
  error WrongEmitterAddress();
  error FailedVaaParseAndVerification(string reason);
  error VaaAlreadyClaimed();
  error InvalidMessageLength();

  constructor(
    IWormhole wormhole,
    uint16 emitterChainId,
    bytes32 emitterAddress
  ) ERC721(NAME, SYMBOL) {
    _wormhole = wormhole;
    _emitterChainId = emitterChainId;
    _emitterAddress = emitterAddress;
  }

  function _baseURI() internal view virtual override returns (string memory) {
    return BASEURI;
  }

  function tokenURI(uint256 tokenId) public view override returns (string memory) {
    return string.concat(super.tokenURI(tokenId), ".json");
  }

  function getEmitterAddress(uint16 wormholeChainId) external view returns (bytes32) {
    return (wormholeChainId == _emitterChainId) ? _emitterAddress : bytes32(0);
  }

  function receiveAndMint(bytes calldata vaa) external {
    (IWormhole.VM memory vm, bool valid, string memory reason) = _wormhole.parseAndVerifyVM(vaa);
    
    if (!valid)
      revert FailedVaaParseAndVerification(reason);

    if (vm.emitterChainId != _emitterChainId)
      revert WrongEmitterChainId();

    if (vm.emitterAddress != _emitterAddress)
      revert WrongEmitterAddress();

    if (_claimedVaas[vm.hash])
      revert VaaAlreadyClaimed();
    
    _claimedVaas[vm.hash] = true;

    (uint256 tokenId, address evmRecipient) = parsePayload(vm.payload);
    _safeMint(evmRecipient, tokenId);
  }

  function parsePayload(
    bytes memory message
  ) internal pure returns (uint256 tokenId, address evmRecipient) {
    if (message.length != BytesLib.uint16Size + BytesLib.addressSize)
      revert InvalidMessageLength();

    tokenId = message.toUint16(0);
    evmRecipient = message.toAddress(BytesLib.uint16Size);
  }
}
