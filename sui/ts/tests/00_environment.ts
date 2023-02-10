import {expect} from "chai";
import * as path from "path";
import {ethers} from "ethers";
import {
  CHAIN_ID_SUI,
  tryNativeToHexString,
  tryNativeToUint8Array,
} from "@certusone/wormhole-sdk";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  ETHEREUM_TOKEN_BRIDGE_ADDRESS,
  GOVERNANCE_EMITTER_ID,
  GUARDIAN_PRIVATE_KEY,
  WALLET_PRIVATE_KEY,
  TOKEN_BRIDGE_ID,
  WORMHOLE_ID,
  RELAYER_PRIVATE_KEY,
  WETH_ID,
  CREATOR_PRIVATE_KEY,
  WORMHOLE_CREATOR_CAPABILITY_ID,
  GOVERNANCE_CHAIN,
  WORMHOLE_STATE_ID,
  TOKEN_BRIDGE_EMITTER_ID,
  TOKEN_BRIDGE_CREATOR_CAPABILITY_ID,
  TOKEN_BRIDGE_STATE_ID,
  COIN_9_TREASURY_ID,
  COIN_8_TREASURY_ID,
  COIN_8_TYPE,
  COIN_9_TYPE,
  WRAPPED_WETH_ID,
  WRAPPED_WETH_COIN_TYPE,
  unexpected,
} from "./helpers";
import {
  Ed25519Keypair,
  JsonRpcProvider,
  Network,
  RawSigner,
} from "@mysten/sui.js";
import {
  buildAndDeployWrappedCoin,
  getCreatedFromTransaction,
  getWormholeMessagesFromTransaction,
  getObjectFields,
} from "../src";

describe(" 0: Wormhole", () => {
  const provider = new JsonRpcProvider(Network.LOCAL);
  const wallet = new RawSigner(
    Ed25519Keypair.fromSeed(WALLET_PRIVATE_KEY),
    provider
  );
  const relayer = new RawSigner(
    Ed25519Keypair.fromSeed(RELAYER_PRIVATE_KEY),
    provider
  );

  const creator = new RawSigner(
    Ed25519Keypair.fromSeed(CREATOR_PRIVATE_KEY),
    provider
  );

  // Mock guardians for signing wormhole messages.
  const guardians = new mock.MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);

  // for governance actions to modify programs
  const governance = new mock.GovernanceEmitter(GOVERNANCE_EMITTER_ID, 20);

  before("Airdrop", async () => {
    // Just in case we add more keypairs to the test...
  });

  describe("Environment", () => {
    it("Variables", () => {
      expect(process.env.TESTING_WORMHOLE_ID).is.not.undefined;
      expect(process.env.TESTING_WORMHOLE_CREATOR_CAPABILITY_ID).is.not
        .undefined;
      expect(process.env.TESTING_WORMHOLE_STATE_ID).is.not.undefined;
      expect(process.env.TESTING_TOKEN_BRIDGE_ID).is.not.undefined;
      expect(process.env.TESTING_TOKEN_BRIDGE_CREATOR_CAPABILITY_ID).is.not
        .undefined;
      expect(process.env.TESTING_TOKEN_BRIDGE_EMITTER_ID).is.not.undefined;
      expect(process.env.TESTING_TOKEN_BRIDGE_STATE_ID).is.not.undefined;
      expect(process.env.TESTING_EXAMPLE_COINS_ID).is.not.undefined;
      expect(process.env.TESTING_COIN_8_TREASURY_ID).is.not.undefined;
      expect(process.env.TESTING_COIN_9_TREASURY_ID).is.not.undefined;
      expect(process.env.TESTING_WRAPPED_WETH_COIN_TYPE).is.not.undefined;
      expect(process.env.TESTING_WRAPPED_WETH_ID).is.not.undefined;
    });
  });

  describe("Verify Local Validator", () => {
    it("Balance", async () => {
      // wallet
      {
        const coinData = await wallet
          .getAddress()
          .then((address) =>
            provider
              .getCoins(address, "0x2::sui::SUI")
              .then((result) => result.data)
          );
        for (const coin of coinData) {
          expect(coin.balance).equals(100000000000000);
        }
      }

      // relayer
      {
        const coinData = await relayer
          .getAddress()
          .then((address) =>
            provider
              .getCoins(address, "0x2::sui::SUI")
              .then((result) => result.data)
          );
        for (const coin of coinData) {
          expect(coin.balance).equals(100000000000000);
        }
      }
    });

    it("Mint and Transfer Example Coins", async () => {
      const walletAddress = await wallet
        .getAddress()
        .then((address) => ethers.utils.hexlify(Buffer.from(address, "hex")));

      // COIN_9
      {
        const metadata = await provider.getCoinMetadata(COIN_9_TYPE);
        expect(metadata.decimals).equals(9);

        const amount = ethers.utils
          .parseUnits("69420", metadata.decimals)
          .add(10) // for outbound transfer later
          .toString();

        const tx = await creator
          .executeMoveCall({
            packageObjectId: "0x2",
            module: "coin",
            function: "mint_and_transfer",
            typeArguments: [COIN_9_TYPE],
            arguments: [COIN_9_TREASURY_ID, amount, walletAddress],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(tx).is.not.null;

        // Check balance on wallet.
        const balance = await provider.getBalance(walletAddress, COIN_9_TYPE);
        expect(balance.coinObjectCount).equals(1);
        expect(balance.totalBalance.toString()).equals(amount);
      }

      // COIN_8
      {
        const metadata = await provider.getCoinMetadata(COIN_8_TYPE);
        expect(metadata.decimals).equals(8);

        const amount = ethers.utils
          .parseUnits("69420", metadata.decimals)
          .toString();

        const tx = await creator
          .executeMoveCall({
            packageObjectId: "0x2",
            module: "coin",
            function: "mint_and_transfer",
            typeArguments: [COIN_8_TYPE],
            arguments: [COIN_8_TREASURY_ID, amount, walletAddress],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(tx).is.not.null;

        // Check balance on wallet.
        const balance = await provider.getBalance(walletAddress, COIN_8_TYPE);
        expect(balance.coinObjectCount).equals(1);
        expect(balance.totalBalance.toString()).equals(amount);
      }
    });
  });

  describe("Verify Wormhole Program", () => {
    it("Initialize", async () => {
      // Set up guardian set.
      const devnetGuardian = Buffer.from(
        new ethers.Wallet(GUARDIAN_PRIVATE_KEY).address.substring(2),
        "hex"
      );

      // Call `init_and_share_state` on Wormhole.
      const tx = await creator
        .executeMoveCall({
          packageObjectId: WORMHOLE_ID,
          module: "state",
          function: "init_and_share_state",
          typeArguments: [],
          arguments: [
            WORMHOLE_CREATOR_CAPABILITY_ID,
            CHAIN_ID_SUI.toString(),
            GOVERNANCE_CHAIN,
            Array.from(Buffer.from(GOVERNANCE_EMITTER_ID, "hex")),
            [Array.from(devnetGuardian)],
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(tx).is.not.null;

      // Deployer capability should be destroyed by this point.
      {
        const deployerCapability = await provider.getObject(
          WORMHOLE_CREATOR_CAPABILITY_ID
        );
        expect(deployerCapability.status).equals("Deleted");
      }

      // Transaction is successful, so check Wormhole state.
      const createdObjects = await getCreatedFromTransaction(tx!);
      expect(createdObjects).has.length(1);

      const created = createdObjects[0];
      if (created.owner != "Immutable" && "Shared" in created.owner) {
        const stateId = created.reference.objectId;
        expect(stateId).equals(WORMHOLE_STATE_ID);
      } else {
        unexpected();
      }

      // Finally here to check the state.
      const fields = await getObjectFields(provider, WORMHOLE_STATE_ID);

      expect(fields).has.property("chain_id");
      expect(fields.chain_id.fields.number).equals(CHAIN_ID_SUI.toString());

      expect(fields).has.property("guardian_set_index");
      expect(fields.guardian_set_index.fields.number).equals("0");

      expect(fields).has.property("guardian_sets");
      const guardianSets = fields.guardian_sets.fields.contents;
      expect(guardianSets).has.length(1);

      const guardianSet = guardianSets[0].fields.value.fields;
      expect(guardianSet.index.fields.number).equals("0");

      const guardianKeys = guardianSet.guardians;
      expect(guardianKeys).has.length(1);

      const guardianKey = guardianKeys[0].fields.address.fields.bytes;
      expect(guardianKey).deep.equals(Array.from(devnetGuardian));

      expect(fields).has.property("emitter_registry");
      expect(fields.emitter_registry.fields.next_id).equals("1");
    });
  });

  describe("Verify Token Bridge Program", () => {
    // Mock foreign token bridge.
    const ethereumTokenBridge = new mock.MockEthereumTokenBridge(
      ETHEREUM_TOKEN_BRIDGE_ADDRESS
    );

    it("Get New Emitter", async () => {
      // Call `get_new_emitter` on Wormhole for Token Bridge.
      const getNewEmitterTx = await creator
        .executeMoveCall({
          packageObjectId: WORMHOLE_ID,
          module: "wormhole",
          function: "get_new_emitter",
          typeArguments: [],
          arguments: [WORMHOLE_STATE_ID],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(getNewEmitterTx).is.not.null;

      // Transaction is successful, so check emitter ID.
      const createdObjects = await getCreatedFromTransaction(getNewEmitterTx!);
      expect(createdObjects).has.length(1);

      const created = createdObjects[0];
      expect(created.reference.objectId).equals(TOKEN_BRIDGE_EMITTER_ID);
    });

    it("Initialize", async () => {
      // Call `init_and_share_state` on Token Bridge.
      const initTx = await creator
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "bridge_state",
          function: "init_and_share_state",
          typeArguments: [],
          arguments: [
            TOKEN_BRIDGE_CREATOR_CAPABILITY_ID,
            TOKEN_BRIDGE_EMITTER_ID,
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(initTx).is.not.null;

      // Deployer capability should be destroyed by this point.
      {
        const deployerCapability = await provider.getObject(
          TOKEN_BRIDGE_CREATOR_CAPABILITY_ID
        );
        expect(deployerCapability.status).equals("Deleted");
      }

      // Transaction is successful, so check Token Bridge state.
      const createdObjects = await getCreatedFromTransaction(initTx!);
      expect(createdObjects).has.length(1);

      const created = createdObjects[0];
      if (created.owner != "Immutable" && "Shared" in created.owner) {
        const stateId = created.reference.objectId;
        expect(stateId).equals(TOKEN_BRIDGE_STATE_ID);

        // Finally here to check the state
        const fields = await getObjectFields(provider, TOKEN_BRIDGE_STATE_ID);

        expect(fields).has.property("emitter_cap");
        expect(fields.emitter_cap.fields.sequence).equals("0");

        expect(fields).has.property("registered_emitters");
        expect(fields.registered_emitters.fields.contents).has.length(0);
      }
    });

    it("Register Foreign Endpoint (Ethereum)", async () => {
      const message = governance.publishTokenBridgeRegisterChain(
        0, // timestamp
        2,
        ETHEREUM_TOKEN_BRIDGE_ADDRESS
      );
      const signedWormholeMessage = guardians.addSignatures(message, [0]);

      // Call `register_chain::submit_vaa` on Token Bridge.
      const registerChainTx = await creator
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "register_chain",
          function: "submit_vaa",
          typeArguments: [],
          arguments: [
            WORMHOLE_STATE_ID,
            TOKEN_BRIDGE_STATE_ID,
            Array.from(signedWormholeMessage),
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(registerChainTx).is.not.null;

      // Check state.
      const tokenBridgeState = await getObjectFields(
        provider,
        TOKEN_BRIDGE_STATE_ID
      );

      // Finally here to check the state to find new emitter.
      const registeredEmitters =
        tokenBridgeState.registered_emitters.fields.contents;
      expect(registeredEmitters).has.length(1);

      const registeredEmitter = registeredEmitters[0].fields;
      expect(registeredEmitter.key.fields.number).equals("2");
      expect(registeredEmitter.value.fields.external_address).deep.equals(
        Array.from(
          tryNativeToUint8Array(ETHEREUM_TOKEN_BRIDGE_ADDRESS, "ethereum")
        )
      );
    });

    // This shouldn't be allowed, but we're doing it just to prove the safety
    // of the scaffold programs.
    // it("Register Bogus Foreign Endpoint (Chain ID == 0)", async () => {
    //   // Hopefully we won't have to do this
    // });

    // // This shouldn't be allowed, but we're doing it just to prove the safety
    // // of the scaffold programs.
    // it("Register Bogus Foreign Endpoint (Chain ID == 21)", async () => {
    //   // Hopefully we won't have to do this
    // });

    // Before any coin can be transferred out, it needs to be attested for.
    it("Attest Native Coins", async () => {
      const walletAddress = await wallet.getAddress();
      // COIN_9
      {
        // SUI needed to pay wormhole fee if any.
        const [sui] = await provider
          .getCoins(walletAddress, "0x2::sui::SUI")
          .then((result) => result.data);

        const metadata = await provider.getCoinMetadata(COIN_9_TYPE);

        // Call `attest_token::attest_token` on Token Bridge
        const attestTokensTx = await wallet
          .executeMoveCall({
            packageObjectId: TOKEN_BRIDGE_ID,
            module: "attest_token",
            function: "attest_token",
            typeArguments: [COIN_9_TYPE],
            arguments: [
              WORMHOLE_STATE_ID,
              TOKEN_BRIDGE_STATE_ID,
              metadata.id!,
              sui.coinObjectId,
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(attestTokensTx).is.not.null;

        // Check event.
        const wormholeMessages = await getWormholeMessagesFromTransaction(
          provider,
          WORMHOLE_ID,
          attestTokensTx!
        );
        expect(wormholeMessages).has.length(1);

        const message = wormholeMessages[0];
        expect(message.emitter).equals(TOKEN_BRIDGE_ID);
        expect(message.sequence).equals("0");

        // Check state.
        const tokenBridgeState = await getObjectFields(
          provider,
          TOKEN_BRIDGE_STATE_ID
        );

        const emitter = tokenBridgeState.emitter_cap.fields;
        expect(emitter.sequence).equals("1");

        const tokenBridgeDynamicData = await provider
          .getDynamicFields(TOKEN_BRIDGE_STATE_ID)
          .then((result) => result.data);
        expect(tokenBridgeDynamicData).has.length(1);
      }

      // COIN_8
      {
        // SUI needed to pay wormhole fee if any.
        const [sui] = await provider
          .getCoins(walletAddress, "0x2::sui::SUI")
          .then((result) => result.data);

        const metadata = await provider.getCoinMetadata(COIN_8_TYPE);

        // Call `attest_token::attest_token` on Token Bridge
        const attestTokensTx = await wallet
          .executeMoveCall({
            packageObjectId: TOKEN_BRIDGE_ID,
            module: "attest_token",
            function: "attest_token",
            typeArguments: [COIN_8_TYPE],
            arguments: [
              WORMHOLE_STATE_ID,
              TOKEN_BRIDGE_STATE_ID,
              metadata.id!,
              sui.coinObjectId,
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(attestTokensTx).is.not.null;

        // Check event.
        const wormholeMessages = await getWormholeMessagesFromTransaction(
          provider,
          WORMHOLE_ID,
          attestTokensTx!
        );
        expect(wormholeMessages).has.length(1);

        const message = wormholeMessages[0];
        expect(message.emitter).equals(TOKEN_BRIDGE_ID);
        expect(message.sequence).equals("1");

        // Check state.
        const tokenBridgeState = await getObjectFields(
          provider,
          TOKEN_BRIDGE_STATE_ID
        );

        const emitter = tokenBridgeState.emitter_cap.fields;
        expect(emitter.sequence).equals("2");

        const tokenBridgeDynamicData = await provider
          .getDynamicFields(TOKEN_BRIDGE_STATE_ID)
          .then((result) => result.data);
        expect(tokenBridgeDynamicData).has.length(2);
      }
    });

    it("Outbound Transfer Native", async () => {
      const walletAddress = await wallet.getAddress();

      // `splitCoin` requires a number even though amounts can be u64, so it
      // seems that the max amount we can split by is u32. FYI
      const amount = "10";
      const recipientChain = "2";
      const recipient = Buffer.alloc(32, "deadbeef");
      const relayerFee = "0";
      const batchId = "69";

      // SUI needed to pay wormhole fee if any.
      const [sui] = await provider
        .getCoins(walletAddress, "0x2::sui::SUI")
        .then((result) => result.data);

      // Grab balance.
      const [transferCoin] = await provider
        .getCoins(walletAddress, COIN_9_TYPE)
        .then((result) => result.data);

      const metadata = await provider.getCoinMetadata(COIN_9_TYPE);

      // Split coin into another object.
      const splitCoin = await wallet
        .splitCoin({
          coinObjectId: transferCoin.coinObjectId,
          splitAmounts: [Number(amount)],
          gasBudget: 1000,
        })
        .then(async (tx) => {
          const created = await getCreatedFromTransaction(tx).then(
            (objects) => objects[0]
          );
          return "reference" in created ? created.reference.objectId : null;
        });
      expect(splitCoin).is.not.null;

      // Call `transfer_tokens::transfer_tokens` on Token Bridge
      const transferTokensTx = await wallet
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "transfer_tokens",
          function: "transfer_tokens",
          typeArguments: [COIN_9_TYPE],
          arguments: [
            WORMHOLE_STATE_ID,
            TOKEN_BRIDGE_STATE_ID,
            splitCoin!,
            metadata.id!,
            sui.coinObjectId,
            recipientChain,
            Array.from(recipient),
            relayerFee,
            batchId,
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(transferTokensTx).is.not.null;

      // Verify that `splitCoin` is deleted.
      {
        const info = await provider.getObject(splitCoin!);
        expect(info.status).equals("Deleted");
      }

      // Check event.
      const wormholeMessages = await getWormholeMessagesFromTransaction(
        provider,
        WORMHOLE_ID,
        transferTokensTx!
      );
      expect(wormholeMessages).has.length(1);

      const message = wormholeMessages[0];
      expect(message.emitter).equals(TOKEN_BRIDGE_ID);
      expect(message.sequence).equals("2");

      // Check state.
      const tokenBridgeState = await getObjectFields(
        provider,
        TOKEN_BRIDGE_STATE_ID
      );

      const emitter = tokenBridgeState.emitter_cap.fields;
      expect(emitter.sequence).equals("3");
    });

    it("Attest WETH from Ethereum", async () => {
      const published = ethereumTokenBridge.publishAttestMeta(
        WETH_ID,
        18,
        "WETH",
        "Wrapped Ether"
      );

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      // Deploy wrapped coin using template.
      const fullPathToTokenBridgeDependency = path.resolve(
        `${__dirname}/../../dependencies/token_bridge`
      );
      const clientConfig = path.resolve(`${__dirname}/sui_config/client.yaml`);
      const deployedCoinInfo = buildAndDeployWrappedCoin(
        WORMHOLE_ID,
        TOKEN_BRIDGE_ID,
        fullPathToTokenBridgeDependency,
        signedWormholeMessage,
        "yarn deploy",
        clientConfig
      );
      expect(deployedCoinInfo.id).equals(WRAPPED_WETH_ID);

      const newWrappedCoinType = `${TOKEN_BRIDGE_ID}::wrapped::NewWrappedCoin<${WRAPPED_WETH_COIN_TYPE}>`;
      expect(deployedCoinInfo.type).equals(newWrappedCoinType);

      // Execute `wrapped::register_wrapped_coin` on Token Bridge.
      // The deployer keypair originally created this coin, so we must use
      // `creator` to execute.
      const registerWrappedCoinTx = await creator
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "wrapped",
          function: "register_wrapped_coin",
          typeArguments: [WRAPPED_WETH_COIN_TYPE],
          arguments: [
            WORMHOLE_STATE_ID,
            TOKEN_BRIDGE_STATE_ID,
            WRAPPED_WETH_ID,
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(registerWrappedCoinTx).is.not.null;

      // Check registered asset.
      const tokenBridgeDynamicData = await provider
        .getDynamicFields(TOKEN_BRIDGE_STATE_ID)
        .then((result) => result.data);
      expect(tokenBridgeDynamicData).has.length(3);

      const dynamicItem = tokenBridgeDynamicData.find((item) =>
        item.name.includes(WRAPPED_WETH_COIN_TYPE)
      );
      expect(dynamicItem).is.not.undefined;

      const wrappedAssetInfo = await provider
        .getDynamicFieldObject(TOKEN_BRIDGE_STATE_ID, dynamicItem!.name)
        .then((result) => {
          if (
            typeof result.details !== "string" &&
            "data" in result.details &&
            "fields" in result.details.data
          ) {
            return result.details.data.fields;
          } else {
            return null;
          }
        });
      expect(wrappedAssetInfo).is.not.null;

      const treasuryCap = wrappedAssetInfo!.treasury_cap.fields;
      expect(treasuryCap.total_supply.fields.value).equals("0");
    });

    it("Mint WETH to Wallets", async () => {
      const rawAmount = ethers.utils.parseEther("69420");
      const unitDifference = ethers.BigNumber.from("10").pow(18 - 8);
      const mintAmount = rawAmount.div(unitDifference).toString();

      const destination = await wallet
        .getAddress()
        .then((address) =>
          Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
        );

      const published = ethereumTokenBridge.publishTransferTokens(
        tryNativeToHexString(WETH_ID, "ethereum"),
        2, // tokenChain
        BigInt(mintAmount),
        CHAIN_ID_SUI, // recipientChain
        destination.toString("hex"),
        0n
      );

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      const metadata = await provider.getCoinMetadata(WRAPPED_WETH_COIN_TYPE);
      const feeRecipient = await wallet
        .getAddress()
        .then((address) => ethers.utils.hexlify(Buffer.from(address, "hex")));

      // Execute `complete_transfer::submit_vaa` on Token Bridge.
      const completeTransferTx = await wallet
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "complete_transfer",
          function: "submit_vaa",
          typeArguments: [WRAPPED_WETH_COIN_TYPE],
          arguments: [
            WORMHOLE_STATE_ID,
            TOKEN_BRIDGE_STATE_ID,
            metadata.id!,
            Array.from(signedWormholeMessage),
            feeRecipient,
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(completeTransferTx).is.not.null;

      const coins = await provider
        .getCoins(feeRecipient, WRAPPED_WETH_COIN_TYPE)
        .then((result) => result.data);
      const nonzeroCoin = coins.find((coin) => coin.balance > 0);
      expect(nonzeroCoin).is.not.undefined;

      expect(
        ethers.BigNumber.from(nonzeroCoin!.balance)
          .mul(unitDifference)
          .eq(rawAmount)
      ).is.true;
    });
  });
});
