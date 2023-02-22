import {expect} from "chai";
import {ethers} from "ethers";
import {
  CHAIN_ID_SUI,
  tryNativeToHexString,
  parseTransferPayload,
  CHAIN_ID_ETH,
} from "@certusone/wormhole-sdk";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  ETHEREUM_TOKEN_BRIDGE_ADDRESS,
  GUARDIAN_PRIVATE_KEY,
  WALLET_PRIVATE_KEY,
  WORMHOLE_ID,
  RELAYER_PRIVATE_KEY,
  CREATOR_PRIVATE_KEY,
  WORMHOLE_STATE_ID,
  TOKEN_BRIDGE_STATE_ID,
  HELLO_TOKEN_ID,
  HELLO_TOKEN_OWNER_CAP_ID,
  COIN_8_TYPE,
  COIN_9_TYPE,
  WRAPPED_WETH_COIN_TYPE,
  WETH_ID,
} from "./helpers";
import {Ed25519Keypair, JsonRpcProvider, RawSigner} from "@mysten/sui.js";
import {
  getCreatedFromTransaction,
  getWormholeMessagesFromTransaction,
  getObjectFields,
  getTableFromDynamicObjectField,
  tokenBridgeNormalizeAmount,
  tokenBridgeTransform,
  getWormholeFeeCoins,
  computeRelayerFee,
  tokenBridgeDenormalizeAmount,
} from "../src";

describe("2: Hello Token", () => {
  const provider = new JsonRpcProvider("http://localhost:9000", {
    faucetURL: "http://localhost:9123/gas",
  });

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

  const localVariables: any = {};

  describe("Setup", () => {
    it("Get New Emitter", async () => {
      // Call `wormhole::get_new_emitter` on Wormhole for Token Bridge.
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

      // Transaction is successful, so grab emitter ID.
      const createdObjects = await getCreatedFromTransaction(getNewEmitterTx!);
      expect(createdObjects).has.length(1);

      const created = createdObjects[0];
      localVariables.emitterCapId = created.reference.objectId;
    });
  });

  describe("Create State", () => {
    const relayerFee = "42069"; // 4.2069%
    const relayerFeePrecision = "1000000";

    describe("Expect Failure", () => {
      it("Cannot Create State as Non-Owner", async () => {
        expect(localVariables.emitterCapId).is.not.undefined;
        const emitterCapId: string = localVariables.emitterCapId;

        // Call `owner::create_state` on HelloToken using the
        // `wallet` instead of the `creator` signer.
        const createStateTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "owner",
            function: "create_state",
            typeArguments: [],
            arguments: [
              HELLO_TOKEN_OWNER_CAP_ID,
              emitterCapId,
              relayerFee,
              relayerFeePrecision,
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            expect(reason.toString().includes("IncorrectSigner")).is.true;
            return null;
          });
        expect(createStateTx).is.null;
      });
    });

    describe("Finally Create State", () => {
      it("owner::create_state", async () => {
        expect(localVariables.emitterCapId).is.not.undefined;
        const emitterCapId: string = localVariables.emitterCapId;

        // Call `owner::create_state` on HelloToken.
        const createStateTx = await creator
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "owner",
            function: "create_state",
            typeArguments: [],
            arguments: [
              HELLO_TOKEN_OWNER_CAP_ID,
              emitterCapId,
              relayerFee,
              relayerFeePrecision,
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(createStateTx).is.not.null;

        // Transaction is successful, so grab state ID.
        const createdObjects = await getCreatedFromTransaction(createStateTx!);
        expect(createdObjects).has.length(3);

        // Fetch the state object by filtering on shared objects.
        const sharedObjectIds: string[] = [];
        for (const created of createdObjects) {
          const owner = created.owner;
          if (typeof owner !== "string" && "Shared" in owner) {
            sharedObjectIds.push(created.reference.objectId);
          }
        }
        expect(sharedObjectIds).has.length(1);
        localVariables.stateId = sharedObjectIds[0];
      });

      it("Cannot Call owner::create_state Again", async () => {
        expect(localVariables.emitterCapId).is.not.undefined;
        const emitterCapId: string = localVariables.emitterCapId;

        // Call `owner::create_state` on HelloToken again and
        // expect a failure.
        const createStateTx = await creator
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "owner",
            function: "create_state",
            typeArguments: [],
            arguments: [
              HELLO_TOKEN_OWNER_CAP_ID,
              emitterCapId,
              relayerFee,
              relayerFeePrecision,
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            expect(
              reason
                .toString()
                .includes(`Object deleted at reference (${emitterCapId}`)
            ).is.true;
            return null;
          });
        expect(createStateTx).is.null;
      });
    });
  });

  describe("Register Foreign Contract", () => {
    const foreignChain = 2;
    const foreignContractAddress = Buffer.alloc(32, "deadbeef");

    describe("Expect Failure", () => {
      it("Cannot Register Foreign Contract as Non-Owner", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Call `owner::register_foreign_contract` on HelloToken using `wallet`
        // instead of the `creator` signer. This should fail.
        const registerTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "owner",
            function: "register_foreign_contract",
            typeArguments: [],
            arguments: [
              HELLO_TOKEN_OWNER_CAP_ID,
              stateId,
              foreignChain,
              Array.from(foreignContractAddress),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            expect(reason.toString().includes("IncorrectSigner")).is.true;
            return null;
          });
        expect(registerTx).is.null;
      });
    });

    describe("Finally Create State", () => {
      it("owner::register_foreign_contract", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Call `owner::register_foreign_contract` on HelloToken.
        const registerTx = await creator
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "owner",
            function: "register_foreign_contract",
            typeArguments: [],
            arguments: [
              HELLO_TOKEN_OWNER_CAP_ID,
              stateId,
              foreignChain,
              Array.from(foreignContractAddress),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(registerTx).is.not.null;

        // Fetch HelloToken state object.
        const helloTokenDynamicObjectField = await provider
          .getDynamicFields(stateId)
          .then((result) => result.data);
        expect(helloTokenDynamicObjectField).has.length(1);

        // Grab the registeredContracts table from the state object.
        const registeredContracts = await getTableFromDynamicObjectField(
          provider,
          stateId,
          helloTokenDynamicObjectField[0].name!
        );
        expect(registeredContracts).has.length(1);

        // Verify that the contract was registered correctly.
        expect(parseInt(registeredContracts![0][0])).to.equal(foreignChain);
        expect(
          Buffer.from(registeredContracts![0][1].data).toString("hex")
        ).to.equal(foreignContractAddress.toString("hex"));
      });
    });
  });

  describe("Update Relayer Fee", () => {
    const relayerFee = "6942000"; // 6.942%
    const relayerFeePrecision = "100000000";

    it("owner::update_relayer_fee", async () => {
      expect(localVariables.stateId).is.not.undefined;
      const stateId: string = localVariables.stateId;

      // Call `owner::update_relayer_fee` on HelloToken.
      const registerTx = await creator
        .executeMoveCall({
          packageObjectId: HELLO_TOKEN_ID,
          module: "owner",
          function: "update_relayer_fee",
          typeArguments: [],
          arguments: [
            HELLO_TOKEN_OWNER_CAP_ID,
            stateId,
            relayerFee,
            relayerFeePrecision,
          ],
          gasBudget: 20000,
        })
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(registerTx).is.not.null;

      // Fetch HelloToken state object and verify that the relayer
      // fee was updated correctly.
      const helloTokenState = await getObjectFields(provider, stateId);
      expect(helloTokenState.relayer_fee.fields.precision).to.equal(
        relayerFeePrecision
      );
      expect(helloTokenState.relayer_fee.fields.value).to.equal(relayerFee);
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

    // Emitter ID of the Hello Token contract formatted as a 32-byte address.
    const helloTokenEmitter = tryNativeToHexString(
      "0x0000000000000000000000000000000000000003",
      "ethereum"
    );

    describe("Coin 8", () => {
      it("transfer::send_tokens_with_payload", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Fetch wallet address.
        const walletAddress = await wallet.getAddress();

        // Set the transfer amount.
        localVariables.transferAmountCoin8 = "100000000";
        const amount = localVariables.transferAmountCoin8;

        // Fetch sui coins to pay the wormhole fee.
        const wormholeFeeCoin = await getWormholeFeeCoins(provider, wallet);

        // Grab COIN_8 balance.
        const [transferCoin] = await provider
          .getCoins(walletAddress, COIN_8_TYPE)
          .then((result) => result.data);

        // Split the coin object into a separate object.
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

        // Fetch the coin balance before transferring.
        const coinBalanceBefore = await provider.getBalance(
          walletAddress!,
          COIN_8_TYPE
        );

        // Send a transfer by invoking `transfer::send_tokens_with_payload`
        const sendWithPayloadTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "send_tokens_with_payload",
            typeArguments: [COIN_8_TYPE],
            arguments: [
              stateId,
              WORMHOLE_STATE_ID,
              TOKEN_BRIDGE_STATE_ID,
              splitCoin!,
              wormholeFeeCoin!,
              foreignChain,
              "0", // batchId
              Array.from(foreignContractAddress),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(sendWithPayloadTx).is.not.null;

        // Fetch the Wormhole message emitted by the contract.
        const wormholeMessages = await getWormholeMessagesFromTransaction(
          provider,
          WORMHOLE_ID,
          sendWithPayloadTx!
        );

        // Verify message contents.
        const message = wormholeMessages[0];
        expect(message.emitter).equals(HELLO_TOKEN_ID);
        expect(message.finality).equal(0);
        expect(message.sequence).equals("3");
        expect(message.batchId).equals(0);

        // Check state.
        const helloTokenState = await getObjectFields(provider, stateId);
        expect(helloTokenState.emitter_cap.fields.sequence).equals("0");

        // Verify the transfer payload.
        const transferPayload = await parseTransferPayload(message.payload);
        expect(transferPayload.amount.toString()).to.equal(amount);
        expect(
          transferPayload.fromAddress!.endsWith(
            helloTokenState.emitter_cap.fields.emitter
          )
        ).is.true;
        expect(transferPayload.originChain).to.equal(CHAIN_ID_SUI);
        expect(transferPayload.targetAddress).to.equal(
          Buffer.alloc(32, "deadbeef").toString("hex")
        );
        expect(transferPayload.targetChain).to.equal(Number(foreignChain));

        // Fetch and validate the coin balance change after the transfer.
        const coinBalanceAfter = await provider.getBalance(
          walletAddress,
          COIN_8_TYPE
        );
        expect(
          coinBalanceBefore.totalBalance - coinBalanceAfter.totalBalance
        ).eq(parseInt(amount));
      });

      it("transfer::redeem_transfer_with_payload With Relayer", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Define transfer parameters.
        const tokenAddress = "0x0000000000000000000000000000000000000002";
        const mintAmount = Math.floor(
          Number(localVariables.transferAmountCoin8) / 2
        ).toString();
        const destination = await wallet
          .getAddress()
          .then((address) =>
            Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
          );
        const payload = Buffer.concat([Buffer.alloc(1, 1), destination]);

        // Fetch coin balances for the relayer and recipient before
        // completing the transfer.
        const recipientBalanceBefore = await provider.getBalance(
          await wallet.getAddress(),
          COIN_8_TYPE
        );
        const relayerBalanceBefore = await provider.getBalance(
          await relayer.getAddress(),
          COIN_8_TYPE
        );

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tryNativeToHexString(tokenAddress, "ethereum"),
          CHAIN_ID_SUI, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          helloTokenEmitter, // recipient
          foreignContractAddress, // fromAddress
          payload,
          0 // nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Execute `transfer::redeem_tokens_with_payload`
        const completeTransferTx = await relayer
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "redeem_transfer_with_payload",
            typeArguments: [COIN_8_TYPE],
            arguments: [
              stateId,
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
        expect(completeTransferTx).is.not.null;

        // Fetch coin balances for the recipient and relayer after
        // completing the transfer.
        const recipientBalanceAfter = await provider.getBalance(
          await wallet.getAddress(),
          COIN_8_TYPE
        );
        const relayerBalanceAfter = await provider.getBalance(
          await relayer.getAddress(),
          COIN_8_TYPE
        );

        // Fetch the relayer fee from the hello token state.
        const helloTokenState = await getObjectFields(provider, stateId);
        const relayerFee = Number(helloTokenState.relayer_fee.fields.value);
        const relayerFeePrecision = Number(
          helloTokenState.relayer_fee.fields.precision
        );

        // Confirm relayer balance change.
        const expectedRelayerBalanceChange = computeRelayerFee(
          Number(mintAmount),
          relayerFee,
          relayerFeePrecision
        );
        expect(expectedRelayerBalanceChange).to.equal(
          relayerBalanceAfter.totalBalance - relayerBalanceBefore.totalBalance
        );

        // Confirm recipient balance changes.
        const expectedRecipientBalanceChange =
          Number(mintAmount) - expectedRelayerBalanceChange;
        expect(expectedRecipientBalanceChange).to.equal(
          recipientBalanceAfter.totalBalance -
            recipientBalanceBefore.totalBalance
        );
      });

      it("transfer::redeem_transfer_with_payload Self Redemption", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Define transfer parameters.
        const tokenAddress = "0x0000000000000000000000000000000000000002";
        const mintAmount = Math.floor(
          Number(localVariables.transferAmountCoin8) / 2
        ).toString();
        const destination = await wallet
          .getAddress()
          .then((address) =>
            Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
          );
        const payload = Buffer.concat([Buffer.alloc(1, 1), destination]);

        // Fetch recipient coin balance before completing the transfer.
        const recipientBalanceBefore = await provider.getBalance(
          await wallet.getAddress(),
          COIN_8_TYPE
        );

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tryNativeToHexString(tokenAddress, "ethereum"),
          CHAIN_ID_SUI, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          helloTokenEmitter, // recipient
          foreignContractAddress, // fromAddress
          payload,
          0 // nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Execute `transfer::redeem_tokens_with_payload`
        const completeTransferTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "redeem_transfer_with_payload",
            typeArguments: [COIN_8_TYPE],
            arguments: [
              stateId,
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
        expect(completeTransferTx).is.not.null;

        // Fetch recipient coin balances after the completing the transfer
        // and verify that the recipient received the correct number of coins.
        const recipientBalanceAfter = await provider.getBalance(
          await wallet.getAddress(),
          COIN_8_TYPE
        );

        // Confirm balance changes.
        expect(Number(mintAmount)).to.equal(
          recipientBalanceAfter.totalBalance -
            recipientBalanceBefore.totalBalance
        );
      });
    });

    describe("Coin 9", () => {
      it("transfer::send_tokens_with_payload", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Fetch wallet address.
        const walletAddress = await wallet.getAddress();

        // Set the transfer amount.
        localVariables.transferAmountCoin9 = "455";
        const amount = localVariables.transferAmountCoin9;

        // Fetch sui coins to pay the wormhole fee.
        const wormholeFeeCoin = await getWormholeFeeCoins(provider, wallet);

        // Grab COIN_9 balance.
        const [transferCoin] = await provider
          .getCoins(walletAddress, COIN_9_TYPE)
          .then((result) => result.data);

        // Fetch the coin metadata.
        const metadata = await provider.getCoinMetadata(COIN_9_TYPE);

        // Compute the normalized amount for data validation. The token
        // bridge normalizes transfer quantites for tokens that have
        // decimals greater than 8.
        const normalizedAmount = tokenBridgeNormalizeAmount(
          ethers.BigNumber.from(amount),
          metadata.decimals
        );

        // Split the coin object into a separate object.
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

        // Fetch the coin balance before transferring.
        const coinBalanceBefore = await provider.getBalance(
          walletAddress!,
          COIN_9_TYPE
        );

        // Send a transfer by invoking `transfer::send_tokens_with_payload`
        const sendWithPayloadTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "send_tokens_with_payload",
            typeArguments: [COIN_9_TYPE],
            arguments: [
              stateId,
              WORMHOLE_STATE_ID,
              TOKEN_BRIDGE_STATE_ID,
              splitCoin!,
              wormholeFeeCoin!,
              foreignChain,
              "0", // batchId
              Array.from(foreignContractAddress),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(sendWithPayloadTx).is.not.null;

        // Fetch the Wormhole message emitted by the contract.
        const wormholeMessages = await getWormholeMessagesFromTransaction(
          provider,
          WORMHOLE_ID,
          sendWithPayloadTx!
        );

        // Verify message contents.
        const message = wormholeMessages[0];
        expect(message.emitter).equals(HELLO_TOKEN_ID);
        expect(message.finality).equal(0);
        expect(message.sequence).equals("4");
        expect(message.batchId).equals(0);

        // Check state.
        const helloTokenState = await getObjectFields(provider, stateId);
        expect(helloTokenState.emitter_cap.fields.sequence).equals("0");

        // Verify the transfer payload.
        const transferPayload = await parseTransferPayload(message.payload);
        expect(transferPayload.amount.toString()).to.equal(
          normalizedAmount.toString()
        );
        expect(
          transferPayload.fromAddress!.endsWith(
            helloTokenState.emitter_cap.fields.emitter
          )
        ).is.true;
        expect(transferPayload.originChain).to.equal(CHAIN_ID_SUI);
        expect(transferPayload.targetAddress).to.equal(
          Buffer.alloc(32, "deadbeef").toString("hex")
        );
        expect(transferPayload.targetChain).to.equal(Number(foreignChain));

        // Fetch the coin balance after transferring. The difference
        // in balance should reflect the transformed amount, since the
        // token being transferred has 9 decimals, and the token bridge
        // truncates the transfer amount.
        const coinBalanceAfter = await provider.getBalance(
          walletAddress,
          COIN_9_TYPE
        );

        // Compute the normalized amount for data validation.
        const transformedAmount = tokenBridgeTransform(
          ethers.BigNumber.from(amount),
          metadata.decimals
        );
        expect(
          coinBalanceBefore.totalBalance - coinBalanceAfter.totalBalance
        ).eq(transformedAmount.toNumber());
      });

      it("transfer::redeem_transfer_with_payload With Relayer", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Define transfer parameters.
        const tokenAddress = "0x0000000000000000000000000000000000000001";
        const tokenDecimals = 9;

        // We need to truncate the amount based on the token decimals
        // the same way that the token bridge does. This test will
        // fail if this step is not completed, since the amount
        // deposited in the bridge in the previous test is the truncated
        // amount.
        const rawMintAmount = Math.floor(
          Number(localVariables.transferAmountCoin9) / 2
        ).toString();
        const mintAmount = tokenBridgeNormalizeAmount(
          ethers.BigNumber.from(rawMintAmount),
          tokenDecimals
        );

        // Recipient wallet.
        const destination = await wallet
          .getAddress()
          .then((address) =>
            Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
          );
        const payload = Buffer.concat([Buffer.alloc(1, 1), destination]);

        // Fetch coin balances for the relayer and recipient before
        // completing the transfer.
        const recipientBalanceBefore = await provider.getBalance(
          await wallet.getAddress(),
          COIN_9_TYPE
        );
        const relayerBalanceBefore = await provider.getBalance(
          await relayer.getAddress(),
          COIN_9_TYPE
        );

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tryNativeToHexString(tokenAddress, "ethereum"),
          CHAIN_ID_SUI, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          helloTokenEmitter, // recipient
          foreignContractAddress, // fromAddress
          payload,
          0 // nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Execute `transfer::redeem_tokens_with_payload`
        const completeTransferTx = await relayer
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "redeem_transfer_with_payload",
            typeArguments: [COIN_9_TYPE],
            arguments: [
              stateId,
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
        expect(completeTransferTx).is.not.null;

        // Fetch coin balances for the recipient and relayer after
        // completing the transfer.
        const recipientBalanceAfter = await provider.getBalance(
          await wallet.getAddress(),
          COIN_9_TYPE
        );
        const relayerBalanceAfter = await provider.getBalance(
          await relayer.getAddress(),
          COIN_9_TYPE
        );

        // Fetch the relayer fee from the hello token state.
        const helloTokenState = await getObjectFields(provider, stateId);
        const relayerFee = Number(helloTokenState.relayer_fee.fields.value);
        const relayerFeePrecision = Number(
          helloTokenState.relayer_fee.fields.precision
        );

        // Denormalize the mintAmount to compute balance changes.
        const denormalizedMintAmount = tokenBridgeDenormalizeAmount(
          mintAmount,
          tokenDecimals
        ).toNumber();

        // Confirm relayer balance change.
        const expectedRelayerBalanceChange = computeRelayerFee(
          denormalizedMintAmount,
          relayerFee,
          relayerFeePrecision
        );
        expect(expectedRelayerBalanceChange).to.equal(
          relayerBalanceAfter.totalBalance - relayerBalanceBefore.totalBalance
        );

        // Confirm recipient balance change.
        const expectedRecipientBalanceChange =
          denormalizedMintAmount - expectedRelayerBalanceChange;
        expect(expectedRecipientBalanceChange).to.equal(
          recipientBalanceAfter.totalBalance -
            recipientBalanceBefore.totalBalance
        );
      });

      it("transfer::redeem_transfer_with_payload Self Redemption", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Define transfer parameters.
        const tokenAddress = "0x0000000000000000000000000000000000000001";
        const tokenDecimals = 9;

        // We need to truncate the amount based on the token decimals
        // the same way that the token bridge does. This test will
        // fail if this step is not completed, since the amount
        // deposited in the bridge in the previous test is the truncated
        // amount.
        const rawMintAmount = Math.floor(
          Number(localVariables.transferAmountCoin9) / 2
        ).toString();
        const mintAmount = tokenBridgeNormalizeAmount(
          ethers.BigNumber.from(rawMintAmount),
          tokenDecimals
        );

        // Recipient wallet.
        const destination = await wallet
          .getAddress()
          .then((address) =>
            Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
          );
        const payload = Buffer.concat([Buffer.alloc(1, 1), destination]);

        // Fetch recipient coin balance before completing the transfer.
        const recipientBalanceBefore = await provider.getBalance(
          await wallet.getAddress(),
          COIN_9_TYPE
        );

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tryNativeToHexString(tokenAddress, "ethereum"),
          CHAIN_ID_SUI, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          helloTokenEmitter, // recipient
          foreignContractAddress, // fromAddress
          payload,
          0 // nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Execute `transfer::redeem_tokens_with_payload`
        const completeTransferTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "redeem_transfer_with_payload",
            typeArguments: [COIN_9_TYPE],
            arguments: [
              stateId,
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
        expect(completeTransferTx).is.not.null;

        // Fetch coin balances before completing the transfer.
        const recipientBalanceAfter = await provider.getBalance(
          await wallet.getAddress(),
          COIN_9_TYPE
        );

        // Denormalize the mintAmount to compute balance changes.
        const denormalizedMintAmount = tokenBridgeDenormalizeAmount(
          mintAmount,
          tokenDecimals
        ).toNumber();

        expect(denormalizedMintAmount).to.equal(
          recipientBalanceAfter.totalBalance -
            recipientBalanceBefore.totalBalance
        );
      });
    });

    describe("Wrapped Ether", () => {
      it("transfer::send_tokens_with_payload", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Fetch wallet address.
        const walletAddress = await wallet.getAddress();

        // Set the transfer amount.
        const amount = "69";

        // Fetch sui coins to pay the wormhole fee.
        const wormholeFeeCoin = await getWormholeFeeCoins(provider, wallet);

        // Grab wrapped eth balance.
        const coins = await provider
          .getCoins(walletAddress, WRAPPED_WETH_COIN_TYPE)
          .then((result) => result.data);
        const nonzeroCoin = coins.find((coin) => coin.balance > 0);
        expect(nonzeroCoin!.balance > parseInt(amount)).is.true;

        // Split the coin object into a separate object.
        const splitCoin = await wallet
          .splitCoin({
            coinObjectId: nonzeroCoin!.coinObjectId,
            splitAmounts: [Number(amount)],
            gasBudget: 2000,
          })
          .then(async (tx) => {
            const created = await getCreatedFromTransaction(tx).then(
              (objects) => objects[0]
            );
            return "reference" in created ? created.reference.objectId : null;
          });
        expect(splitCoin).is.not.null;

        // Fetch the coin balance before transferring.
        const coinBalanceBefore = await provider.getBalance(
          walletAddress!,
          WRAPPED_WETH_COIN_TYPE
        );

        // Send a transfer by invoking `transfer::send_tokens_with_payload`
        const sendWithPayloadTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "send_tokens_with_payload",
            typeArguments: [WRAPPED_WETH_COIN_TYPE],
            arguments: [
              stateId,
              WORMHOLE_STATE_ID,
              TOKEN_BRIDGE_STATE_ID,
              splitCoin!,
              wormholeFeeCoin!,
              foreignChain,
              "0", // batchId
              Array.from(foreignContractAddress),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(sendWithPayloadTx).is.not.null;

        // Fetch the Wormhole message emitted by the contract.
        const wormholeMessages = await getWormholeMessagesFromTransaction(
          provider,
          WORMHOLE_ID,
          sendWithPayloadTx!
        );

        // Verify message contents.
        const message = wormholeMessages[0];
        expect(message.emitter).equals(HELLO_TOKEN_ID);
        expect(message.finality).equal(0);
        expect(message.sequence).equals("5");
        expect(message.batchId).equals(0);

        // Check state.
        const helloTokenState = await getObjectFields(provider, stateId);
        expect(helloTokenState.emitter_cap.fields.sequence).equals("0");

        // Verify the transfer payload.
        const transferPayload = await parseTransferPayload(message.payload);
        expect(
          transferPayload.fromAddress!.endsWith(
            helloTokenState.emitter_cap.fields.emitter
          )
        ).is.true;
        expect(transferPayload.originChain).to.equal(CHAIN_ID_ETH);
        expect(transferPayload.targetAddress).to.equal(
          Buffer.alloc(32, "deadbeef").toString("hex")
        );
        expect(transferPayload.targetChain).to.equal(Number(foreignChain));

        // Fetch the coin balance after doing the transfer.
        const coinBalanceAfter = await provider.getBalance(
          walletAddress,
          WRAPPED_WETH_COIN_TYPE
        );
        expect(
          coinBalanceBefore.totalBalance - coinBalanceAfter.totalBalance
        ).eq(parseInt(amount));
      });

      it("transfer::redeem_transfer_with_payload With Relayer", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Set the mint amount.
        const mintAmount = "69000000";

        // Recipient wallet.
        const destination = await wallet
          .getAddress()
          .then((address) =>
            Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
          );
        const payload = Buffer.concat([Buffer.alloc(1, 1), destination]);

        // Fetch coin balances for the relayer and recipient before
        // completing the transfer.
        const recipientBalanceBefore = await provider.getBalance(
          await wallet.getAddress(),
          WRAPPED_WETH_COIN_TYPE
        );
        const relayerBalanceBefore = await provider.getBalance(
          await relayer.getAddress(),
          WRAPPED_WETH_COIN_TYPE
        );

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tryNativeToHexString(WETH_ID, "ethereum"),
          CHAIN_ID_ETH, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          helloTokenEmitter, // recipient
          foreignContractAddress, // fromAddress
          payload,
          0 // nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Execute `transfer::redeem_tokens_with_payload`
        const completeTransferTx = await relayer
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "redeem_transfer_with_payload",
            typeArguments: [WRAPPED_WETH_COIN_TYPE],
            arguments: [
              stateId,
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
        expect(completeTransferTx).is.not.null;

        // Fetch coin balances for the recipient and relayer after
        // completing the transfer.
        const recipientBalanceAfter = await provider.getBalance(
          await wallet.getAddress(),
          WRAPPED_WETH_COIN_TYPE
        );
        const relayerBalanceAfter = await provider.getBalance(
          await relayer.getAddress(),
          WRAPPED_WETH_COIN_TYPE
        );

        // Fetch the relayer fee from the hello token state.
        const helloTokenState = await getObjectFields(provider, stateId);
        const relayerFee = Number(helloTokenState.relayer_fee.fields.value);
        const relayerFeePrecision = Number(
          helloTokenState.relayer_fee.fields.precision
        );

        // Confirm relayer balance change.
        const expectedRelayerBalanceChange = computeRelayerFee(
          Number(mintAmount),
          relayerFee,
          relayerFeePrecision
        );
        expect(expectedRelayerBalanceChange).to.equal(
          relayerBalanceAfter.totalBalance - relayerBalanceBefore.totalBalance
        );

        // Confirm recipient balance change.
        const expectedRecipientBalanceChange =
          Number(mintAmount) - expectedRelayerBalanceChange;
        expect(expectedRecipientBalanceChange).to.equal(
          recipientBalanceAfter.totalBalance -
            recipientBalanceBefore.totalBalance
        );
      });

      it("transfer::redeem_transfer_with_payload Self Redemption", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Set the mint amount.
        const mintAmount = "42000000";

        // Recipient wallet.
        const destination = await wallet
          .getAddress()
          .then((address) =>
            Buffer.concat([Buffer.alloc(12), Buffer.from(address, "hex")])
          );
        const payload = Buffer.concat([Buffer.alloc(1, 1), destination]);

        // Fetch recipient coin balance before completing the transfer.
        const recipientBalanceBefore = await provider.getBalance(
          await wallet.getAddress(),
          WRAPPED_WETH_COIN_TYPE
        );

        // Create a transfer tokens with payload message.
        const published = ethereumTokenBridge.publishTransferTokensWithPayload(
          tryNativeToHexString(WETH_ID, "ethereum"),
          CHAIN_ID_ETH, // tokenChain
          BigInt(mintAmount.toString()),
          CHAIN_ID_SUI, // recipientChain
          helloTokenEmitter, // recipient
          foreignContractAddress, // fromAddress
          payload,
          0 // nonce
        );

        // Sign the transfer message.
        const signedWormholeMessage = guardians.addSignatures(published, [0]);

        // Execute `transfer::redeem_tokens_with_payload`
        const completeTransferTx = await wallet
          .executeMoveCall({
            packageObjectId: HELLO_TOKEN_ID,
            module: "transfer",
            function: "redeem_transfer_with_payload",
            typeArguments: [WRAPPED_WETH_COIN_TYPE],
            arguments: [
              stateId,
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
        expect(completeTransferTx).is.not.null;

        // Fetch coin balances before completing the transfer.
        const recipientBalanceAfter = await provider.getBalance(
          await wallet.getAddress(),
          WRAPPED_WETH_COIN_TYPE
        );

        // Verify balance changes.
        expect(Number(mintAmount)).to.equal(
          recipientBalanceAfter.totalBalance -
            recipientBalanceBefore.totalBalance
        );
      });
    });
  });
});
