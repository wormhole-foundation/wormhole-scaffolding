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

        // TODO: check state
      });
    });
  });

  describe("Send Tokens With Payload", () => {
    const targetChain = 2;
    const targetRecipient = Buffer.alloc(32, "deadbeef");

    describe("Finally Send Tokens With Payload", () => {
      it("transfer::send_tokens_with_payload", async () => {
        expect(localVariables.stateId).is.not.undefined;
        const stateId: string = localVariables.stateId;

        // TODO

        // // Call `owner::create_state` on HelloToken
        // const registerTx = await creator
        //   .executeMoveCall({
        //     packageObjectId: HELLO_TOKEN_ID,
        //     module: "owner",
        //     function: "register_foreign_contract",
        //     typeArguments: [],
        //     arguments: [
        //       HELLO_TOKEN_OWNER_CAP_ID,
        //       stateId,
        //       foreignChain,
        //       Array.from(foreignContractAddress),
        //     ],
        //     gasBudget: 20000,
        //   })
        //   .catch((reason) => {
        //     // should not happen
        //     console.log(reason);
        //     return null;
        //   });
        // expect(registerTx).is.not.null;

        // TODO: check state
      });
    });
  });
});
