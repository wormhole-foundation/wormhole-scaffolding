# Hello World

## Objective

Create a `HelloWorld` style example for using Wormhole's generic-messaging layer for developing xDapps (Cross-Chain Decentralized Applications).

## Background

Currently, no production grade examples exist that detail how to safely integrate with Wormhole's generic-messaging layer on all available networks. Network-specific test cases and smart contract design are critical to safely operating an xDapp.

## Goals

Provide a complete example for integrating with Wormhole's generic-messaging layer by providing the following components:

- Fully documented smart contracts
- Unit and integration test suite
- Deployment scripts
- Dependencies for interacting with the Wormhole smart contracts

## Non-Goals

This design focuses only on providing an example of interaction with Wormhole's generic-message layer. It does not provide:

- An example off-chain relayer
- Testnet or mainnet deployment funds
- An example User Interface

## Detailed Design

The HelloWorld example xDapp utilizes the Wormhole generic-messaging layer to send and receive arbitrary messages/payload between smart contracts which for the sake of this example is HelloWorld.

Before the HelloWorld contracts can send and receive messages, the owner (see [Registering Foreign Emitters](#registering-foreign-emitters)) of the contract must invoke the `registerEmitter` method to register trusted HelloWorld contracts on other blockchains. The HelloWorld contracts will confirm that all messages that it receives are sent by trusted HelloWorld contracts on other blockchains.

To send a HelloWorld message, one will invoke the `sendMessage` method and pass an arbitrary message as an argument. The HelloWorld contract will then invoke the Wormhole core contract to publish the message. The Wormhole guardians will then attest the message after waiting for the specified number of block confirmations (referred to as `wormholeFinality` in the contracts).

Once the message is attested by the Wormhole guardians, one will invoke the `receiveMessage` method and pass the attested Wormhole message as an argument. The receiving HelloWorld contract will parse and verify the attested Wormhole message, and save the arbitrary HelloWorld message in its state.

To summarise all the Cross program invocations that interact with Wormhole core contract made->
1. **registerEmitter** to flag the user's HelloWorld contract. 
2. **sendMessage** invoke the message parsing of wormhole which is picked by Guardians.
3. **receiveMessage** to receive VAAs from the wormhole contract and verify the  payload. 
<img width="646" alt="Screenshot 2023-08-19 at 7 41 58 PM" src="https://github.com/wormhole-foundation/wormhole-scaffolding/assets/88841339/03121963-1276-4ee9-baa2-33e2e92a4dbf">



### EVM Interface

```solidity
    function sendMessage(string memory helloWorldMessage)
        public
        payable
        returns (uint64 messageSequence)
    function receiveMessage(bytes memory encodedMessage) public
    function registerEmitter(uint16 emitterChainId, bytes32 emitterAddress) public
```
[EVM core HelloWorld contracts](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/evm/src/01_hello_world)

### Solana Interface

```rust
    pub fn initialize(ctx: Context<Initialize>)
    // creates a public function (open for cpi)
    pub fn register_emitter(
        ctx: Context<RegisterEmitter>,
        chain: u16,
        address: [u8; 32],
    )
    // register_emitter can only be invoked by the account owner 
    pub fn send_message(ctx: Context<SendMessage>, message: Vec<u8>)
    pub fn receive_message(ctx: Context<ReceiveMessage>, vaa_hash: [u8; 32])
```
[Solana HelloWorld contracts](https://github.com/wormhole-foundation/wormhole-scaffolding/tree/main/solana/programs/01_hello_world/src)

### Registering Foreign Emitters

`registerEmitter` is an owner-only methods, meaning that only the owner of the contract (EVM contract deployer, payer of Solana `initialize` instruction) can invoke these methods.
