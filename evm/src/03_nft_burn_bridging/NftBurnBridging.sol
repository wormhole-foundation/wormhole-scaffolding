// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "modules/wormhole/IWormhole.sol";
import "modules/utils/BytesLib.sol";

/**
 * @notice An ERC721 NFT contract that mints tokens based on VAAs.
 * @dev This implementation enables batch minting of tokens. The Solana
 * implementation does not support batch minting yet. This should be considered
 * when deploying the contract.
 */
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
  //Finality of outbound messages
  uint8     private immutable _finality;
  /**
   * Maximum number of tokens that can be minted in a single batch. This value 
   * is meant to prevent the contract from running out of gas when minting a
   * large number of tokens. Configure this value based on the gas limit of the
   * network where the contract will be deployed.
   */
  uint16    immutable _maxBatchSize;
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
  error BurnNotApproved();
	error RecipientZeroAddress();
	error InvalidBatchCount();
	error NotAscendingOrDuplicated();

  constructor(
    IWormhole wormhole,
    uint16 emitterChainId,
    bytes32 emitterAddress,
    uint8 finality, 
    uint16 maxBatchSize
  ) ERC721(NAME, SYMBOL) {
    _wormhole = wormhole;
    _emitterChainId = emitterChainId;
    _emitterAddress = emitterAddress;
    _finality = finality;
    _maxBatchSize = maxBatchSize;
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

	function burnAndSend(uint256 tokenId, address recipient) external payable {
		uint256[] memory tokenIds = new uint256[](1);
		tokenIds[0] = tokenId;

		_burnAndSend(tokenIds, 1, recipient);
	}

	function burnAndSend(uint256[] calldata tokenIds, address recipient) external payable {
		uint256 tokenCount = tokenIds.length;
		if (tokenCount < 2 || tokenCount > _maxBatchSize) {
			revert InvalidBatchCount();
		}

		_burnAndSend(tokenIds, tokenCount, recipient);
	}

  function receiveAndMint(bytes calldata vaa) external {
    IWormhole.VM memory vm = verifyMintMessage(vaa);

    (uint256 tokenId, address evmRecipient) = parsePayload(vm.payload);
    _safeMint(evmRecipient, tokenId);
  }

	function receiveAndMintBatch(bytes calldata vaa) external {
		IWormhole.VM memory vm = verifyMintMessage(vaa);

		(uint256[] memory tokenIds, address evmRecipient) = parseBatchPayload(vm.payload);

		uint256 tokenCount = tokenIds.length;
		for (uint256 i = 0; i < tokenCount; ) {
			_safeMint(evmRecipient, tokenIds[i]);

			unchecked {
				i += 1;
			}
		}
	}

	function _burnAndSend(
		uint256[] memory tokenIds,
		uint256 tokenCount,
		address recipient
	) internal {
		if (recipient == address(0)) {
			revert RecipientZeroAddress();
		}

		uint256 lastTokenId;
		bytes memory payload;
		for (uint256 i = 0; i < tokenCount; ) {
			uint256 tokenId = tokenIds[i];

			//tokenIds must be ascending and unique
			if (i != 0 && tokenId <= lastTokenId) {
				revert NotAscendingOrDuplicated();
			}

			if (!_isApprovedOrOwner(_msgSender(), tokenId)) {
				revert BurnNotApproved();
			}

			_burn(tokenId);

			//add tokenId to the message payload
			payload = abi.encodePacked(payload, uint16(tokenId));

			unchecked {
				lastTokenId = tokenId;
				i += 1;
			}
		}

		//append the recipient to the payload and send the message
		_wormhole.publishMessage{value: msg.value}(
			0, //nonce
			abi.encodePacked(payload, recipient),
			_finality
		);
	}

  function verifyMintMessage(bytes calldata vaa) internal returns (IWormhole.VM memory) {
		(IWormhole.VM memory vm, bool valid, string memory reason) = _wormhole.parseAndVerifyVM(
			vaa
		);
		if (!valid) revert FailedVaaParseAndVerification(reason);

		if (vm.emitterChainId != _emitterChainId) revert WrongEmitterChainId();

		if (vm.emitterAddress != _emitterAddress) revert WrongEmitterAddress();

		if (_claimedVaas[vm.hash]) revert VaaAlreadyClaimed();

		_claimedVaas[vm.hash] = true;

		return vm;
	}

  function parsePayload(
    bytes memory message
  ) internal pure returns (uint256 tokenId, address evmRecipient) {
    if (message.length != BytesLib.uint16Size + BytesLib.addressSize)
      revert InvalidMessageLength();

    tokenId = message.toUint16(0);
    evmRecipient = message.toAddress(BytesLib.uint16Size);
  }

  function parseBatchPayload(
		bytes memory message
	) internal pure returns (uint256[] memory, address) {
		uint256 messageLength = message.length;
		uint256 endTokenIndex = messageLength - BytesLib.addressSize;
		uint256 batchSize = endTokenIndex / BytesLib.uint16Size;

		if (
			messageLength <= BytesLib.uint16Size + BytesLib.addressSize ||
			endTokenIndex % BytesLib.uint16Size != 0
		) {
			revert InvalidMessageLength();
		}

		//parse the recipient
		address evmRecipient = message.toAddress(endTokenIndex);

		//parse the tokenIds
		uint256[] memory tokenIds = new uint256[](batchSize);
		for (uint256 i = 0; i < batchSize; ) {
			unchecked {
				tokenIds[i] = message.toUint16(i * BytesLib.uint16Size);
				i += 1;
			}
		}

		return (tokenIds, evmRecipient);
	} 

  function getMaxBatchSize() external view returns (uint16) {
    return _maxBatchSize;
  }
}
