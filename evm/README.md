# Wormhole Integration in EVM

These programs are enumerated the same as the other smart contract subdirectories (e.g. [solana](../solana)).

## Design Documents

Read the design documents for each example project:

1. [HelloWorld](../docs/01_hello_world.md)
2. [HelloToken](../docs/02_hello_token.md)
3. [NftBurnBridging](../docs/03_nft_burn_bridging.md)

## Prerequisites

Install [Foundry tools](https://book.getfoundry.sh/getting-started/installation), which include `forge`, `anvil` and `cast` CLI tools.

## Build

Simply run `make` to install the necessary dependencies and build with forge, which runs the test simultaneously.

## Test Suite

Run the Solidity-based unit tests with `make unit-test` and the local-validator integration tests via `make integration-test`, or simply `make test` to run both of  them.

## Deployment 

The repo can either be run on a local testnet with [Anvil](https://book.getfoundry.sh/anvil/) or deployed on [Ethereum mainnet + testnet with Forge](https://book.getfoundry.sh/forge/deploying).  
To avoid the overhead of setting up rpc and wallets, use [Remix IDE](https://remix.ethereum.org/). 
