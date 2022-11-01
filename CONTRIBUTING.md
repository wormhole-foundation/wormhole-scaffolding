# Contributing to Wormhole Scaffolding

:pray: Thank you for spending some time to contribute! :pray:

We hope to outline some clear guidelines for contributing. This repository
hopes to achieve its goal of showcasing many examples of [Wormhole]
integrations. **If we missed any important aspects of contributing in this
document, please submit a [pull request] to modify this document.**

Almost everything starts with a Github issue. And if your issue has a solution,
it will end up being a pull request. The different types of issues are listed
in the table of contents.

## Table of Contents

- [Structure]
  - [docs]
  - [evm]
  - [solana]
- [Issues]
  - [Reporting Bugs] :bug:
  - [Missing or Incorrect Documentation] :page_with_curl:
  - [New Networks] :computer:
  - [New Examples] :alien:
  - [Help Wanted] :heart_eyes:
- [Pull Requests]
- [Questions]
- [Final Words]

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

- `forge-scripts` - Useful scripts written in Solidity.
- `forge-test` - Scripts written in Solidity meant to be run using
  `forge test`.
- `modules` - Work-in-progress modules that will eventually become dependencies
  that exist as an `npm` library or as a `forge` submodule.
- `shell-scripts` - Useful shell scripts.
- `src` - Smart contract source code, separated by each example (enumerated).
- `ts-test` - Scripts written in Typescript ([TS-Mocha]) using [ethers.js] to
  interact with smart contracts deployed to `anvil` as a mainnet fork.

Please read the [evm README] for more details.

### Solana

We have put tgoether the Solana directory assuming a program structure similar
to how `anchor init` creates your environment. Because of this, all of these
programs are written assuming the [Anchor] framework. Here are the
subdirectories:

- `dependencies` - Wormhole-related artifacts live here (built from the
  [Wormhole] repo).
- `modules` - Work-in-progress modules that will eventually become dependencies
  that exist as a `cargo` library.
- `programs` - Program source code, separated by each example (enumerated).
- `shell-scripts` - Useful shell scripts.
- `ts` - Web3 SDK and scripts written in Typescript ([TS-Mocha]) to interact
  with programs loaded in a Solana local validator run with `anchor test`.

Please read the [Solana README] for more details.

## Issues

These are the different categories of issues that exist in this repository.
Some of these issues may be marked with "good first issue," which is an
indication that the issue is good for a newcomer to Wormhole or blockchain
development in general. And if for some reason an issue is not relevant to
Wormhole integrations, an issue may be marked as "invalid."

You can find the list of issues
[here](https://github.com/certusone/wormhole-scaffolding/issues).

### Reporting Bugs

A bug in our examples constitutes anything that has undesirable behavior. This
includes (and is not limited to) malfunctioning methods (unexpected
state-changes and output), vulnerabilities (re-entrancy, fake account
injection, etc) and undefined behavior.

With vulnerabilities, we hope to illustrate as much as we can with protections
against known vulnerabilities. We encourage contributors to add more test
coverage!

If a potential bug is found, be sure to write specifically:

- What the bug is at a high-level
- At least one example of how the bug can be exploited
- A potential solution (either written in the issue or submitted
  [pull request])

Here are the list of [bug-related issues].

### Missing or Incorrect Documentation

Maybe missing or incorrect documentation is technically a bug. But we want to
highlight the importance of documentation in a separate section.

We try our best to document everything. Because this repository warehouses
examples of how to integrate with Wormhole, it is very important to describe
the integration as clearly as possible. And each smart contract's
implementation should reflect what is written in its respective whitepaper.

There may be some experimental features that we hope to capture in some
examples. Because these example features may be changing frequently (e.g. if
an example happens to reference a particular [Wormhole PR]), comments may not
be accurate. These count as issues because if a feature changes, the example
and its documentation needs to reflect these changes.

Here are some examples of some possible issues:

- Blockchain network environment set-up is wrong or outdated.
- Comments do not reflect a field, method or object accurately.
- Whitepaper mismatches implementation for a particular blockchain network.

Here is the list of [documentation issues].

### New Networks

Introducing a new network is a big task. In order to adequately cover a
Wormhole integration with a new network, the examples start with the
whitepapers found in the [docs]. All of the smart contracts written in
this repository must reflect the business logic written in these whitepapers.

Test coverage (unit tests and integration tests) are a main part of these smart
contract examples. Because we aim to demonstrate these Wormhole integrations
sending messages to their other network counterparts, there should be
exhaustive test coverage that illustrates all functionality before it can be
considered deployable to mainnet. **We cannot accept a pull request for a new
network if these tests are not met. We consider these examples incomplete.** If
you need help writing specific tests, we can try to help out whenever we can.

We also recommend that the subdirectory representing a specific network to
reflect how those applications exist in that specific ecosystem (e.g. our
EVM contracts closely resemble the directory structure when `forge init` is
called). This network's subdirectory should be inviting to other developers
of that ecosystem.

Here is the list of [new network issues].

### New Examples

Coming up with a new example network of smart contracts to illustrate a new
use case is really exciting! Some examples of how smart contracts across
different networks talk to each other can be modeled using networking
designs like [ZeroMQ Messaging Patterns] for example.

If you have a new idea for an example, you should start by writing a whitepaper
with some psuedocode at least (targeting specific blockchain development
languages is preferred, though).

Here is the list of [new example issues].

### Help Wanted

These issues can span any of the other categories of issues (new networks,
documentation, etc). We will mark whichever issue with "help wanted" if we
cannot prioritize working on these issues or if we do not have the
background to fulfill these tasks.

Here is the list of [help wanted issues].

## Pull Requests

A pull request (PR) is a request to merge changes from one branch with another
branch. Repositories each have their own procedures for submitting a PR, so
we will outline a simple procedure that you should follow. Following this
procedure will facilitate its merge to the `main` branch because the code
owners will have an easier time understanding the code and documentation
changes, as well as the thought process behind these changes.

**Only code owners can approve and merge a pull request.** Only one approval
is required before the code is merged.

In the PR description, please describe the following:

1. The objective of the PR.
   - A high-level description of what the PR aims to do and why it should
     be merged into the `main` branch.
   - This objective may include an issue number, which you can reference by
     using a hash (#) followed by the issue number.
2. How to review the PR.
   - Before a PR gets merged, code owners need to review and approve the
     changes before your branch gets merged into `main`. If the code owners have
     any problems reviewing the code, they will write comments referencing
     specific line numbers. You should then respond to by either writing a
     comment in response or checking in another commit reflecting the code
     owner's comment.

**If there are any continuous integration (CI) tests, the existing tests must
pass.** These repository tests are very important for making sure that core
logic existing in the `main` branch has not changed. If a CI test is changed
or added, please be as descriptive as you can about what changed so we can pay
close attention to what happened with the test.

You can find the list of pull requests
[here](https://github.com/certusone/wormhole-scaffolding/pulls).

## Questions

Currently the only spot we can take questions is if there is a [github issue]
outlining the problem. We will try to answer all questions. But keep in mind
that more specific questions (with examples if appropriate) will probably be
addressed sooner than others. Questions too vague may be marked as "won't fix."

## Final Words

Again, thank you for your contributions to the Wormhole Scaffolding repository.
This repository becomes better when more of the community participates in its
development.

[anchor]: https://www.anchor-lang.com/
[bug-related issues]: https://github.com/certusone/wormhole-scaffolding/labels/bug
[docs]: #docs
[documentation issues]: https://github.com/certusone/wormhole-scaffolding/labels/documentation
[ethers.js]: https://docs.ethers.io/v5/
[evm]: #evm
[evm readme]: evm/README.md
[final words]: #final-words
[github issue]: https://github.com/certusone/wormhole-scaffolding/issues
[issues]: #issues
[help wanted]: #help-wanted
[help wanted issues]: https://github.com/certusone/wormhole-scaffolding/labels/help%20wanted
[missing or incorrect documentation]: #missing-or-incorrect-documentation
[new examples]: #new-examples
[new example issues]: https://github.com/certusone/wormhole-scaffolding/labels/new%20example
[new networks]: #new-networks
[new network issues]: https://github.com/certusone/wormhole-scaffolding/labels/new%network
[pull request]: #pull-requests
[pull requests]: #pull-requests
[questions]: #questions
[reporting bugs]: #reporting-bugs
[solana]: #solana
[solana readme]: solana/README.md
[structure]: #structure
[ts-mocha]: https://github.com/piotrwitek/ts-mocha
[wormhole]: https://github.com/wormhole-foundation/wormhole
[wormhole pr]: https://github.com/wormhole-foundation/wormhole/pulls
[zeromq messaging patterns]: https://zguide.zeromq.org/docs/chapter2/#Messaging-Patterns
