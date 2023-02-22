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
  getTableFromDynamicObjectField,
  getWormholeFeeCoins,
  getRegisteredAssetInfo,
} from "../src";

describe("0: Wormhole", () => {
  const provider = new JsonRpcProvider(Network.LOCAL);

  // User wallet.
  const wallet = new RawSigner(
    Ed25519Keypair.fromSeed(WALLET_PRIVATE_KEY),
    provider
  );

  // Relayer wallet.
  const relayer = new RawSigner(
    Ed25519Keypair.fromSeed(RELAYER_PRIVATE_KEY),
    provider
  );

  // Deployer wallet.
  const creator = new RawSigner(
    Ed25519Keypair.fromSeed(CREATOR_PRIVATE_KEY),
    provider
  );

  // Mock guardians for signing wormhole messages.
  const guardians = new mock.MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);

  // for governance actions to modify programs
  const governance = new mock.GovernanceEmitter(GOVERNANCE_EMITTER_ID, 20);

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
      // Balance check wallet.
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

      // Balance check relayer.
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

        // Format the amount based on the coin decimals.
        const amount = ethers.utils
          .parseUnits("69420", metadata.decimals)
          .add(10) // for outbound transfer later
          .toString();

        // Mint and transfer the coins.
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

        // Format the amount based on the coin decimals.
        const amount = ethers.utils
          .parseUnits("69420", metadata.decimals)
          .toString();

        // Mint and transfer the coins.
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
            GOVERNANCE_CHAIN,
            Array.from(Buffer.from(GOVERNANCE_EMITTER_ID, "hex")),
            [Array.from(devnetGuardian)],
            "0", // message fee
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
      expect(createdObjects).has.length(3);

      const created = createdObjects[0];
      if (created.owner != "Immutable" && "Shared" in created.owner) {
        const stateId = created.reference.objectId;
        expect(stateId).equals(WORMHOLE_STATE_ID);
      } else {
        unexpected();
      }

      // Verify that the Wormhole state was set up correctly.
      const fields = await getObjectFields(provider, WORMHOLE_STATE_ID);

      // Guardian set index.
      expect(fields).has.property("guardian_set_index");
      expect(fields.guardian_set_index).equals(0);

      // Guardian set.
      expect(fields).has.property("guardian_sets");
      const guardianSets = fields.guardian_sets.fields.contents;
      expect(guardianSets).has.length(1);

      const guardianSet = guardianSets[0].fields.value.fields;
      expect(guardianSet.index).equals(0);

      const guardianKeys = guardianSet.guardians;
      expect(guardianKeys).has.length(1);

      const guardianKey = guardianKeys[0].fields.addr.fields.data;
      expect(guardianKey).deep.equals(Array.from(devnetGuardian));

      // Emitter registry.
      expect(fields).has.property("emitter_registry");
      expect(fields.emitter_registry.fields.next_id).equals("1");
    });
  });

  describe("Verify Token Bridge Program", () => {
    // Mock Ethereum Token Bridge.
    const ethereumTokenBridge = new mock.MockEthereumTokenBridge(
      ETHEREUM_TOKEN_BRIDGE_ADDRESS
    );

    it("Get New Emitter", async () => {
      // Call `get_new_emitter` on Wormhole for Token Bridge. This registers
      // the Token Bridge with Wormhole, which will allow the Token Bridge
      // to publish messages.
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

      // Transaction is successful, verify the Token Bridge emitter ID.
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
          module: "state",
          function: "init_and_share_state",
          typeArguments: [],
          arguments: [TOKEN_BRIDGE_CREATOR_CAPABILITY_ID, WORMHOLE_STATE_ID],
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
      expect(createdObjects).has.length(3);

      const created = createdObjects[1];
      if (created.owner != "Immutable" && "Shared" in created.owner) {
        const stateId = created.reference.objectId;
        expect(stateId).equals(TOKEN_BRIDGE_STATE_ID);

        // Finally verify the Token Bridge state.
        const fields = await getObjectFields(provider, TOKEN_BRIDGE_STATE_ID);

        expect(fields).has.property("emitter_cap");
        expect(fields.emitter_cap.fields.sequence).equals("0");
      } else {
        unexpected();
      }
    });

    it("Register Foreign Emitter (Ethereum)", async () => {
      // Create an emitter registration VAA.
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

      // Fetch the registerred emitters table.
      const tokenBridgeDynamicData = await provider
        .getDynamicFields(TOKEN_BRIDGE_STATE_ID)
        .then((result) => result.data);

      expect(tokenBridgeDynamicData).has.length(1);

      const registeredEmitters = await getTableFromDynamicObjectField(
        provider,
        TOKEN_BRIDGE_STATE_ID,
        tokenBridgeDynamicData[0].name!
      );
      expect(registeredEmitters).has.length(1);

      // Finally here to check the state to find new emitter.
      const registeredEmitter = registeredEmitters[0];
      expect(parseInt(registeredEmitter[0])).equals(2);
      expect(registeredEmitter[1].external_address).deep.equals(
        Array.from(
          tryNativeToUint8Array(ETHEREUM_TOKEN_BRIDGE_ADDRESS, "ethereum")
        )
      );
    });

    // Before any coin can be transferred out, it needs to be attested for.
    it("Attest Native Coins", async () => {
      // COIN_9
      {
        // Fetch Sui object to pay wormhole fees with.
        const wormholeFeeCoins = await getWormholeFeeCoins(provider, wallet);

        // Coin 9 metadata.
        const metadata = await provider.getCoinMetadata(COIN_9_TYPE);

        // Call `attest_token::attest_token` on Token Bridge.
        const attestTokensTx = await wallet
          .executeMoveCall({
            packageObjectId: TOKEN_BRIDGE_ID,
            module: "attest_token",
            function: "attest_token",
            typeArguments: [COIN_9_TYPE],
            arguments: [
              TOKEN_BRIDGE_STATE_ID,
              WORMHOLE_STATE_ID,
              metadata.id!,
              wormholeFeeCoins!,
              0, // batch ID
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(attestTokensTx).is.not.null;

        // Check the Wormhole message event emitted by the contract.
        const wormholeMessages = await getWormholeMessagesFromTransaction(
          provider,
          WORMHOLE_ID,
          attestTokensTx!
        );
        expect(wormholeMessages).has.length(1);

        const message = wormholeMessages[0];
        expect(message.emitter).equals(TOKEN_BRIDGE_ID);
        expect(message.sequence).equals("0");

        // Verify state changes.
        const tokenBridgeState = await getObjectFields(
          provider,
          TOKEN_BRIDGE_STATE_ID
        );

        // Emitter sequence should've upticked.
        const emitter = tokenBridgeState.emitter_cap.fields;
        expect(emitter.sequence).equals("1");

        // Native coin count should've upticked.
        const registeredTokens = tokenBridgeState.registered_tokens.fields;
        expect(registeredTokens.num_native).to.equal("1");
        expect(registeredTokens.num_wrapped).to.equal("0");
      }

      // COIN_8
      {
        // Fetch Sui object to pay wormhole fees with.
        const wormholeFeeCoins = await getWormholeFeeCoins(provider, wallet);

        // Coin 8 metadata.
        const metadata = await provider.getCoinMetadata(COIN_8_TYPE);

        // Call `attest_token::attest_token` on Token Bridge
        const attestTokensTx = await wallet
          .executeMoveCall({
            packageObjectId: TOKEN_BRIDGE_ID,
            module: "attest_token",
            function: "attest_token",
            typeArguments: [COIN_8_TYPE],
            arguments: [
              TOKEN_BRIDGE_STATE_ID,
              WORMHOLE_STATE_ID,
              metadata.id!,
              wormholeFeeCoins!,
              0, // batch ID
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(attestTokensTx).is.not.null;

        // Check the Wormhole message event emitted by the contract.
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

        // Emitter sequence should've upticked.
        const emitter = tokenBridgeState.emitter_cap.fields;
        expect(emitter.sequence).equals("2");

        // Native coin count should've upticked.
        const registeredTokens = tokenBridgeState.registered_tokens.fields;
        expect(registeredTokens.num_native).to.equal("2");
        expect(registeredTokens.num_wrapped).to.equal("0");
      }
    });

    it("Outbound Transfer Native", async () => {
      const walletAddress = await wallet.getAddress();
      const amount = "10";
      const recipientChain = "2";
      const recipient = Buffer.alloc(32, "deadbeef");
      const relayerFee = "0";
      const batchId = "69";

      // Fetch Sui object to pay wormhole fees with.
      const wormholeFeeCoins = await getWormholeFeeCoins(provider, wallet);

      // Grab balance.
      const [transferCoin] = await provider
        .getCoins(walletAddress, COIN_9_TYPE)
        .then((result) => result.data);

      // Split coin into another coin object.
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

      // Call `transfer_tokens::transfer_tokens` on Token Bridge.
      const transferTokensTx = await wallet
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "transfer_tokens",
          function: "transfer_tokens",
          typeArguments: [COIN_9_TYPE],
          arguments: [
            TOKEN_BRIDGE_STATE_ID,
            WORMHOLE_STATE_ID,
            splitCoin!,
            wormholeFeeCoins!,
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

      // Check the Wormhole message event emitted by the contract.
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
      // Create an attestation VAA.
      const published = ethereumTokenBridge.publishAttestMeta(
        WETH_ID,
        18,
        "WETH",
        "Wrapped Ether"
      );

      // Sign the VAA.
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

      const newWrappedCoinType = `${TOKEN_BRIDGE_ID}::wrapped_coin::WrappedCoin<${WRAPPED_WETH_COIN_TYPE}>`;
      expect(deployedCoinInfo.type).equals(newWrappedCoinType);

      // Execute `create_wrapped::register_wrapped_coin` on Token Bridge.
      // The deployer keypair originally created this coin, so we must use
      // `creator` to execute the call.
      const registerWrappedCoinTx = await creator
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "create_wrapped",
          function: "register_wrapped_coin",
          typeArguments: [WRAPPED_WETH_COIN_TYPE],
          arguments: [
            TOKEN_BRIDGE_STATE_ID,
            WORMHOLE_STATE_ID,
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

      // Check state.
      const tokenBridgeState = await getObjectFields(
        provider,
        TOKEN_BRIDGE_STATE_ID
      );

      // Fetch the wrapped asset info
      const registeredTokens = tokenBridgeState.registered_tokens.fields;
      expect(registeredTokens.num_native).to.equal("2");

      // Wrapped token count should've upticked.
      expect(registeredTokens.num_wrapped).to.equal("1");

      // Fetch the wrapped asset info.
      const wrappedAssetInfo = await getRegisteredAssetInfo(
        provider,
        registeredTokens.id.id,
        WRAPPED_WETH_COIN_TYPE
      );

      const treasuryCap = wrappedAssetInfo!.value.fields.treasury_cap.fields;
      expect(treasuryCap.total_supply.fields.value).equals("0");
    });

    it("Mint WETH to Wallets", async () => {
      const rawAmount = ethers.utils.parseEther("69420");
      const unitDifference = ethers.BigNumber.from("10").pow(18 - 8);
      const mintAmount = rawAmount.div(unitDifference).toString();

      // Recipient's wallet.
      const destinationBytes = await wallet
        .getAddress()
        .then((address) =>
          Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
        );

      // Create a token transfer VAA.
      const published = ethereumTokenBridge.publishTransferTokens(
        tryNativeToHexString(WETH_ID, "ethereum"),
        2, // tokenChain
        BigInt(mintAmount),
        CHAIN_ID_SUI, // recipientChain
        destinationBytes.toString("hex"),
        0n
      );

      // Sign the transfer message.
      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      // Grab the destination wallet's address. This will be used as a place
      // holder for the fee recipient. No fee will be paid out.
      const desitnationAddress = await wallet
        .getAddress()
        .then((address) => ethers.utils.hexlify(Buffer.from(address, "hex")));

      // Execute `complete_transfer::complete_transfer` on Token Bridge.
      const completeTransferTx = await wallet
        .executeMoveCall({
          packageObjectId: TOKEN_BRIDGE_ID,
          module: "complete_transfer",
          function: "complete_transfer",
          typeArguments: [WRAPPED_WETH_COIN_TYPE],
          arguments: [
            TOKEN_BRIDGE_STATE_ID,
            WORMHOLE_STATE_ID,
            Array.from(signedWormholeMessage),
            desitnationAddress,
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(completeTransferTx).is.not.null;

      // Fetch the wrapped asset's coin object after the transfer to
      // verify that the tokens were minted to the recipient.
      const coins = await provider
        .getCoins(desitnationAddress, WRAPPED_WETH_COIN_TYPE)
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
