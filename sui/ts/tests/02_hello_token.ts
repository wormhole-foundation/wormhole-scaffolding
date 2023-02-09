import {expect} from "chai";
import * as path from "path";
import {ethers} from "ethers";
import {
  CHAIN_ID_SUI,
  tryNativeToHexString,
  tryNativeToUint8Array,
  parseTransferPayload,
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

const HELLO_TOKEN_ID = "0x00987c9daab9e24fd95d40fd9397c5786d164ff4";
const HELLO_TOKEN_OWNER_CAP_ID = "0x6aedd9e1ff1b005481940b88dd6f8b8b4dfae2b8";

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

  // for governance actions to modify programs
  const governance = new mock.GovernanceEmitter(GOVERNANCE_EMITTER_ID, 20);

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
      });
    });
  });

  describe("Send Tokens With Payload", () => {
    const targetChain = "2";
    const targetRecipient = Buffer.alloc(32, "deadbeef");

    describe("Finally Send Tokens With Payload", () => {
      it("transfer::send_tokens_with_payload with coin 8", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // Create wallet.
        const walletAddress = await wallet.getAddress();

        // `splitCoin` requires a number even though amounts can be u64, so it
        // seems that the max amount we can split by is u32. FYI
        const amount = "10";

        // SUI needed to pay wormhole fee if any.
        const [sui] = await provider
          .getCoins(walletAddress, "0x2::sui::SUI")
          .then((result) => result.data);

        // Finally here to check the state.
        const fields = await getObjectFields(provider, WORMHOLE_STATE_ID);

        // Split the Sui object based on the wormhole fee.
        const splitSuiCoin = await wallet
          .splitCoin({
            coinObjectId: sui.coinObjectId,
            splitAmounts: [Number(fields.message_fee)],
            gasBudget: 1000,
          })
          .then(async (tx) => {
            const created = await getCreatedFromTransaction(tx).then(
              (objects) => objects[0]
            );
            return "reference" in created ? created.reference.objectId : null;
          });
        expect(splitSuiCoin).is.not.null;

        // Grab balance.
        const [transferCoin] = await provider
          .getCoins(walletAddress, COIN_8_TYPE)
          .then((result) => result.data);

        // Fetch the coin metadata.
        const metadata = await provider.getCoinMetadata(COIN_8_TYPE);

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
              metadata.id!,
              splitSuiCoin!,
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
        expect(message.batchId).equals("0");

        // Check state.
        const helloTokenState = await getObjectFields(provider, stateId);
        expect(helloTokenState.emitter_cap.fields.sequence).equals("0");

        // Verify transfer payload.
        const transferPayload = await parseTransferPayload(message.payload);
        expect(transferPayload.amount.toString()).to.equal(amount);
        expect(
          transferPayload.originAddress.endsWith(
            helloTokenState.emitter_cap.fields.emitter
          )
        ).is.true;
        expect(transferPayload.originChain).to.equal(CHAIN_ID_SUI);
        expect(transferPayload.targetAddress).to.equal(
          Buffer.alloc(32, "deadbeef").toString("hex")
        );
        expect(transferPayload.targetChain).to.equal(Number(targetChain));
      });
    });
  });
});
