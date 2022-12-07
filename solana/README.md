# Wormhole Integration in Solana

These programs are enumerated the same as the other smart contract
subdirectories (e.g. [evm](../evm)).

## Design Documents

Read the design documents for each example project:

1. [hello-world](../docs/01_hello_world.md)
2. [hello-token](../docs/02_hello_token.md)

## Getting Started

First, you will need `cargo` and `anchor` CLI tools. If you need these tools,
please visit the [Anchor book] for more details.

Once you have the above CLI tools, install this subdirectory's dependencies,
run `make dependencies`. This will set up `node_modules` and compile program
BPFs from the `solana` directory of the [Wormhole repo].

## Tests

To run both unit and integration tests, run `make test`. If you want to isolate
your testing, use either of these commands:

- `make unit-test` - Runs `cargo clippy` and `cargo test`
- `make integration-test` - Spawns a solana local validator and uses `ts-mocha`
  with `@solana/web3.js` to interact with the example programs.

## Code Changes

If you are pushing code to a branch and there is a PR associated with it, we
recommend running `make clean` to make sure the environment does not have any
old artifacts. Then running the tests above afterwards to ensure that all of
the tests run as you expect.

[anchor book]: https://book.anchor-lang.com/getting_started/installation.html
[wormhole repo]: https://github.com/wormhole-foundation/wormhole/tree/dev.v2/solana
