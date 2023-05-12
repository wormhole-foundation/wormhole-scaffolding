import {expect} from "chai";
import {CHAIN_ID_SUI, parseTransferPayload} from "@certusone/wormhole-sdk";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  ETHEREUM_TOKEN_BRIDGE_ADDRESS,
  GUARDIAN_PRIVATE_KEY,
  WALLET_PRIVATE_KEY,
  RELAYER_PRIVATE_KEY,
  CREATOR_PRIVATE_KEY,
  WORMHOLE_STATE_ID,
  TOKEN_BRIDGE_STATE_ID,
  HELLO_TOKEN_ID,
  HELLO_TOKEN_OWNER_CAP_ID,
  HELLO_TOKEN_UPGRADE_CAP_ID,
  COIN_8_TYPE,
  COIN_10_TYPE,
  SUI_TYPE,
  WORMHOLE_ID,
  TOKEN_BRIDGE_ID,
} from "../src/consts";
import {
  Ed25519Keypair,
  JsonRpcProvider,
  RawSigner,
  localnetConnection,
  TransactionBlock,
  SUI_CLOCK_OBJECT_ID,
} from "@mysten/sui.js";
import {
  getObjectFields,
  getWormholeEvents,
  tokenBridgeNormalizeAmount,
  getWormholeFee,
  getCoinWithHighestBalance,
  parseHelloTokenPayload,
  getTableByName,
  createHelloTokenPayload,
  getBalanceChangeFromTransaction,
  calculateRelayerFee,
} from "../src";

describe("2: Hello Token", () => {
  const provider = new JsonRpcProvider(localnetConnection);

  // User wallet.
  const wallet = new RawSigner(
    Ed25519Keypair.fromSecretKey(WALLET_PRIVATE_KEY),
    provider
  );

  // Relayer wallet.
  const relayer = new RawSigner(
    Ed25519Keypair.fromSecretKey(RELAYER_PRIVATE_KEY),
    provider
  );

  // Deployer wallet.
  const creator = new RawSigner(
    Ed25519Keypair.fromSecretKey(CREATOR_PRIVATE_KEY),
    provider
  );

  // Mock guardians for signing wormhole messages.
  const guardians = new mock.MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);

  const localVariables: any = {};

  describe("Set Up Hello Token Contract", () => {
    // Foreign contract.
    const foreignChain = 2;
    const foreignContractAddress = Buffer.alloc(32, "deadbeef");
    const relayerFee = "50000"; // 5%
    const relayerFeePrecision = "1000000"; // 1e6

    it("Create Hello Token state", async () => {
      // Call `owner::create_state` on the Hello Token contract.
      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${HELLO_TOKEN_ID}::owner::create_state`,
        arguments: [
          tx.object(HELLO_TOKEN_OWNER_CAP_ID),
          tx.object(HELLO_TOKEN_UPGRADE_CAP_ID),
          tx.object(WORMHOLE_STATE_ID),
          tx.pure(relayerFee),
          tx.pure(relayerFeePrecision),
        ],
      });

      tx.setGasBudget(50_000);
      const result = await creator.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: {showObjectChanges: true},
      });
      expect(result.digest).is.not.null;

      // Transaction is successful, so grab state ID.
      for (const objectEvent of result.objectChanges!) {
        if (
          objectEvent["type"] == "created" &&
          objectEvent["objectType"].includes("state::State")
        ) {
          localVariables.stateId = objectEvent["objectId"];
          break;
        }
      }

      // Fetch the state object fields and validate the setup.
      const state = await getObjectFields(provider, localVariables.stateId);

      expect("emitter_cap" in state!).is.true;
      expect(state!.relayer_fee.fields.value).equals(relayerFee);
      expect(state!.relayer_fee.fields.precision).equals(relayerFeePrecision);
    });

    it("Register foreign contract (Ethereum)", async () => {
      expect(localVariables.stateId).is.not.undefined;
      const stateId: string = localVariables.stateId;

      // Register a foreign contract on the Hello Token contract.
      const tx = new TransactionBlock();
      tx.moveCall({
        target: `${HELLO_TOKEN_ID}::owner::register_foreign_contract`,
        arguments: [
          tx.object(HELLO_TOKEN_OWNER_CAP_ID),
          tx.object(stateId),
          tx.pure(foreignChain),
          tx.pure(foreignContractAddress),
        ],
      });

      tx.setGasBudget(50_000);
      const result = await creator.signAndExecuteTransactionBlock({
        transactionBlock: tx,
      });
      expect(result.digest).is.not.null;

      // Fetch the `foreign_contracts` table.
      const registeredContracts = await getTableByName(
        provider,
        stateId,
        "foreign_contracts"
      );
      expect(registeredContracts).has.length(1);

      // Verify that the contract was registered correctly.
      expect(parseInt(registeredContracts![0][0])).to.equal(foreignChain);
      expect(
        Buffer.from(
          registeredContracts![0][1].fields.value.fields.data
        ).toString("hex")
      ).to.equal(foreignContractAddress.toString("hex"));
    });
  });

  describe("Test Business Logic", () => {
    // Mock foreign token bridge.
    const ethereumTokenBridge = new mock.MockEthereumTokenBridge(
      ETHEREUM_TOKEN_BRIDGE_ADDRESS
    );

    // Foreign HelloToken contract.
    const foreignChain = "2";
    const foreignContractAddress = Buffer.alloc(32, "deadbeef");

    // Transfer nonce.
    const nonce = 69;

    describe("Coin 8", () => {
      // The `transferAmount` will be transferred outbound in the first test.
      // The two following tests will use the `transferAmount` that is
      // deposited in the bridge to test complete transfer functionality.
      // For both tests to be successful, the following must be true:
      //     * transferAmount >= mintAmount1 + mintAmount2
      const outboundTransferAmount = "100000000000";

      it("Send tokens with payload", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Fetch wallet address.
        const walletAddress = await wallet.getAddress();

        // Fetch sui coins to pay the wormhole fee.
        const feeAmount = await getWormholeFee(provider);

        // Fetch coin 8.
        const coin = await getCoinWithHighestBalance(
          provider,
          walletAddress,
          COIN_8_TYPE
        );

        // Balance check before transferring tokens.
        const coinBalanceBefore = await provider.getBalance({
          owner: walletAddress,
          coinType: COIN_8_TYPE,
        });

        // Start new transaction.
        const tx = new TransactionBlock();

        // Wormhole fee coins.
        const [wormholeFee] = tx.splitCoins(tx.gas, [tx.pure(feeAmount)]);

        // Coins to transfer to the target chain.
        const [coinsToTransfer] = tx.splitCoins(tx.object(coin.coinObjectId), [
          tx.pure(outboundTransferAmount),
        ]);

        // Fetch the asset info.
        const [assetInfo] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::state::verified_asset`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID)],
          typeArguments: [COIN_8_TYPE],
        });

        // Fetch the transfer ticket.
        const [transferTicket] = tx.moveCall({
          target: `${HELLO_TOKEN_ID}::transfer::send_tokens_with_payload`,
          arguments: [
            tx.object(stateId),
            coinsToTransfer,
            assetInfo,
            tx.pure(foreignChain),
            tx.pure(walletAddress),
            tx.pure(nonce),
          ],
          typeArguments: [COIN_8_TYPE],
        });

        // Transfer the tokens with payload.
        const [messageTicket] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::transfer_tokens_with_payload::transfer_tokens_with_payload`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), transferTicket],
          typeArguments: [COIN_8_TYPE],
        });

        // Publish the message.
        tx.moveCall({
          target: `${WORMHOLE_ID}::publish_message::publish_message`,
          arguments: [
            tx.object(WORMHOLE_STATE_ID),
            wormholeFee,
            messageTicket,
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });

        tx.setGasBudget(50_000);
        const eventData = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: tx,
          options: {
            showEvents: true,
          },
        });

        // Fetch wormhole events.
        const wormholeEvents = getWormholeEvents(eventData);
        expect(wormholeEvents!.length).equals(1);

        // Parse the emitted Wormhole message and verify the payload.
        const message = wormholeEvents![0].parsedJson;
        expect(message.consistency_level).equal(0);
        expect(message.sequence).equals("3");
        expect(message.nonce).equals(nonce);

        // Cache state.
        const state = await getObjectFields(provider, stateId);

        // Verify the transfer payload.
        {
          const transferPayload = await parseTransferPayload(
            Buffer.from(message.payload)
          );
          expect(transferPayload.amount.toString()).to.equal(
            outboundTransferAmount
          );
          expect(transferPayload.fromAddress!).equals(
            state!.emitter_cap.fields.id.id.substring(2)
          );
          expect(transferPayload.originChain).to.equal(CHAIN_ID_SUI);
          expect(transferPayload.targetAddress).to.equal(
            foreignContractAddress.toString("hex")
          );
          expect(transferPayload.targetChain).to.equal(Number(foreignChain));
        }

        // Verify the additional payload.
        {
          const helloTokenPayload = parseHelloTokenPayload(
            Buffer.from(message.payload)
          );
          expect(helloTokenPayload.payloadType).equals(1);
          expect(helloTokenPayload.recipient).equals(walletAddress);
        }

        // Balance check after transferring tokens.
        const coinBalanceAfter = await provider.getBalance({
          owner: walletAddress,
          coinType: COIN_8_TYPE,
        });
        expect(
          parseInt(coinBalanceBefore.totalBalance) -
            parseInt(coinBalanceAfter.totalBalance)
        ).eq(parseInt(outboundTransferAmount));
      });

      it("Redeem transfer with relayer", async () => {
        expect(localVariables.stateId).is.not.undefined;

        // Cache stateId and fetch the state.
        const stateId: string = localVariables.stateId;
        const state = await getObjectFields(provider, stateId);

        // Save wallet and relayer addresses.
        const walletAddress = await wallet.getAddress();
        const relayerAddress = await relayer.getAddress();

        // Define transfer parameters.
        const mintAmount = Math.floor(Number(outboundTransferAmount) / 2);
        const recipient = walletAddress;
        const tokenAddress = await provider
          .getCoinMetadata({
            coinType: COIN_8_TYPE,
          })
          .then((result) => result!.id);

        // Create payload.
        const payload = createHelloTokenPayload(recipient);

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tokenAddress!.substring(2),
          CHAIN_ID_SUI, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          state!.emitter_cap.fields.id.id.substring(2), // targetContractAddress
          foreignContractAddress, // fromAddress
          Buffer.from(payload.substring(2), "hex"),
          nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Complete the transfer with payload.
        let receipt;
        {
          // Start new transaction.
          const tx = new TransactionBlock();

          // Parse and verify the vaa.
          const [parsedVaa] = tx.moveCall({
            target: `${WORMHOLE_ID}::vaa::parse_and_verify`,
            arguments: [
              tx.object(WORMHOLE_STATE_ID),
              tx.pure(Array.from(signedWormholeMessage)),
              tx.object(SUI_CLOCK_OBJECT_ID),
            ],
          });

          // Verify the VAA with the token bridge.
          const [tokenBridgeMessage] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::vaa::verify_only_once`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), parsedVaa],
          });

          // Authorize the transfer.
          const [redeemerReceipt] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::complete_transfer_with_payload::authorize_transfer`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), tokenBridgeMessage],
            typeArguments: [COIN_8_TYPE],
          });

          // Complete the tranfer.
          tx.moveCall({
            target: `${HELLO_TOKEN_ID}::transfer::redeem_transfer_with_payload`,
            arguments: [tx.object(stateId), redeemerReceipt],
            typeArguments: [COIN_8_TYPE],
          });

          tx.setGasBudget(50_000);
          receipt = await relayer.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
              showBalanceChanges: true,
            },
          });
        }

        // Fetch balance changes.
        const recipientCoinChange = getBalanceChangeFromTransaction(
          walletAddress,
          COIN_8_TYPE,
          receipt.balanceChanges
        );
        const relayerCoinChange = getBalanceChangeFromTransaction(
          relayerAddress,
          COIN_8_TYPE,
          receipt.balanceChanges
        );

        // Compute the expected relayer fee to be paid by the contract.
        const expectedFee = calculateRelayerFee(mintAmount, state);

        // Validate relayer balance change.
        expect(relayerCoinChange).equals(expectedFee);

        // Confirm recipient balance changes.
        expect(recipientCoinChange).equals(mintAmount - expectedFee);
      });

      it("Recipient self redeems transfer", async () => {
        expect(localVariables.stateId).is.not.undefined;

        // Cache stateId and fetch the state.
        const stateId: string = localVariables.stateId;
        const state = await getObjectFields(provider, stateId);

        // Save wallet and relayer addresses.
        const walletAddress = await wallet.getAddress();

        // Define transfer parameters.
        const mintAmount = Math.floor(Number(outboundTransferAmount) / 2);
        const recipient = walletAddress;
        const tokenAddress = await provider
          .getCoinMetadata({
            coinType: COIN_8_TYPE,
          })
          .then((result) => result!.id);

        // Create payload.
        const payload = createHelloTokenPayload(recipient);

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tokenAddress!.substring(2),
          CHAIN_ID_SUI, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          state!.emitter_cap.fields.id.id.substring(2), // targetContractAddress
          foreignContractAddress, // fromAddress
          Buffer.from(payload.substring(2), "hex"),
          nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Complete the transfer with payload.
        let receipt;
        {
          // Start new transaction.
          const tx = new TransactionBlock();

          // Parse and verify the vaa.
          const [parsedVaa] = tx.moveCall({
            target: `${WORMHOLE_ID}::vaa::parse_and_verify`,
            arguments: [
              tx.object(WORMHOLE_STATE_ID),
              tx.pure(Array.from(signedWormholeMessage)),
              tx.object(SUI_CLOCK_OBJECT_ID),
            ],
          });

          // Verify the VAA with the token bridge.
          const [tokenBridgeMessage] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::vaa::verify_only_once`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), parsedVaa],
          });

          // Authorize the transfer.
          const [redeemerReceipt] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::complete_transfer_with_payload::authorize_transfer`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), tokenBridgeMessage],
            typeArguments: [COIN_8_TYPE],
          });

          // Complete the tranfer.
          tx.moveCall({
            target: `${HELLO_TOKEN_ID}::transfer::redeem_transfer_with_payload`,
            arguments: [tx.object(stateId), redeemerReceipt],
            typeArguments: [COIN_8_TYPE],
          });

          tx.setGasBudget(50_000);

          // NOTE: redeem the transfer with the recipient wallet.
          receipt = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
              showBalanceChanges: true,
            },
          });
        }

        // Fetch balance changes.
        const recipientCoinChange = getBalanceChangeFromTransaction(
          walletAddress,
          COIN_8_TYPE,
          receipt.balanceChanges
        );

        // Confirm that the recipient received the full mintAmount.
        expect(recipientCoinChange).equals(mintAmount);
      });
    });

    describe("Coin 10", () => {
      // The `transferAmount` will be transferred outbound in the first test.
      // The two following tests will use the `transferAmount` that is
      // deposited in the bridge to test complete transfer functionality.
      // For both tests to be successful, the following must be true:
      //     * transferAmount >= mintAmount1 + mintAmount2
      const outboundTransferAmount = "20000000000"; // 2 COIN_10.
      const coin10Decimals = 10;

      it("Send tokens with payload", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Fetch wallet address.
        const walletAddress = await wallet.getAddress();

        // Fetch sui coins to pay the wormhole fee.
        const feeAmount = await getWormholeFee(provider);

        // Fetch coin 10.
        const coin = await getCoinWithHighestBalance(
          provider,
          walletAddress,
          COIN_10_TYPE
        );

        // Balance check before transferring tokens.
        const coinBalanceBefore = await provider.getBalance({
          owner: walletAddress,
          coinType: COIN_10_TYPE,
        });

        // Start new transaction.
        const tx = new TransactionBlock();

        // Wormhole fee coins.
        const [wormholeFee] = tx.splitCoins(tx.gas, [tx.pure(feeAmount)]);

        // Coins to transfer to the target chain.
        const [coinsToTransfer] = tx.splitCoins(tx.object(coin.coinObjectId), [
          tx.pure(outboundTransferAmount),
        ]);

        // Fetch the asset info.
        const [assetInfo] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::state::verified_asset`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID)],
          typeArguments: [COIN_10_TYPE],
        });

        // Fetch the transfer ticket.
        const [transferTicket] = tx.moveCall({
          target: `${HELLO_TOKEN_ID}::transfer::send_tokens_with_payload`,
          arguments: [
            tx.object(stateId),
            coinsToTransfer,
            assetInfo,
            tx.pure(foreignChain),
            tx.pure(walletAddress),
            tx.pure(nonce),
          ],
          typeArguments: [COIN_10_TYPE],
        });

        // Transfer the tokens with payload.
        const [messageTicket] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::transfer_tokens_with_payload::transfer_tokens_with_payload`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), transferTicket],
          typeArguments: [COIN_10_TYPE],
        });

        // Publish the message.
        tx.moveCall({
          target: `${WORMHOLE_ID}::publish_message::publish_message`,
          arguments: [
            tx.object(WORMHOLE_STATE_ID),
            wormholeFee,
            messageTicket,
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });

        tx.setGasBudget(50_000);
        const eventData = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: tx,
          options: {
            showEffects: true,
            showEvents: true,
            showBalanceChanges: true,
          },
        });

        // Fetch wormhole events.
        const wormholeEvents = getWormholeEvents(eventData);
        expect(wormholeEvents!.length).equals(1);

        // Parse the emitted Wormhole message and verify the payload.
        const message = wormholeEvents![0].parsedJson;
        expect(message.consistency_level).equal(0);
        expect(message.sequence).equals("4");
        expect(message.nonce).equals(nonce);

        // Cache state.
        const state = await getObjectFields(provider, stateId);

        // Verify the transfer payload.
        {
          const transferPayload = await parseTransferPayload(
            Buffer.from(message.payload)
          );
          expect(transferPayload.amount.toString()).to.equal(
            tokenBridgeNormalizeAmount(
              Number(outboundTransferAmount),
              coin10Decimals
            ).toString()
          );
          expect(transferPayload.fromAddress!).equals(
            state!.emitter_cap.fields.id.id.substring(2)
          );
          expect(transferPayload.originChain).to.equal(CHAIN_ID_SUI);
          expect(transferPayload.targetAddress).to.equal(
            foreignContractAddress.toString("hex")
          );
          expect(transferPayload.targetChain).to.equal(Number(foreignChain));
        }

        // Verify the additional payload.
        {
          const helloTokenPayload = parseHelloTokenPayload(
            Buffer.from(message.payload)
          );
          expect(helloTokenPayload.payloadType).equals(1);
          expect(helloTokenPayload.recipient).equals(walletAddress);
        }

        // Balance check after transferring tokens.
        const coinBalanceAfter = await provider.getBalance({
          owner: walletAddress,
          coinType: COIN_10_TYPE,
        });
        expect(
          parseInt(coinBalanceBefore.totalBalance) -
            parseInt(coinBalanceAfter.totalBalance)
        ).eq(parseInt(outboundTransferAmount));
      });

      it("Redeem transfer with relayer", async () => {
        expect(localVariables.stateId).is.not.undefined;

        // Cache stateId and fetch the state.
        const stateId: string = localVariables.stateId;
        const state = await getObjectFields(provider, stateId);

        // Save wallet and relayer addresses.
        const walletAddress = await wallet.getAddress();
        const relayerAddress = await relayer.getAddress();

        // Define transfer parameters.
        const mintAmount = Math.floor(Number(outboundTransferAmount) / 2);
        const recipient = walletAddress;
        const tokenAddress = await provider
          .getCoinMetadata({
            coinType: COIN_10_TYPE,
          })
          .then((result) => result!.id);

        // Create payload.
        const payload = createHelloTokenPayload(recipient);

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tokenAddress!.substring(2),
          CHAIN_ID_SUI, // tokenChain
          BigInt(tokenBridgeNormalizeAmount(mintAmount, coin10Decimals)),
          CHAIN_ID_SUI, // recipientChain
          state!.emitter_cap.fields.id.id.substring(2), // targetContractAddress
          foreignContractAddress, // fromAddress
          Buffer.from(payload.substring(2), "hex"),
          nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Complete the transfer with payload.
        let receipt;
        {
          // Start new transaction.
          const tx = new TransactionBlock();

          // Parse and verify the vaa.
          const [parsedVaa] = tx.moveCall({
            target: `${WORMHOLE_ID}::vaa::parse_and_verify`,
            arguments: [
              tx.object(WORMHOLE_STATE_ID),
              tx.pure(Array.from(signedWormholeMessage)),
              tx.object(SUI_CLOCK_OBJECT_ID),
            ],
          });

          // Verify the VAA with the token bridge.
          const [tokenBridgeMessage] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::vaa::verify_only_once`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), parsedVaa],
          });

          // Authorize the transfer.
          const [redeemerReceipt] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::complete_transfer_with_payload::authorize_transfer`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), tokenBridgeMessage],
            typeArguments: [COIN_10_TYPE],
          });

          // Complete the tranfer.
          tx.moveCall({
            target: `${HELLO_TOKEN_ID}::transfer::redeem_transfer_with_payload`,
            arguments: [tx.object(stateId), redeemerReceipt],
            typeArguments: [COIN_10_TYPE],
          });

          tx.setGasBudget(100_000_000);
          receipt = await relayer.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
              showEffects: true,
              showBalanceChanges: true,
            },
          });
        }

        // Fetch balance changes.
        const recipientCoinChange = getBalanceChangeFromTransaction(
          walletAddress,
          COIN_10_TYPE,
          receipt.balanceChanges
        );
        const relayerCoinChange = getBalanceChangeFromTransaction(
          relayerAddress,
          COIN_10_TYPE,
          receipt.balanceChanges
        );

        // Expected relayer fee to be paid by the contract.
        const expectedFee = calculateRelayerFee(mintAmount, state);

        // Validate relayer balance change.
        expect(relayerCoinChange).equals(expectedFee);

        // Confirm recipient balance changes.
        expect(recipientCoinChange).equals(mintAmount - expectedFee);
      });

      it("Recipient self redeems transfer", async () => {
        expect(localVariables.stateId).is.not.undefined;

        // Cache stateId and fetch the state.
        const stateId: string = localVariables.stateId;
        const state = await getObjectFields(provider, stateId);

        // Save wallet and relayer addresses.
        const walletAddress = await wallet.getAddress();

        // Define transfer parameters.
        const mintAmount = Math.floor(Number(outboundTransferAmount) / 2);
        const recipient = walletAddress;
        const tokenAddress = await provider
          .getCoinMetadata({
            coinType: COIN_10_TYPE,
          })
          .then((result) => result!.id);

        // Create payload.
        const payload = createHelloTokenPayload(recipient);

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tokenAddress!.substring(2),
          CHAIN_ID_SUI, // tokenChain
          BigInt(tokenBridgeNormalizeAmount(mintAmount, coin10Decimals)),
          CHAIN_ID_SUI, // recipientChain
          state!.emitter_cap.fields.id.id.substring(2), // targetContractAddress
          foreignContractAddress, // fromAddress
          Buffer.from(payload.substring(2), "hex"),
          nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Complete the transfer with payload.
        let receipt;
        {
          // Start new transaction.
          const tx = new TransactionBlock();

          // Parse and verify the vaa.
          const [parsedVaa] = tx.moveCall({
            target: `${WORMHOLE_ID}::vaa::parse_and_verify`,
            arguments: [
              tx.object(WORMHOLE_STATE_ID),
              tx.pure(Array.from(signedWormholeMessage)),
              tx.object(SUI_CLOCK_OBJECT_ID),
            ],
          });

          // Verify the VAA with the token bridge.
          const [tokenBridgeMessage] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::vaa::verify_only_once`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), parsedVaa],
          });

          // Authorize the transfer.
          const [redeemerReceipt] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::complete_transfer_with_payload::authorize_transfer`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), tokenBridgeMessage],
            typeArguments: [COIN_10_TYPE],
          });

          // Complete the tranfer.
          tx.moveCall({
            target: `${HELLO_TOKEN_ID}::transfer::redeem_transfer_with_payload`,
            arguments: [tx.object(stateId), redeemerReceipt],
            typeArguments: [COIN_10_TYPE],
          });

          tx.setGasBudget(50_000);

          // NOTE: redeem the transfer with the recipient wallet.
          receipt = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
              showBalanceChanges: true,
            },
          });
        }

        // Fetch balance changes.
        const recipientCoinChange = getBalanceChangeFromTransaction(
          walletAddress,
          COIN_10_TYPE,
          receipt.balanceChanges
        );

        // Confirm that the recipient received the full mintAmount.
        expect(recipientCoinChange).equals(mintAmount);
      });
    });

    describe("SUI Native Coin", () => {
      // The `transferAmount` will be transferred outbound in the first
      // The two following tests will use the `transferAmount` that is
      // deposited in the bridge to test complete transfer functionality.
      // For both tests to be successful, the following must be true:
      //     * transferAmount >= mintAmount1 + mintAmount2
      const outboundTransferAmount = "690000000000"; // 690 SUI
      const suiDecimals = 9;

      it("Send tokens with payload", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Fetch wallet address.
        const walletAddress = await wallet.getAddress();

        // Fetch sui coins to pay the wormhole fee.
        const feeAmount = await getWormholeFee(provider);

        // Balance check before transferring tokens.
        const coinBalanceBefore = await provider.getBalance({
          owner: walletAddress,
          coinType: SUI_TYPE,
        });

        // Start new transaction.
        const tx = new TransactionBlock();

        // Coins to transfer to the target chain.
        const [wormholeFee, coinsToTransfer] = tx.splitCoins(tx.gas, [
          tx.pure(feeAmount),
          tx.pure(outboundTransferAmount),
        ]);

        // Fetch the asset info.
        const [assetInfo] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::state::verified_asset`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID)],
          typeArguments: [SUI_TYPE],
        });

        // Fetch the transfer ticket.
        const [transferTicket] = tx.moveCall({
          target: `${HELLO_TOKEN_ID}::transfer::send_tokens_with_payload`,
          arguments: [
            tx.object(stateId),
            coinsToTransfer,
            assetInfo,
            tx.pure(foreignChain),
            tx.pure(walletAddress),
            tx.pure(nonce),
          ],
          typeArguments: [SUI_TYPE],
        });

        // Transfer the tokens with payload.
        const [messageTicket] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::transfer_tokens_with_payload::transfer_tokens_with_payload`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), transferTicket],
          typeArguments: [SUI_TYPE],
        });

        // Publish the message.
        tx.moveCall({
          target: `${WORMHOLE_ID}::publish_message::publish_message`,
          arguments: [
            tx.object(WORMHOLE_STATE_ID),
            wormholeFee,
            messageTicket,
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });

        tx.setGasBudget(50_000);
        const eventData = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: tx,
          options: {
            showEffects: true,
            showEvents: true,
            showBalanceChanges: true,
          },
        });

        // Fetch wormhole events.
        const wormholeEvents = getWormholeEvents(eventData);
        expect(wormholeEvents!.length).equals(1);

        // Parse the emitted Wormhole message and verify the payload.
        const message = wormholeEvents![0].parsedJson;
        expect(message.consistency_level).equal(0);
        expect(message.sequence).equals("5");
        expect(message.nonce).equals(nonce);

        // Cache state.
        const state = await getObjectFields(provider, stateId);

        // Verify the transfer payload.
        {
          const transferPayload = await parseTransferPayload(
            Buffer.from(message.payload)
          );
          expect(transferPayload.amount.toString()).to.equal(
            tokenBridgeNormalizeAmount(
              Number(outboundTransferAmount),
              suiDecimals
            ).toString()
          );
          expect(transferPayload.fromAddress!).equals(
            state!.emitter_cap.fields.id.id.substring(2)
          );
          expect(transferPayload.originChain).to.equal(CHAIN_ID_SUI);
          expect(transferPayload.targetAddress).to.equal(
            foreignContractAddress.toString("hex")
          );
          expect(transferPayload.targetChain).to.equal(Number(foreignChain));
        }

        // Verify the additional payload.
        {
          const helloTokenPayload = parseHelloTokenPayload(
            Buffer.from(message.payload)
          );
          expect(helloTokenPayload.payloadType).equals(1);
          expect(helloTokenPayload.recipient).equals(walletAddress);
        }

        // Balance check after transferring tokens.
        const coinBalanceAfter = await provider.getBalance({
          owner: walletAddress,
          coinType: SUI_TYPE,
        });
        expect(
          parseInt(coinBalanceBefore.totalBalance) -
            parseInt(coinBalanceAfter.totalBalance)
        ).gte(parseInt(outboundTransferAmount));
      });

      it("Redeem transfer with relayer", async () => {
        expect(localVariables.stateId).is.not.undefined;

        // Cache stateId and fetch the state.
        const stateId: string = localVariables.stateId;
        const state = await getObjectFields(provider, stateId);

        // Save wallet and relayer addresses.
        const walletAddress = await wallet.getAddress();
        const relayerAddress = await relayer.getAddress();

        // Define transfer parameters.
        const mintAmount = Math.floor(Number(outboundTransferAmount) / 2);
        const recipient = walletAddress;
        const tokenAddress = await provider
          .getCoinMetadata({
            coinType: SUI_TYPE,
          })
          .then((result) => result!.id);

        // Create payload.
        const payload = createHelloTokenPayload(recipient);

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tokenAddress!.substring(2),
          CHAIN_ID_SUI, // tokenChain
          BigInt(tokenBridgeNormalizeAmount(mintAmount, suiDecimals)),
          CHAIN_ID_SUI, // recipientChain
          state!.emitter_cap.fields.id.id.substring(2), // targetContractAddress
          foreignContractAddress, // fromAddress
          Buffer.from(payload.substring(2), "hex"),
          nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Set the gas budget for the transaction block.
        const gas_budget = 50_000;

        // Complete the transfer with payload.
        let receipt;
        {
          // Start new transaction.
          const tx = new TransactionBlock();

          // Parse and verify the vaa.
          const [parsedVaa] = tx.moveCall({
            target: `${WORMHOLE_ID}::vaa::parse_and_verify`,
            arguments: [
              tx.object(WORMHOLE_STATE_ID),
              tx.pure(Array.from(signedWormholeMessage)),
              tx.object(SUI_CLOCK_OBJECT_ID),
            ],
          });

          // Verify the VAA with the token bridge.
          const [tokenBridgeMessage] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::vaa::verify_only_once`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), parsedVaa],
          });

          // Authorize the transfer.
          const [redeemerReceipt] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::complete_transfer_with_payload::authorize_transfer`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), tokenBridgeMessage],
            typeArguments: [SUI_TYPE],
          });

          // Complete the tranfer.
          tx.moveCall({
            target: `${HELLO_TOKEN_ID}::transfer::redeem_transfer_with_payload`,
            arguments: [tx.object(stateId), redeemerReceipt],
            typeArguments: [SUI_TYPE],
          });

          tx.setGasBudget(gas_budget);
          receipt = await relayer.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
              showEffects: true,
              showBalanceChanges: true,
            },
          });
        }

        // Fetch balance changes.
        const recipientCoinChange = getBalanceChangeFromTransaction(
          walletAddress,
          SUI_TYPE,
          receipt.balanceChanges
        );
        const relayerCoinChange = getBalanceChangeFromTransaction(
          relayerAddress,
          SUI_TYPE,
          receipt.balanceChanges
        );

        // Expected relayer fee to be paid by the contract.
        const expectedFee = calculateRelayerFee(mintAmount, state);

        // Validate relayer balance change. The balance changes should be less
        // than the expectedFee, since the relayer pays gas.
        expect(relayerCoinChange).gte(expectedFee - gas_budget);

        // Confirm recipient balance changes.
        expect(recipientCoinChange).equals(mintAmount - expectedFee);
      });

      it("Recipient self redeems transfer", async () => {
        expect(localVariables.stateId).is.not.undefined;

        // Cache stateId and fetch the state.
        const stateId: string = localVariables.stateId;
        const state = await getObjectFields(provider, stateId);

        // Save wallet and relayer addresses.
        const walletAddress = await wallet.getAddress();

        // Define transfer parameters.
        const mintAmount = Math.floor(Number(outboundTransferAmount) / 2);
        const recipient = walletAddress;
        const tokenAddress = await provider
          .getCoinMetadata({
            coinType: SUI_TYPE,
          })
          .then((result) => result!.id);

        // Create payload.
        const payload = createHelloTokenPayload(recipient);

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tokenAddress!.substring(2),
          CHAIN_ID_SUI, // tokenChain
          BigInt(tokenBridgeNormalizeAmount(mintAmount, suiDecimals)),
          CHAIN_ID_SUI, // recipientChain
          state!.emitter_cap.fields.id.id.substring(2), // targetContractAddress
          foreignContractAddress, // fromAddress
          Buffer.from(payload.substring(2), "hex"),
          nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Set the gas budget.
        const gas_budget = 50_000;

        // Complete the transfer with payload.
        let receipt;
        {
          // Start new transaction.
          const tx = new TransactionBlock();

          // Parse and verify the vaa.
          const [parsedVaa] = tx.moveCall({
            target: `${WORMHOLE_ID}::vaa::parse_and_verify`,
            arguments: [
              tx.object(WORMHOLE_STATE_ID),
              tx.pure(Array.from(signedWormholeMessage)),
              tx.object(SUI_CLOCK_OBJECT_ID),
            ],
          });

          // Verify the VAA with the token bridge.
          const [tokenBridgeMessage] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::vaa::verify_only_once`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), parsedVaa],
          });

          // Authorize the transfer.
          const [redeemerReceipt] = tx.moveCall({
            target: `${TOKEN_BRIDGE_ID}::complete_transfer_with_payload::authorize_transfer`,
            arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), tokenBridgeMessage],
            typeArguments: [SUI_TYPE],
          });

          // Complete the tranfer.
          tx.moveCall({
            target: `${HELLO_TOKEN_ID}::transfer::redeem_transfer_with_payload`,
            arguments: [tx.object(stateId), redeemerReceipt],
            typeArguments: [SUI_TYPE],
          });

          tx.setGasBudget(gas_budget);

          // NOTE: redeem the transfer with the recipient wallet.
          receipt = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
              showBalanceChanges: true,
            },
          });
        }

        // Fetch balance changes.
        const recipientCoinChange = getBalanceChangeFromTransaction(
          walletAddress,
          SUI_TYPE,
          receipt.balanceChanges
        );

        // Confirm that the recipient received the full mintAmount. The
        // balance should change by slightly less than the mintAmount,
        // since the user had to pay gas.
        expect(recipientCoinChange).gte(mintAmount - gas_budget);
      });
    });
  });
});
