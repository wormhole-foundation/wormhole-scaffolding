# Hello World

## Objective

TODO

## Background

TODO

## Goals

TODO

## Non-Goals

TODO

## Overview

TODO

## Detailed Design

TODO

### EVM Interface

```solidity
    function sendMessage(string memory helloWorldMessage)
        public
        payable
        returns (uint64 messageSequence)
    function receiveMessage(bytes memory encodedMessage) public
    function registerEmitter(uint16 emitterChainId, bytes32 emitterAddress) public
```

### Solana Interface

```rust
    pub fn initialize(ctx: Context<Initialize>)
    pub fn register_emitter(
        ctx: Context<RegisterForeignEmitter>,
        chain: u16,
        address: [u8; 32],
    )
    pub fn send_message(ctx: Context<SendMessage>, message: Vec<u8>)
    pub fn receive_message(ctx: Context<ReceiveMessage>, vaa_hash: [u8; 32])
```

### Registering Foreign Emitters

`registerEmitter` and `register_emitter` are owner-only methods, meaning that only the owner of the contract (EVM contract deployer, payer of Solana `initialize` instruction) can invoke these methods.
