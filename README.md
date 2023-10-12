# Wormhole Scaffolding

This repository warehouses apps that integrate with Wormhole generic messaging and existing apps that use Wormhole message passing. These apps range in complexity and demonstrate how to organize your business logic in your smart contracts. These examples show the basic structure of an xdapp and how the wormhole works with the respective programming environment.
Example repos also include tests to debug and deploy the dapps in local environment. 

There are 3 example dapps that give a walkthrough on some of the core components of the wormhole messaging and portal token bridge. 
1. [Hello World](https://github.com/wormhole-foundation/wormhole-scaffolding/blob/main/docs/01_hello_world.md) -> [Solana](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/solana/programs/01_hello_world) | [EVM](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/evm/src/01_hello_world)
2. [Hello Token](https://github.com/wormhole-foundation/wormhole-scaffolding/blob/main/docs/02_hello_token.md) -> [Solana](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/solana/programs/02_hello_token) | [EVM](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/evm/src/02_hello_token)
3. [NFT Burn Bridging](https://github.com/wormhole-foundation/wormhole-scaffolding/blob/main/docs/03_nft_burn_bridging.md) -> [Solana](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/solana/programs/03_nft_burn_bridging) | [EVM](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/evm/src/03_nft_burn_bridging)

## Prerequisites

### EVM

If your xChain app will require EVM smart contracts, we recommend using [Foundry tools](https://book.getfoundry.sh/getting-started/installation), which include `forge`, `anvil` and `cast` CLI tools.

### Solana

If your xChain app will require Solana programs, prepare your development environment by installing [Solana and Anchor dependencies](https://book.anchor-lang.com/getting_started/installation.html), which include `solana` and `anchor` CLI tools.

Anchor helps in abstracting solana architecture boilerplate code. However, it has its own challenges so you can still write programs in native rust, download ['rust-analyzer'](https://rust-analyzer.github.io/) to debug and write efficient rust.

### SUI

Install the `Sui` CLI. This tool is used to compile the contracts and run the tests.

```sh
cargo install --locked --git https://github.com/MystenLabs/sui.git --rev 09b2081498366df936abae26eea4b2d5cafb2788 sui sui-faucet
```

### Worm CLI

First, check out the [Wormhole](https://github.com/wormhole-foundation/wormhole) repo, then install the CLI tool by running:

```sh
wormhole/clients/js $ make install
```

`worm` is the swiss army knife for interacting with wormhole contracts on all
supported chains, verifying payloads, and generating VAAs. 
Head to [Cli docs](https://docs.wormhole.com/wormhole/reference/cli-docs) to learn more. 

## Build and Test

Each directory represents Wormhole integrations for specific blockchain networks. Please navigate
to a network subdirectory to see more details on building and testing.
If you have questions or doubts join the [wormhole discord](https://discord.gg/8dRSUqAW). 
