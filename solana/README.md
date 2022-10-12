# Wormhole Integration in Solana

These programs are enumerated the same as the other smart contract subdirectories:

- [EVM](../evm)

## Getting Started

First, you will need `cargo` and `anchor` CLI tools. If you need these tools, please visit the [Anchor book](https://book.anchor-lang.com/getting_started/installation.html) for more details.

Install dependencies by doing the following:

```bash
make dependencies
```

This will set up `node_modules` and compile program BPFs from the [Wormhole repo](https://github.com/wormhole-foundation/wormhole).

## Tests

Perform unit (Cargo) tests by doing the following:

```bash
make unit-test
```

And perform integration (Typescript) test by doing the following:

```bash
make integration-test
```
