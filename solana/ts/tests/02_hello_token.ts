import { expect } from "chai";
import * as web3 from "@solana/web3.js";
import {
  deriveAddress,
  getTokenBridgeDerivedAccounts,
  getTransferNativeWithPayloadCpiAccounts,
  NodeWallet,
  postVaaSolana,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  MockEmitter,
  MockGuardians,
} from "@certusone/wormhole-sdk/lib/cjs/mock";
import { parseTokenTransferPayload, parseVaa } from "@certusone/wormhole-sdk";
import {
  createInitializeInstruction,
  createRegisterForeignContractInstruction,
  createSendNativeTokensWithPayloadInstruction,
  getSenderConfigData,
  getForeignContractData,
  deriveTmpTokenAccountKey,
  deriveTokenTransferMessageKey,
} from "../sdk/02_hello_token";
import {
  GUARDIAN_PRIVATE_KEY,
  HELLO_TOKEN_ADDRESS,
  LOCALHOST,
  MINT,
  PAYER_PRIVATE_KEY,
  TOKEN_BRIDGE_ADDRESS,
  WORMHOLE_ADDRESS,
} from "./helpers/consts";
import { errorExistsInLog } from "./helpers/error";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  getPostedMessage,
  getProgramSequenceTracker,
} from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";

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
        const senderConfigData = await getSenderConfigData(
          connection,
          HELLO_TOKEN_ADDRESS
        );
        expect(senderConfigData.owner.equals(wallet.key())).is.true;
        expect(senderConfigData.finality).to.equal(0);

        const tokenBridgeAccounts = getTokenBridgeDerivedAccounts(
          HELLO_TOKEN_ADDRESS,
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS
        );
        expect(
          senderConfigData.tokenBridge.config.equals(
            tokenBridgeAccounts.tokenBridgeConfig
          )
        ).is.true;
        expect(
          senderConfigData.tokenBridge.authoritySigner.equals(
            tokenBridgeAccounts.tokenBridgeAuthoritySigner
          )
        ).is.true;
        expect(
          senderConfigData.tokenBridge.custodySigner.equals(
            tokenBridgeAccounts.tokenBridgeCustodySigner
          )
        ).is.true;
        expect(
          senderConfigData.tokenBridge.wormholeBridge.equals(
            tokenBridgeAccounts.wormholeBridge
          )
        ).to.be.true;
        expect(
          senderConfigData.tokenBridge.emitter.equals(
            tokenBridgeAccounts.tokenBridgeEmitter
          )
        ).is.true;
        expect(
          senderConfigData.tokenBridge.wormholeFeeCollector.equals(
            tokenBridgeAccounts.wormholeFeeCollector
          )
        ).is.true;
        expect(
          senderConfigData.tokenBridge.sequence.equals(
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
      it("Cannot Register Chain ID == 0", async () => {
        const registerForeignEmitterTx =
          await createRegisterForeignContractInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            0, // chain
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

  describe("Send Tokens With Payload", () => {
    describe("Expect Failure", () => {
      it("Cannot Send To Unregistered Foreign Contract", async () => {
        const batchId = 69;
        const amount = 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const recipientChain = 6;
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT,
          {
            batchId,
            amount,
            recipientAddress,
            recipientChain,
          }
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "AccountNotInitialized"));
            return null;
          });
        expect(sendTokensTx).is.null;
      });

      it("Cannot Send Amount Less Than Bridgeable", async () => {
        const batchId = 69;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const recipientChain = 2;
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT,
          {
            batchId,
            amount: 9n,
            recipientAddress,
            recipientChain,
          }
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "ZeroBridgeAmount"));
            return null;
          });
        expect(sendTokensTx).is.null;
      });

      it("Cannot Send To Chain ID == 0", async () => {
        const batchId = 69;
        const amount = 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT,
          {
            batchId,
            amount,
            recipientAddress,
            recipientChain: 0,
          }
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRecipient"));
            return null;
          });
        expect(sendTokensTx).is.null;
      });

      it("Cannot Send To Chain ID == 1", async () => {
        const batchId = 69;
        const amount = 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT,
          {
            batchId,
            amount,
            recipientAddress,
            recipientChain: 1,
          }
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRecipient"));
            return null;
          });
        expect(sendTokensTx).is.null;
      });

      it("Cannot Send To Zero Address", async () => {
        const batchId = 69;
        const amount = 42069n;
        const recipientChain = 2;
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT,
          {
            batchId,
            amount,
            recipientAddress: Buffer.alloc(32),
            recipientChain,
          }
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRecipient"));
            return null;
          });
        expect(sendTokensTx).is.null;
      });
    });

    describe("Finally Send Tokens With Payload", () => {
      it("Instruction: send_native_tokens_with_payload", async () => {
        const tokenAccount = getAssociatedTokenAddressSync(MINT, wallet.key());

        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // save message count to grab posted message later
        const sequence = await getProgramSequenceTracker(
          connection,
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS
        ).then((sequenceTracker) => sequenceTracker.value() + 1n);

        const batchId = 69;
        const amount = 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const recipientChain = 2;
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT,
          {
            batchId,
            amount,
            recipientAddress,
            recipientChain,
          }
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
        expect(sendTokensTx).is.not.null;

        const walletBalanceAfter = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // check balance change
        expect(walletBalanceBefore - walletBalanceAfter).to.equal(
          (amount / 10n) * 10n
        );

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          MINT
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;

        // verify wormhole message
        const payload = await getPostedMessage(
          connection,
          deriveTokenTransferMessageKey(HELLO_TOKEN_ADDRESS, sequence)
        ).then(
          (posted) =>
            parseTokenTransferPayload(posted.message.payload)
              .tokenTransferPayload
        );

        expect(payload.readUint8(0)).to.equal(1); // payload ID
        expect(
          Buffer.compare(payload.subarray(1, 33), recipientAddress)
        ).to.equal(0);
        expect(payload.readUint32BE(33)).to.equal(0); // relayer fee
        expect(
          new web3.PublicKey(payload.subarray(37, 69)).equals(
            tmpTokenAccountKey
          )
        ).is.true;
      });
    });
  });
});
