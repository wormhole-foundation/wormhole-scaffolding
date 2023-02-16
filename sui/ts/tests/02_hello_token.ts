import {expect} from "chai";
import * as path from "path";
import {ethers} from "ethers";
import {
  CHAIN_ID_SUI,
  tryNativeToHexString,
  tryNativeToUint8Array,
  parseTransferPayload,
  CHAIN_ID_ETH,
} from "@certusone/wormhole-sdk";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  GUARDIAN_PRIVATE_KEY,
  WALLET_PRIVATE_KEY,
  WORMHOLE_ID,
  RELAYER_PRIVATE_KEY,
  CREATOR_PRIVATE_KEY,
  WORMHOLE_STATE_ID,
  TOKEN_BRIDGE_STATE_ID,
  COIN_8_TYPE,
  COIN_9_TYPE,
  WRAPPED_WETH_COIN_TYPE,
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
} from "../src";

const HELLO_TOKEN_ID = "0x57bdf56537175f8f71eedd3c4b0392b994106343";
const HELLO_TOKEN_OWNER_CAP_ID = "0x234c95f8cd5bcab63e6c1bbd403363f0e155647b";

describe(" 2: Hello Token", () => {
  const provider = new JsonRpcProvider("http://localhost:9000", {
    faucetURL: "http://localhost:9123/gas",
  });
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

  const localVariables: any = {};

  before("Airdrop", async () => {
    // Just in case we add more keypairs to the test...
  });

  describe("Setup", () => {
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

        // Call `owner::create_state` on HelloToken
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

        // Call `owner::create_state` on HelloToken
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

        // Call `owner::create_state` on HelloToken
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

        // Call `owner::create_state` on HelloToken
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

        // Call `owner::create_state` on HelloToken
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

        // Fetch state info
        const helloTokenDynamicObjectField = await provider
          .getDynamicFields(stateId)
          .then((result) => result.data);
        expect(helloTokenDynamicObjectField).has.length(1);

        const registeredContracts = await getTableFromDynamicObjectField(
          provider,
          stateId,
          helloTokenDynamicObjectField[0].name!
        );
        expect(registeredContracts).has.length(1);

        // Verify state changes
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

      // Call `owner::update_relayer_fee` on HelloToken
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

      // Fetch state info
      const helloTokenState = await getObjectFields(provider, stateId);
      expect(helloTokenState.relayer_fee.fields.precision).to.equal(
        relayerFeePrecision
      );
      expect(helloTokenState.relayer_fee.fields.value).to.equal(relayerFee);
    });
  });

  describe("Send Tokens With Payload", () => {
    const targetChain = "2";
    const targetRecipient = Buffer.alloc(32, "deadbeef");

    describe("Finally Send Tokens With Payload", () => {
      it("transfer::send_tokens_with_payload With Coin 8", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Create wallet.
        const walletAddress = await wallet.getAddress();

        // `splitCoin` requires a number even though amounts can be u64, so it
        // seems that the max amount we can split by is u32. FYI
        const amount = "10";

        // Fetch sui coins to pay the wormhole fee.
        const wormholeFeeCoin = await getWormholeFeeCoins(provider, wallet);

        // Grab balance.
        const [transferCoin] = await provider
          .getCoins(walletAddress, COIN_8_TYPE)
          .then((result) => result.data);

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

        // Fetch the coin balance before transferring.
        const coinBalanceBefore = await provider.getBalance(
          walletAddress!,
          COIN_8_TYPE
        );

        // Send a transfer.
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
              targetChain,
              "0", // batchId
              Array.from(targetRecipient),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(sendWithPayloadTx).is.not.null;

        // Fetch the Wormhole messsage
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

        // Verify transfer payload.
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
        expect(transferPayload.targetChain).to.equal(Number(targetChain));

        // Fetch the coin balance after doing the transfer.
        const coinBalanceAfter = await provider.getBalance(
          walletAddress,
          COIN_8_TYPE
        );
        expect(
          coinBalanceBefore.totalBalance - coinBalanceAfter.totalBalance
        ).eq(parseInt(amount));
      });

      it("transfer::send_tokens_with_payload With Coin 9", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Create wallet.
        const walletAddress = await wallet.getAddress();

        // `splitCoin` requires a number even though amounts can be u64, so it
        // seems that the max amount we can split by is u32. FYI
        const amount = "101";

        // Fetch sui coins to pay the wormhole fee.
        const wormholeFeeCoin = await getWormholeFeeCoins(provider, wallet);

        // Grab balance.
        const [transferCoin] = await provider
          .getCoins(walletAddress, COIN_9_TYPE)
          .then((result) => result.data);

        // Fetch the coin metadata.
        const metadata = await provider.getCoinMetadata(COIN_9_TYPE);

        // Compute the normalized amount for data validation.
        const normalizedAmount = tokenBridgeNormalizeAmount(
          ethers.BigNumber.from(amount),
          metadata.decimals
        );

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

        // Fetch the coin balance before transferring.
        const coinBalanceBefore = await provider.getBalance(
          walletAddress!,
          COIN_9_TYPE
        );

        // Send a transfer.
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
              targetChain,
              "0", // batchId
              Array.from(targetRecipient),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(sendWithPayloadTx).is.not.null;

        // Fetch the Wormhole messsage
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

        // Verify transfer payload.
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
        expect(transferPayload.targetChain).to.equal(Number(targetChain));

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

      it("transfer::send_tokens_with_payload With Wrapped Eth", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Create wallet.
        const walletAddress = await wallet.getAddress();

        // `splitCoin` requires a number even though amounts can be u64, so it
        // seems that the max amount we can split by is u32. FYI
        const amount = "69";

        // Fetch sui coins to pay the wormhole fee.
        const wormholeFeeCoin = await getWormholeFeeCoins(provider, wallet);

        // Grab balance.
        const coins = await provider
          .getCoins(walletAddress, WRAPPED_WETH_COIN_TYPE)
          .then((result) => result.data);
        const nonzeroCoin = coins.find((coin) => coin.balance > 0);
        expect(nonzeroCoin!.balance > parseInt(amount)).is.true;

        // Split coin into another object.
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

        // Send a transfer.
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
              targetChain,
              "0", // batchId
              Array.from(targetRecipient),
            ],
            gasBudget: 20000,
          })
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(sendWithPayloadTx).is.not.null;

        // Fetch the Wormhole messsage
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

        // Verify transfer payload.
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
        expect(transferPayload.targetChain).to.equal(Number(targetChain));

        // Fetch the coin balance after doing the transfer.
        const coinBalanceAfter = await provider.getBalance(
          walletAddress,
          WRAPPED_WETH_COIN_TYPE
        );
        expect(
          coinBalanceBefore.totalBalance - coinBalanceAfter.totalBalance
        ).eq(parseInt(amount));
      });
    });
  });
});
