# Contributing to Wormhole Scaffolding

:pray: Thank you for spending some time to contribute! :pray:

We hope to outline some clear guidelines for contributing. This repository
hopes to achieve its goal of showcasing many examples of [Wormhole]
integrations. **If we missed any important aspects of contributing, please
submit a pull request to modify this document.**

Almost everything starts with a [Github issue]. The different types of issues
are listed in the table of contents.

## Table of Contents

- [Structure]
  - [docs]
  - [evm]
  - [solana]
- [Issues]
  - [Reporting Bugs] :bug:
  - [Missing or Incorrect Documentation] :page_with_curl:
  - [Help Wanted] :heart_eyes:
  - [New Network] :computer:
  - [New Examples] :alien:
- [Questions]

## Structure

Currently we aim to structure this repository like the [Wormhole] repository,
where each blockchain network has its own subdirectory. Each subdirectory will
try to resemble how a typical repository looks for that specific network.

### Docs

Whitepapers for each example exist here. If there are any whitepapers missing
entirely or any info specific to a particular implementation is missing or wrong,
please see [Missing or Incorrect Documentation] on how to submit an issue.

### EVM

We have put together the EVM (Ethereum Virtual Machine) directory assuming a
smart contract structure similar to how `forge init` creates your environment.
Here are the subdirectories:

- `forge-scripts` - Useful scripts written in Solidity
- `forge-test` - Scripts written in Solidity meant to be run using `forge test`
- `modules` - Work-in-progress modules that will eventually become dependencies
  that exist in `npm` or as a `forge` submodule
- `shell-scripts` - Useful shell scripts
- `src` - Smart contract source code, separated by each example (enumerated)
- `ts-test` - Scripts written in Typescript ([TS-Mocha]) using [ethers.js] to
  interact with smart contracts deployed to `anvil` as a mainnet fork

Please read the [evm README] for more details.

### Solana

Please read the [Solana README] for more details.

## Issues

These are the different categories of issues that exist in this repository.
Some of these issues may be marked with "good first issue," which is an
indication that the issue is good for a newcomer to Wormhole or blockchain
development in general. And if for some reason an issue is not relevant to
Wormhole integrations, an issue may be marked as "invalid."

### Reporting Bugs

Here are the list of [bug-related issues].

### Missing or Incorrect Documentation

Maybe missing or incorrect documentation is technically a bug. But we want to
highlight the importance of documentation in a separate section.

We try our best to document everything. Because this repository warehouses
examples of how to integrate with Wormhole, it is very important to describe
the integration as clearly as possible. And each smart contract's
implementation should reflect what is written in their respective whitepaper.

There also may be some experimental features that we hope to capture in some
examples. Because these example features may be changing frequently (e.g. if
an example happens to reference a particular [Wormhole PR]), comments may not
be accurate. These count as issues because if a feature changes, the example
and its documentation needs to reflect these changes.

Here are some examples of some possible issues:

- Blockchain network environment set-up is wrong or outdated.
- Comments do not reflect a field, method or object accurately.
- Whitepaper mismatches implementation for a particular blockchain network.

Here are the list of [documentation issues].

## Help Wanted

Here are the list of [help wanted issues].

## New Networks

Here are the list of [new network issues].

## New Examples

Here are the list of [new example issues].

[bug-related issues]: https://github.com/certusone/wormhole-scaffolding/labels/bug
[docs]: #docs
[documentation issues]: https://github.com/certusone/wormhole-scaffolding/labels/documentation
[ethers.js]: https://docs.ethers.io/v5/
[evm]: #evm
[evm readme]: evm/README.md
[github issue]: https://github.com/certusone/wormhole-scaffolding/issues
[issues]: #issues
[help wanted]: #help-wanted
[help wanted issues]: https://github.com/certusone/wormhole-scaffolding/labels/help%20wanted
[missing or incorrect documentation]: #missing-or-incorrect-documentation
[new examples]: #new-examples
[new example issues]: https://github.com/certusone/wormhole-scaffolding/labels/new%20example
[new network]: #new-network
[new network issues]: https://github.com/certusone/wormhole-scaffolding/labels/new%network
[questions]: #questions
[reporting bugs]: #reporting-bugs
[solana]: #solana
[structure]: #structure
[ts-mocha]: https://github.com/piotrwitek/ts-mocha
[wormhole]: https://github.com/wormhole-foundation/wormhole
[wormhole pr]: https://github.com/wormhole-foundation/wormhole/pulls
