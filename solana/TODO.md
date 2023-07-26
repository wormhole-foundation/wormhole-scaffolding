# TODO

## General
* remove all references to batchVAAs

## Modules
* perhaps disregard all following points and wait until bridges have been rewritten using Anchor?
* extract modules (core bridge and token bridge) to be stand alone Rust crates
* get rid of boilerplate doc
* ChainId should be an enum
* use named types e.g. [u8;32] can be both an address or a VAA hash

## Programs
* delete boilerplate comments - aim for more concise source files (nobody wants to look at a tutorial that's several kloc)
* get rid of Wormhole account addresses, finality, and batchId in Config accounts (both hello_world and hello_token). They are all constants and should be treated as such. Allowing a user to initialize the program with incorrect addresses only has downsides.
* using wormhole sequence number in message account derivation prevents concurrent use and hence promotes a bad practice (if multiple users submit transactions for the same block, all but one of them will fail because the message account has already been written to)
* use anchor_lang::system_program to invoke transfer (more idiomatic)
* add remarks to Sysvar accounts (Rent and Clock) that explains why they have to be passed in instead of just using get() (Core bridge was written before the mechanism was available and hence its tech debt that's impossible to prevent from leaking out since there is now way to construct the required account infos on the fly)

## TypeScript
* use anchor provided IDL types for accounts in TS code instead of manually redefining them