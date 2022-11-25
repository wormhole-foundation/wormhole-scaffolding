import { expect } from "chai";
import * as web3 from "@solana/web3.js";
import {
  deriveAddress,
  getTokenBridgeDerivedAccounts,
  NodeWallet,
  postVaaSolana,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  MockEmitter,
  MockGuardians,
} from "@certusone/wormhole-sdk/lib/cjs/mock";
import { parseVaa } from "@certusone/wormhole-sdk";
import {
  createInitializeInstruction,
  createRegisterForeignContractInstruction,
  getConfigData,
  getForeignContractData,
} from "../sdk/02_hello_token";
import {
  GUARDIAN_PRIVATE_KEY,
  HELLO_TOKEN_ADDRESS,
  LOCALHOST,
  PAYER_PRIVATE_KEY,
  TOKEN_BRIDGE_ADDRESS,
  WORMHOLE_ADDRESS,
} from "./helpers/consts";
import { errorExistsInLog } from "./helpers/error";

describe(" 2: Hello Token", () => {
  const connection = new web3.Connection(LOCALHOST, "confirmed");
  const wallet = NodeWallet.fromSecretKey(PAYER_PRIVATE_KEY);

  // foreign emitter info
  const foreignChain = 2;
  const foreignContractAddress = Buffer.alloc(32, "deadbeef", "hex");

  describe("Initialize Program", () => {
    describe("Finally Set Up Program", () => {
      it("Instruction: initialize", async () => {
        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(initializeTx).is.not.null;

        // verify account data
        const configData = await getConfigData(connection, HELLO_TOKEN_ADDRESS);
        expect(configData.owner.equals(wallet.key())).is.true;
        expect(configData.finality).to.equal(0);

        const tokenBridgeAccounts = getTokenBridgeDerivedAccounts(
          HELLO_TOKEN_ADDRESS,
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS
        );
        expect(
          configData.tokenBridge.config.equals(
            tokenBridgeAccounts.tokenBridgeConfig
          )
        ).is.true;
        expect(
          configData.tokenBridge.authoritySigner.equals(
            tokenBridgeAccounts.tokenBridgeAuthoritySigner
          )
        ).is.true;
        expect(
          configData.tokenBridge.custodySigner.equals(
            tokenBridgeAccounts.tokenBridgeCustodySigner
          )
        ).is.true;
        expect(
          configData.tokenBridge.mintAuthority.equals(
            tokenBridgeAccounts.tokenBridgeMintAuthority
          )
        ).is.true;
        expect(
          configData.tokenBridge.sender.equals(
            tokenBridgeAccounts.tokenBridgeSender
          )
        ).is.true;
        expect(
          configData.tokenBridge.redeemer.equals(
            tokenBridgeAccounts.tokenBridgeRedeemer
          )
        ).is.true;
        expect(
          configData.wormhole.bridge.equals(tokenBridgeAccounts.wormholeBridge)
        ).to.be.true;
        expect(
          configData.tokenBridge.emitter.equals(
            tokenBridgeAccounts.tokenBridgeEmitter
          )
        ).is.true;
        expect(
          configData.wormhole.feeCollector.equals(
            tokenBridgeAccounts.wormholeFeeCollector
          )
        ).is.true;
        expect(
          configData.tokenBridge.sequence.equals(
            tokenBridgeAccounts.tokenBridgeSequence
          )
        ).is.true;

        // TODO
      });

      it("Cannot Call Instruction Again: initialize", async () => {
        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "already in use")).is.true;
            return null;
          });
        expect(initializeTx).is.null;
      });
    });
  });

  describe("Register Foreign Emitter", () => {
    describe("Expect Failure", () => {
      it("Cannot Register Chain ID == 1", async () => {
        const registerForeignEmitterTx =
          await createRegisterForeignContractInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            1, // chain
            foreignContractAddress
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidForeignContract"));
              return null;
            });
        expect(registerForeignEmitterTx).is.null;
      });

      it("Cannot Register Zero Address", async () => {
        const registerForeignEmitterTx =
          await createRegisterForeignContractInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            foreignChain,
            Buffer.alloc(32) // contractAddress
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidForeignContract"));
              return null;
            });
        expect(registerForeignEmitterTx).is.null;
      });

      it("Cannot Register Contract Address Length != 32", async () => {
        const registerForeignEmitterTx =
          await createRegisterForeignContractInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            foreignChain,
            Buffer.alloc(31, "deadbeef", "hex") // contractAddress
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InstructionDidNotDeserialize"));
              return null;
            });
        expect(registerForeignEmitterTx).is.null;
      });
    });

    describe("Finally Register Foreign Contract", () => {
      it("Instruction: register_foreign_contract", async () => {
        const chain = foreignChain;
        const contractAddress = Buffer.alloc(32, "fbadc0de", "hex");

        const registerForeignEmitterTx =
          await createRegisterForeignContractInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            chain,
            contractAddress
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              // should not happen
              console.log(reason);
              return null;
            });
        expect(registerForeignEmitterTx).is.not.null;

        // verify account data
        const foreignContractData = await getForeignContractData(
          connection,
          HELLO_TOKEN_ADDRESS,
          chain
        );
        expect(foreignContractData.chain).to.equal(chain);
        expect(
          Buffer.compare(contractAddress, foreignContractData.address)
        ).to.equal(0);
      });

      it("Call Instruction Again With Different Contract Address", async () => {
        const chain = foreignChain;
        const contractAddress = foreignContractAddress;

        const registerForeignEmitterTx =
          await createRegisterForeignContractInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            chain,
            contractAddress
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              // should not happen
              console.log(reason);
              return null;
            });
        expect(registerForeignEmitterTx).is.not.null;

        // verify account data
        const foreignContractData = await getForeignContractData(
          connection,
          HELLO_TOKEN_ADDRESS,
          chain
        );
        expect(foreignContractData.chain).to.equal(chain);
        expect(
          Buffer.compare(contractAddress, foreignContractData.address)
        ).to.equal(0);
      });
    });
  });
});
