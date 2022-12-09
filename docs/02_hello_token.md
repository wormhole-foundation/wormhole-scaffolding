# Hello Token

## Objective

Create a `HelloWorld` style example for using Wormhole's token bridge contract for developing xDapps (Cross-Chain Decentralized Applications) utilizing contract-controlled transfers.

## Background

Currently, no production grade examples exist that detail how to safely integrate with Wormhole's token bridge contracts to perform contract-controlled transfers. Network specific test cases and smart contract design are critical to safely operating an XDapp.

See the [Wormhole Book](https://book.wormhole.com/technical/evm/tokenLayer.html?highlight=contract-controlled#contract-controlled-transfer) for more information about contract-controlled transfers.

## Goals

Provide a complete example for integrating with Wormhole's token bridge contract to utilize contract-controlled transfers, by providing the following components:

- Fully documented smart contracts
- Unit and integration test suite
- Deployment scripts
- Dependencies for interacting with the Wormhole token bridge contract

## Non-Goals

This design focuses only on providing an example on how to interact with Wormhole's token bridge contract. It does not provide:

- An example off-chain relayer
- Testnet or mainnet deployment funds
- An example User Interface

## Detailed Design

The HelloToken example XDapp utilizes Wormhole's token bridge contract to send and receive contract-controlled token transfers between a network of smart contracts.

Before the HelloToken contracts can send and receive token transfers, the owner (see [Registering Foreign Emitters](#registering-foreign-emitters)) of the contract must invoke the `registerEmitter` method to register trusted HelloToken contracts on other blockchains. The HelloToken contract will confirm that all messages that it receives are sent by trusted HelloToken contracts on other blockchains.

To transfer tokens to a wallet on a registered HelloToken contract, one will invoke the `sendTokensWithPayload` method (some blockchains may have more than one method available depending on the type of token being transferred) and pass the following arguments:

- `token` - The address of the token
- `amount` - The quantity of tokens to be transferred
- `targetChain` - Wormhole chain ID of the target blockchain
- `batchId` - Wormhole message ID
- `targetRecipient` - The recipient's wallet address on the target blockchain

The HelloToken contract will take custody of the specified tokens, and encode a custom message payload (see [Payloads](#payloads)) to be sent to the target blockchain. The HelloToken contract will then call the `transferTokensWithPayload` method on Wormhole's token bridge contract to initiate a contract-controlled transfer, which will emit a `TransferWithPayload` Wormhole message containing information about the transfer (including the custom HelloToken Payload). The Wormhole guardians will then attest the message after waiting the specified number of block confirmations (referred to as `wormholeFinality` in the contracts).

Once the message is attested by the Wormhole guardians, one will invoke the `redeemTransferWithPayload` method on the HelloToken contract and pass the attested Wormhole message as an argument. The receiving HelloToken contract will then complete the following steps in order:

1.  Call the `completeTransferWithPayload` method on Wormhole's token bridge contract, which will parse and verify the Wormhole message and transfer (or mint) the specified tokens to the HelloToken contract
2.  Parse the additional payload from the `TranferWithPayload` message returned by the token bridge
3.  Verify that the `fromAddress` (the message sender) is a registered HelloToken contract
4.  Pay the caller a small portion (`relayerFeePercentage`) of the transferred tokens if the caller is not the `targetRecipient` encoded in the additional payload (see [Relayer Fee Percentages](#relayer-fee-percentages))
5.  Transfer the tokens to the `targetRecipient`

### Payloads

HelloToken Payload

```
// payloadID uint8 = 1;
uint8 payloadId;

// recipient's wallet address on the target blockchain
bytes32 targetRecipient;
```

### EVM Interface

```solidity
function sendTokensWithPayload(
    address token,
    uint256 amount,
    uint16 targetChain,
    uint32 batchId,
    bytes32 targetRecipient
) public payable returns (uint64 messageSequence)

function redeemTransferWithPayload(bytes memory encodedTransferMessage) public

function calculateRelayerFee(uint256 amount) public view returns (uint256)

function fetchLocalAddressFromTransferMessage(bytes memory payload) public view returns (address localAddress)

function registerEmitter(uint16 emitterChainId, bytes32 emitterAddress) public

function updateRelayerFee(uint32 relayerFeePercentage, uint32 relayerFeePrecision) public
```

### Solana Interface

```rust
pub fn initialize(
    ctx: Context<Initialize>,
    relayer_fee: u32,
    relayer_fee_precision: u32,
)

pub fn send_native_tokens_with_payload(
    ctx: Context<SendNativeTokensWithPayload>,
    batch_id: u32,
    amount: u64,
    recipient_address: [u8; 32],
    recipient_chain: u16,
)

pub fn redeem_native_transfer_with_payload(
    ctx: Context<RedeemNativeTransferWithPayload>,
    _vaa_hash: [u8; 32],
)

pub fn send_wrapped_tokens_with_payload(
    ctx: Context<SendNativeTokensWithPayload>,
    batch_id: u32,
    amount: u64,
    recipient_address: [u8; 32],
    recipient_chain: u16,
)

pub fn redeem_wrapped_transfer_with_payload(
    ctx: Context<RedeemNativeTransferWithPayload>,
    _vaa_hash: [u8; 32],
)

pub fn register_foreign_contract(
    ctx: Context<RegisterForeignContract>,
    chain: u16,
    address: [u8; 32],
)

pub fn update_relayer_fee(
    ctx: Context<UpdateRelayerFee>,
    relayer_fee: u32,
    relayer_fee_precision: u32
)
```

### Registering Foreign Emitters

`registerEmitter` is an owner-only method, meaning that only the owner of the contract (EVM contract deployer, payer of Solana `initialize` instruction) can invoke these methods.

### Relayer Fee Percentages

The `relayerFee` state variable determines how much the relayer (redeemer of the transfer) is paid for completing the transfer on behalf of the target recipient. The `updateRelayerFee` method is an owner-only method, and allows the owner to update the `relayerFee` on each of the HelloToken contracts.
