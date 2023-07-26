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

Simply run `make` to install the necessary dependencies and to build the smart contracts.

## Test Suite

Run the Solidity-based unit tests with `make unit-test` and the local-validator integration tests via `make integration-test`, or simply `make test` to run both of of them.
