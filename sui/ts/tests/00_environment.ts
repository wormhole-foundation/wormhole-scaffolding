import {expect} from "chai";
import {ethers} from "ethers";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  ETHEREUM_TOKEN_BRIDGE_ADDRESS,
  GOVERNANCE_EMITTER_ID,
  GUARDIAN_PRIVATE_KEY,
  WALLET_PRIVATE_KEY,
  TOKEN_BRIDGE_ID,
  RELAYER_PRIVATE_KEY,
  CREATOR_PRIVATE_KEY,
  WORMHOLE_STATE_ID,
  TOKEN_BRIDGE_STATE_ID,
  COIN_10_TREASURY_ID,
  COIN_8_TREASURY_ID,
  COIN_8_TYPE,
  COIN_10_TYPE,
  SUI_TYPE,
  SUI_METADATA_ID,
  WORMHOLE_ID,
} from "../src/consts";
import {
  Ed25519Keypair,
  JsonRpcProvider,
  localnetConnection,
  RawSigner,
  TransactionBlock,
  SUI_CLOCK_OBJECT_ID,
} from "@mysten/sui.js";
import {getWormholeFee, getObjectFields} from "../src";

describe("0: Wormhole", () => {
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

  // for governance actions to modify programs
  const governance = new mock.GovernanceEmitter(GOVERNANCE_EMITTER_ID, 20);

  describe("Environment", () => {
    it("Variables", () => {
      expect(process.env.TESTING_WORMHOLE_ID).is.not.undefined;
      expect(process.env.TESTING_WORMHOLE_STATE_ID).is.not.undefined;
      expect(process.env.TESTING_TOKEN_BRIDGE_ID).is.not.undefined;
      expect(process.env.TESTING_TOKEN_BRIDGE_STATE_ID).is.not.undefined;
      expect(process.env.TESTING_EXAMPLE_COINS_ID).is.not.undefined;
      expect(process.env.TESTING_COIN_8_TREASURY_ID).is.not.undefined;
      expect(process.env.TESTING_COIN_10_TREASURY_ID).is.not.undefined;
    });
  });

  describe("Verify Local Validator", () => {
    it("Balance", async () => {
      // Balance check wallet.
      {
        const coinData = await wallet
          .getAddress()
          .then((address) =>
            provider.getCoins({owner: address}).then((result) => result.data)
          );
        for (const coin of coinData) {
          expect(coin.balance).equals("30000000000000000");
        }
      }

      // Balance check relayer.
      {
        const coinData = await relayer
          .getAddress()
          .then((address) =>
            provider.getCoins({owner: address}).then((result) => result.data)
          );
        for (const coin of coinData) {
          expect(coin.balance).equals("30000000000000000");
        }
      }
    });

    it("Mint and transfer example coins", async () => {
      const walletAddress = await wallet.getAddress();

      // COIN_10
      {
        const metadata = await provider.getCoinMetadata({
          coinType: COIN_10_TYPE,
        });
        expect(metadata!.decimals).equals(10);

        // Format the amount based on the coin decimals.
        const amount = ethers.utils
          .parseUnits("69420", metadata!.decimals)
          .add(10) // for outbound transfer later
          .toString();

        // Mint and transfer the coins.
        const tx = new TransactionBlock();
        tx.moveCall({
          target: "0x2::coin::mint_and_transfer",
          arguments: [
            tx.object(COIN_10_TREASURY_ID),
            tx.pure(amount),
            tx.pure(walletAddress),
          ],
          typeArguments: [COIN_10_TYPE],
        });
        tx.setGasBudget(50_000);
        const result = await creator.signAndExecuteTransactionBlock({
          transactionBlock: tx,
        });
        expect(result.digest).is.not.null;

        // Check balance on wallet.
        const balance = await provider.getBalance({
          owner: walletAddress,
          coinType: COIN_10_TYPE,
        });
        expect(balance.coinObjectCount).equals(1);
        expect(balance.totalBalance.toString()).equals(amount);
      }

      // COIN_8
      {
        const metadata = await provider.getCoinMetadata({
          coinType: COIN_8_TYPE,
        });
        expect(metadata!.decimals).equals(8);

        // Format the amount based on the coin decimals.
        const amount = ethers.utils
          .parseUnits("42069", metadata!.decimals)
          .add(10) // for outbound transfer later
          .toString();

        // Mint and transfer the coins.
        const tx = new TransactionBlock();
        tx.moveCall({
          target: "0x2::coin::mint_and_transfer",
          arguments: [
            tx.object(COIN_8_TREASURY_ID),
            tx.pure(amount),
            tx.pure(walletAddress),
          ],
          typeArguments: [COIN_8_TYPE],
        });
        tx.setGasBudget(50_000);
        const result = await creator.signAndExecuteTransactionBlock({
          transactionBlock: tx,
        });
        expect(result.digest).is.not.null;

        // Check balance on wallet.
        const balance = await provider.getBalance({
          owner: walletAddress,
          coinType: COIN_8_TYPE,
        });
        expect(balance.coinObjectCount).equals(1);
        expect(balance.totalBalance.toString()).equals(amount);
      }
    });

    it("Register foreign emitter (Ethereum)", async () => {
      // Create an emitter registration VAA.
      const message = governance.publishTokenBridgeRegisterChain(
        0, // timestamp
        2,
        ETHEREUM_TOKEN_BRIDGE_ADDRESS
      );
      const signedWormholeMessage = guardians.addSignatures(message, [0]);

      // Register an emitter from Ethereum on the token bridge.
      {
        const tx = new TransactionBlock();

        // Parse and verify the vaa.
        const [verifiedVaa] = tx.moveCall({
          target: `${WORMHOLE_ID}::vaa::parse_and_verify`,
          arguments: [
            tx.object(WORMHOLE_STATE_ID),
            tx.pure(Array.from(signedWormholeMessage)),
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });

        // Authorize the governance.
        const [decreeTicket] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::register_chain::authorize_governance`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID)],
        });

        // Fetch the governance message.
        const [decreeReceipt] = tx.moveCall({
          target: `${WORMHOLE_ID}::governance_message::verify_vaa`,
          arguments: [tx.object(WORMHOLE_STATE_ID), verifiedVaa, decreeTicket],
          typeArguments: [
            `${TOKEN_BRIDGE_ID}::register_chain::GovernanceWitness`,
          ],
        });

        // Register the chain.
        tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::register_chain::register_chain`,
          arguments: [tx.object(TOKEN_BRIDGE_STATE_ID), decreeReceipt],
        });
        tx.setGasBudget(50_000);
        const result = await creator.signAndExecuteTransactionBlock({
          transactionBlock: tx,
        });
        expect(result.digest).is.not.null;
      }
    });

    // Before any coin can be transferred out, it needs to be attested for.
    it("Attest native coins", async () => {
      // Fetch Sui object to pay wormhole fees with.
      const feeAmount = await getWormholeFee(provider);

      // COIN_10
      {
        // Coin 10 metadata and nonce.
        const metadata = await provider.getCoinMetadata({
          coinType: COIN_10_TYPE,
        });
        const nonce = 69;

        // Call `token_bridge::attest_token` on Token Bridge.
        const tx = new TransactionBlock();
        const [wormholeFee] = tx.splitCoins(tx.gas, [tx.pure(feeAmount)]);

        // Fetch message ticket.
        const [messageTicket] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::attest_token::attest_token`,
          arguments: [
            tx.object(TOKEN_BRIDGE_STATE_ID),
            tx.object(metadata!.id!),
            tx.pure(nonce),
          ],
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
        const eventData = await wallet
          .signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
            },
          })
          .then((result) => {
            if ("events" in result && result.events?.length == 1) {
              return result.events[0];
            }

            throw new Error("event not found");
          });

        // Verify that the attest message was published.
        expect(eventData.transactionModule).equal("publish_message");
        expect(eventData.parsedJson!.nonce).equals(nonce);
        expect(eventData.parsedJson!.sequence).equals("0");

        // Verify that a token was registered in the token bridge state.
        const tokenBridgeState = await getObjectFields(
          provider,
          TOKEN_BRIDGE_STATE_ID
        );
        expect(tokenBridgeState!.token_registry.fields.num_native).equals("1");
      }

      // COIN_8
      {
        // Coin 8 metadata and nonce.
        const metadata = await provider.getCoinMetadata({
          coinType: COIN_8_TYPE,
        });
        const nonce = 420;

        // Call `token_bridge::attest_token` on Token Bridge.
        const tx = new TransactionBlock();
        const [wormholeFee] = tx.splitCoins(tx.gas, [tx.pure(feeAmount)]);

        // Fetch message ticket.
        const [messageTicket] = tx.moveCall({
          target: `${TOKEN_BRIDGE_ID}::attest_token::attest_token`,
          arguments: [
            tx.object(TOKEN_BRIDGE_STATE_ID),
            tx.object(metadata!.id!),
            tx.pure(nonce),
          ],
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
        const eventData = await wallet
          .signAndExecuteTransactionBlock({
            transactionBlock: tx,
            options: {
              showEvents: true,
            },
          })
          .then((result) => {
            if ("events" in result && result.events?.length == 1) {
              return result.events[0];
            }

            throw new Error("event not found");
          });

        // Verify that the attest message was published.
        expect(eventData.transactionModule).equal("publish_message");
        expect(eventData.parsedJson!.nonce).equals(nonce);
        expect(eventData.parsedJson!.sequence).equals("1");

        // Verify that a token was registered in the token bridge state.
        const tokenBridgeState = await getObjectFields(
          provider,
          TOKEN_BRIDGE_STATE_ID
        );
        expect(tokenBridgeState!.token_registry.fields.num_native).equals("2");
      }
    });

    it("Attest Sui", async () => {
      // Fetch Sui object to pay wormhole fees with.
      const feeAmount = await getWormholeFee(provider);
      const nonce = 420;

      // Call `token_bridge::attest_token` on Token Bridge.
      const tx = new TransactionBlock();
      const [wormholeFee] = tx.splitCoins(tx.gas, [tx.pure(feeAmount)]);

      // Fetch message ticket.
      const [messageTicket] = tx.moveCall({
        target: `${TOKEN_BRIDGE_ID}::attest_token::attest_token`,
        arguments: [
          tx.object(TOKEN_BRIDGE_STATE_ID),
          tx.object(SUI_METADATA_ID),
          tx.pure(nonce),
        ],
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
      const eventData = await wallet
        .signAndExecuteTransactionBlock({
          transactionBlock: tx,
          options: {
            showEvents: true,
          },
        })
        .then((result) => {
          if ("events" in result && result.events?.length == 1) {
            return result.events[0];
          }
          throw new Error("event not found");
        });

      // Verify that the attest message was published.
      expect(eventData.transactionModule).equal("publish_message");
      expect(eventData.parsedJson!.nonce).equals(nonce);
      expect(eventData.parsedJson!.sequence).equals("2");

      // Verify that a token was registered in the token bridge state.
      const tokenBridgeState = await getObjectFields(
        provider,
        TOKEN_BRIDGE_STATE_ID
      );
      expect(tokenBridgeState!.token_registry.fields.num_native).equals("3");
    });
  });
});
