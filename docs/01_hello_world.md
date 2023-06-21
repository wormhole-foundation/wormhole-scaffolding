# Hello World

## Objective

Create a `HelloWorld` style example for using Wormhole's generic-messaging layer for developing xDapps (Cross-Chain Decentralized Applications).

## Background

Currently, no production grade examples exist that detail how to safely integrate with Wormhole's generic-messaging layer on all available networks. Network specific test cases and smart contract design are critical to safely operating an xDapp.

## Goals

Provide a complete example for integrating with Wormhole's generic-messaging layer by providing the following components:

- Fully documented smart contracts
- Unit and integration test suite
- Deployment scripts
- Dependencies for interacting with the Wormhole smart contracts

## Non-Goals

This design focuses only on providing an example to interact with Wormhole's generic-message layer. It does not provide:

- An example off-chain relayer
- Testnet or mainnet deployment funds
- An example User Interface

## Detailed Design

The HelloWorld example xDapp utilizes the Wormhole generic-messaging layer to send and receive arbitrary HelloWorld messages between smart contracts.

Before the HelloWorld contracts can send and receive messages, the owner (see [Registering Foreign Emitters](#registering-foreign-emitters)) of the contract must invoke the `registerEmitter` method to register trusted HelloWorld contracts on other blockchains. The HelloWorld contracts will confirm that all messages that it receives are sent by trusted HelloWorld contracts on other blockchains.

To send a HelloWorld message, one will invoke the `sendMessage` method and pass an arbitrary message as an argument. The HelloWorld contract will then invoke the Wormhole core contract to publish the message. The Wormhole guardians will then attest the message after waiting the specified number of block confirmations (referred to as `wormholeFinality` in the contracts).

Once the message is attested by the Wormhole guardians, one will invoke the `receiveMessage` method and pass the attested Wormhole message as an argument. The receiving HelloWorld contract will parse and verify the attested Wormhole message, and save the arbitrary HelloWorld message in its state.

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
        ctx: Context<RegisterEmitter>,
        chain: u16,
        address: [u8; 32],
    )
    pub fn send_message(ctx: Context<SendMessage>, message: Vec<u8>)
    pub fn receive_message(ctx: Context<ReceiveMessage>, vaa_hash: [u8; 32])
```

### Registering Foreign Emitters

`registerEmitter` is an owner-only methods, meaning that only the owner of the contract (EVM contract deployer, payer of Solana `initialize` instruction) can invoke these methods.
