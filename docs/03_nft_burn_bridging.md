# Purpose

The NftBurnBridging example demonstrates the implementation of two smart contracts facilitating native-to-native bridging of Metaplex NFTs from Solana to an EVM chain using a burn-and-remint mechanism. This approach provides an alternative to Wormhole's NFT bridge, where the original NFT is locked on the source chain, and a wrapped version is minted on the target chain.

# Overview

For the sake of the example we assume that:
* all NFTs are part of a [Metaplex NFT collection](https://docs.metaplex.com/programs/token-metadata/certified-collections) (and are hence associated with a single [Collection NFT](https://docs.metaplex.com/programs/token-metadata/certified-collections#collection-nfts))
* all NFTs are [verified](https://docs.metaplex.com/programs/token-metadata/certified-collections#verifying-nfts-in-collections) 
* the collection uses a zero-indexed URI `https://our.metadata.url/<token_id>.json` to enumerate all its NFTs (i.e. that there is a 1:1 mapping between an NFT and an unsigned integer)
* the collection comprises less than 2^16 (=65536) NFTs (so that we can encode the token id as a u16)
* the collection has no [print edition NFTs](https://docs.metaplex.com/resources/definitions#print)
* the Metaplex NFT collection can use either the old [Non-Fungible Standard](https://docs.metaplex.com/programs/token-metadata/token-standard#the-non-fungible-standard) or the new [Programmable Non-Fungible Standard](https://docs.metaplex.com/programs/token-metadata/token-standard#the-programmable-non-fungible-standard)

This allows us to extract the token id from the URI contained in the [Metaplex Metadata account](https://docs.metaplex.com/programs/token-metadata/accounts#metadata) on Solana, put them in a [Wormhole message](https://book.wormhole.com/wormhole/3_coreLayerContracts.html#sending) together with the intended recipient address on EVM, and finally mint the equivalent NFT on EVM using the typical [ERC721 baseURI approach](https://docs.openzeppelin.com/contracts/3.x/api/token/erc721#ERC721-baseURI--) to derive the full [tokenURI](https://docs.openzeppelin.com/contracts/3.x/api/token/erc721#IERC721Metadata-tokenURI-uint256-).

## Message Format

The Wormhole message published upon burning an NFT on Solana contains the NFT's token id followed by the EVM recipient address (provided by the NFT's owner when invoking the Solana program's `burnAndSend` instruction).

Format (both big endian byte order):
* token_id - 2 bytes, uint16
* evm recipient - 20 bytes, evm address

So burning token with id 1 and naming `0xa1a2a3a4a5a6a7a8a9a0b1b2b3b4b5b6b7b8b9b0` as the recipient yields the message:
`0x0001a1a2a3a4a5a6a7a8a9a0b1b2b3b4b5b6b7b8b9b0`

# Solana

## Program

The [Solana program](https://docs.solana.com/terminology#program) which burns Metaplex NFTs of a given collection can be instantiated multiple times but only once per [Collection NFT](https://docs.metaplex.com/programs/token-metadata/certified-collections#collection-nfts) (i.e. Collection) and only by the [UpdateAuthority](https://docs.metaplex.com/programs/token-metadata/accounts#metadata) of that collection (who can then be thought of as the admin of that program instance) by using the `initialize` instruction, which creates the instance account using the seeds mentioned above.

### Admin Instructions

The program supports:
* an optional whitelist -- Passing a size argument of 0 to the `initialize` instruction disables the whitelist, otherwise it must be set to the size of the collection (there is no way to undo an initialization that used the wrong size argument!).
* whitelisting (`whitelist` and `whitelist_bulk`) -- `whitelist` sets the corresponding bit of an NFT with the given token id to true and is hence more natural, while `whitelist_bulk` allows writing directly to the underlying bit array for a more efficient approach (primarily intended for setting up the initial state of the whitelist).
* delegating (`set_delegate`) -- Allows delegating admin functionality to a separate account (known as the delegate).
* pausing (`set_paused`) -- So `burnAndSend` instructions will fail even if all other prerequisites are met.

### Burn and Send Instruction

Its primary instruction is called `burnAndSend` which burns a given NFT and emits a Wormhole message, thus initiating the bridging process.

In more detail, when invoked, it will:
1. Ensure that all its prerequisites are fulfilled, namely that
  * the NFT belongs to the collection of the given program instance
  * the instance isn't paused
  * the NFT is whitelisted (if whitelisting is enabled)
2. Additionally it relies on [Metaplex's new Burn instruction](https://github.com/metaplex-foundation/metaplex-program-library/blob/master/token-metadata/program/src/instruction/mod.rs#L504-L545) to ensure that:
  * the NFT is a [verified item of the collection](https://docs.metaplex.com/programs/token-metadata/instructions#verify-a-collection-item)
  * the transaction was signed by the owner of the NFT or an authorized delegate and is hence authorized to burn the NFT
  * the NFT is the [master edition](https://docs.metaplex.com/programs/token-metadata/accounts#master-edition) and [not some other edition](https://docs.metaplex.com/programs/token-metadata/accounts#edition)
  * that a coherent set of Metaplex accounts was provided
3. [Burn](https://github.com/metaplex-foundation/metaplex-program-library/blob/master/token-metadata/program/src/instruction/mod.rs#L504-L545) the NFT.
4. Emit a Wormhole message using the described format which serves as proof for the burning of the NFT and which can be submitted on the target EVM chain to mint its equivalent there.

### Wormhole Accounts

**Emitter**

Every message published via Wormhole contains an [emitter address](https://book.wormhole.com/wormhole/4_vaa.html#body) which allows a receiver to check that the message was actually published by the expected entity and not spoofed by somebody else.

The Solana program is initiated separately for each NFT collection and uses the instance account as its emitter (which has the derivation seeds `["instance", collection_mint.key()]`) instead of using the default emitter (with uses the default seed `["emitter"]` and would hence be shared across all instances).

The advantage of this approach is that it
1. requires one fewer account to be passed in (the instance account is already part of an instruction)
2. since the emitter address is distinct for each NFT collection, it allows for easy filtering to only find VAAs that belong to that particular collection

**Message**

The message account uses the seeds `["message", nft_mint.key()]`.

**Sequence**

The sequence account uses Wormhole's default derivation but with our custom emitter, i.e. `["Sequence", emitter.key()]` (mind the unfortunate capitalization of Sequence!) .

## SDK

The TypeScript SDK for the program can be found in `solana/ts/sdk/03_nft_burn_bridging`. It includes (and thus depends on) the [IDL](https://www.anchor-lang.com/docs/cli) generated by Anchor.


# EVM

The `receiveAndMint(vaa)` method of the EVM contract is the counterpart to the `burnAndSend` instruction of the Solana program.

It verifies the validity of the VAA with the Wormhole core contract and checks that the emitter and emitterChain check out and, importantly(!), that the VAA wasn't claimed before (as to avoid claiming a VAA a second time after having burned the NFT).

It then mints the NFT with the given token id to the specified EVM recipient address (both taken from the Wormhole message in the VAA).


# Parsing VAAs

A tool to parse/inspect VAAs can be found here:
https://vaa.dev/
