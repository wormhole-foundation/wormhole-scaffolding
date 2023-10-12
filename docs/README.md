# Documents

## Getting Started walkthrough

1. [Hello World](01_hello_world.md)
   - A simple set of programs employing Wormhole's universal messaging to transmit an arbitrary message, that can be verified by any contract after integrating with Wormhole core Instructions. 
2. [Hello Token](02_hello_token.md)
   - A simple network of contracts that use Wormhole's token bridge contracts to perform cross-chain token transfer with an arbitrary payload [(contract-controlled transfers)](https://book.wormhole.com/technical/evm/tokenLayer.html?highlight=contract-controlled#contract-controlled-transfer) which any of the registered contracts can consume after using 'registerEmitter' function.
3. [NFT Burn Bridging](03_nft_burn_bridging.md)
   - An example for bridging NFTs of a Metaplex NFT collection from Solana to an EVM chain that burns the NFT on Solana, transmits the relevant information via Wormhole, and then remints the equivalent ERC721 NFT on the recipient EVM chain utilizing the simple burn-mint mechanism. 
