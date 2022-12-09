# Wormhole Integration in EVM

These programs are enumerated the same as the other smart contract
subdirectories (e.g. [solana](../solana)).

## Design Documents

Read the design documents for each example project:

1. [HelloWorld](../docs/01_hello_world.md)
2. [HelloToken](../docs/02_hello_token.md)

## Prerequisites

Install [Foundry tools](https://book.getfoundry.sh/getting-started/installation), which include `forge`, `anvil` and `cast` CLI tools.

## Build

Run the following commands to install necessary dependencies and to build the smart contracts:

```
make dependencies
make build
```

## Test Suite

Run the Solidity based unit tests:

```
make unit-test
```

Run the local-validator integration tests:

```
make integration-test
```

To run both the Solidity based unit tests and the local-validator integration test:

```
make test
```
