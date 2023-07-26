# Wormhole Integration in Solana

These programs are enumerated the same as the other smart contract
subdirectories (e.g. [evm](../evm)).

## Design Documents

Read the design documents for each example project:

1. [hello-world](../docs/01_hello_world.md)
2. [hello-token](../docs/02_hello_token.md)
3. [nft-burn-bridging](../docs/03_nft_burn_bridging.md)

## Getting Started

> **Warning**
> These programs are written assuming you are building with Solana 1.14.19. Any
> higher versions are untested.

First, you will need `cargo` and `anchor` CLI tools. If you need these tools,
please visit the [Anchor book] for more details.

Once you have the above CLI tools, you can build the programs by simply running
`make` which will also install this subdirectory's dependencies, such as
`node_modules` and the Wormhole programs from the `solana` directory of the
[Wormhole repo].



## Tests

> **Note**
> Some users reported issues with `make --version` < 4.x. 
> If you get a make error like `*** missing separator`, try updating to a later `make` version

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
[wormhole repo]: https://github.com/wormhole-foundation/wormhole/tree/main/solana