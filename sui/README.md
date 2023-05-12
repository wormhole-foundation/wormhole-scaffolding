# Wormhole Integration in Sui

These programs are enumerated the same as the other smart contract
subdirectories (e.g. [solana](../solana)).

## Design Documents

Read the design documents for each example project (only `HelloToken` is implemented for Sui currently):

1. [HelloWorld](../docs/01_hello_world.md)
2. [HelloToken](../docs/02_hello_token.md)

## Dependencies

Install the `Sui` CLI. This tool is used to compile the contracts and run the tests.

```sh
cargo install --locked --git https://github.com/MystenLabs/sui.git --rev 09b2081498366df936abae26eea4b2d5cafb2788 sui sui-faucet
```

### Worm CLI

First, checkout the [Wormhole](https://github.com/wormhole-foundation/wormhole) repo, then install the CLI tool by running:

```sh
wormhole/clients/js $ make install
```

`worm` is the swiss army knife for interacting with wormhole contracts on all
supported chains, and generating signed messages (VAAs) for testing.

## Build

Run the following commands to install the necessary Wormhole and Token Bridge dependencies:

```
make dependencies
```

## Testing Environment

The testing environments can be found in the following locations:

- [Unit Tests](./contracts/hello_token/) (see the source code)
- [Integration Tests](./ts/tests/02_hello_token.ts)

You can run the tests with the following commands:

```
# Move-based Unit tests
make unit-test

# local-validator integration tests written in typescript
make integration-test

# unit tests and local-validator integration tests
make test
```
