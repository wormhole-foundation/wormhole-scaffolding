# Wormhole Integration in Sui

These programs are enumerated the same as the other smart contract
subdirectories (e.g. [evm](../evm)).

## Design Documents

Read the design documents for each example project:

1. [hello-world](../docs/01_hello_world.md)
2. [hello-token](../docs/02_hello_token.md)

## Getting Started

First, you will need `sui` CLI tool. If you do not have this tool, please visit
the [Sui docs] for more details.

Once you have the above CLI tools, install this subdirectory's dependencies,
run `make dependencies`. This will set up `node_modules` and copy smart
contracts from the `sui` directory of the [Wormhole repo].

## Tests

To run both unit and integration tests, run `make test`. If you want to isolate
your testing, use either of these commands:

- `make unit-test` - Runs `sui move test` in each subdirectory of _contracts_
  - TODO
- `make integration-test` - Spawns a Sui local node and uses `ts-mocha` with
  `@mysten/sui.js` to interact with the example programs.

## Code Changes

If you are pushing code to a branch and there is a PR associated with it, we
recommend running `make clean` to make sure the environment does not have any
old artifacts. Then running the tests above afterwards to ensure that all of
the tests run as you expect.

[sui docs]: https://docs.sui.io/build/install
[wormhole repo]: https://github.com/wormhole-foundation/wormhole/tree/main/sui
