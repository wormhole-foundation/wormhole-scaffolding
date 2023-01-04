import { expect } from "chai";
import * as web3 from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as wormhole from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  getTokenBridgeDerivedAccounts,
  NodeWallet,
  postVaaSolana,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  parseTokenTransferPayload,
  parseTokenTransferVaa,
  tryNativeToHexString,
} from "@certusone/wormhole-sdk";
import {
  createInitializeInstruction,
  createRegisterForeignContractInstruction,
  createSendNativeTokensWithPayloadInstruction,
  getSenderConfigData,
  getForeignContractData,
  deriveTmpTokenAccountKey,
  deriveTokenTransferMessageKey,
  getRedeemerConfigData,
  createHelloTokenProgramInterface,
  deriveSenderConfigKey,
  deriveForeignContractKey,
  createRedeemNativeTransferWithPayloadInstruction,
  createSendWrappedTokensWithPayloadInstruction,
  createRedeemWrappedTransferWithPayloadInstruction,
  createUpdateRelayerFeeInstruction,
  getCompleteTransferNativeWithPayloadCpiAccounts,
  deriveRedeemerConfigKey,
  getCompleteTransferWrappedWithPayloadCpiAccounts,
} from "../sdk/02_hello_token";
import {
  ETHEREUM_TOKEN_BRIDGE_ADDRESS,
  GUARDIAN_PRIVATE_KEY,
  HELLO_TOKEN_ADDRESS,
  LOCALHOST,
  MINT_WITH_DECIMALS_9,
  PAYER_PRIVATE_KEY,
  TOKEN_BRIDGE_ADDRESS,
  WORMHOLE_ADDRESS,
  deriveMaliciousTokenBridgeEndpointKey,
  errorExistsInLog,
  RELAYER_PRIVATE_KEY,
  WETH_ADDRESS,
  MINT_WITH_DECIMALS_8,
} from "./helpers";
import { deriveWrappedMintKey } from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";

describe(" 2: Hello Token", () => {
  const connection = new web3.Connection(LOCALHOST, "processed");
  const wallet = NodeWallet.fromSecretKey(PAYER_PRIVATE_KEY);
  const relayer = NodeWallet.fromSecretKey(RELAYER_PRIVATE_KEY);

  // foreign contract info
  const foreignChain = 2;
  const foreignContractAddress = Buffer.alloc(32, "deadbeef", "hex");

  // foreign token bridge
  const ethereumTokenBridge = new mock.MockEthereumTokenBridge(
    ETHEREUM_TOKEN_BRIDGE_ADDRESS,
    200
  );

  // guardians
  const guardians = new mock.MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);

  describe("Initialize Program", () => {
    describe("Expect Failure", () => {
      it("Cannot Initialize With relayer_fee_precision == 0", async () => {
        const relayerFee = 0;
        const relayerFeePrecision = 0;
        expect(relayerFeePrecision).to.equal(0);

        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          relayerFee,
          relayerFeePrecision
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRelayerFee")).is.true;
            return null;
          });
        expect(initializeTx).is.null;
      });

      it("Cannot Initialize With relayer_fee > relayer_fee_precision", async () => {
        const relayerFee = 100_000_000;
        const relayerFeePrecision = 1_000_000;
        expect(relayerFee).is.greaterThan(relayerFeePrecision);

        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          relayerFee,
          relayerFeePrecision
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRelayerFee")).is.true;
            return null;
          });
        expect(initializeTx).is.null;
      });
    });

    describe("Finally Set Up Program", () => {
      it("Instruction: initialize", async () => {
        // we are configuring the relayer fee to be 1%, so that means the
        // relayer fee precision must be 100x the relayer fee.
        // Note: This will be overwritten later when update_relayer_fee
        // instruction is called.
        const relayerFee = 1_000_000;
        const relayerFeePrecision = 100_000_000;
        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          relayerFee,
          relayerFeePrecision
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

        const redeemerConfigData = await getRedeemerConfigData(
          connection,
          HELLO_TOKEN_ADDRESS
        );
        expect(redeemerConfigData.owner.equals(wallet.key())).is.true;
        expect(redeemerConfigData.relayerFee).equals(relayerFee);
        expect(redeemerConfigData.relayerFeePrecision).equals(
          relayerFeePrecision
        );
        expect(
          redeemerConfigData.tokenBridge.config.equals(
            tokenBridgeAccounts.tokenBridgeConfig
          )
        ).is.true;
        expect(
          redeemerConfigData.tokenBridge.custodySigner.equals(
            tokenBridgeAccounts.tokenBridgeCustodySigner
          )
        ).is.true;
        expect(
          redeemerConfigData.tokenBridge.mintAuthority.equals(
            tokenBridgeAccounts.tokenBridgeMintAuthority
          )
        ).is.true;
      });

      it("Cannot Call Instruction Again: initialize", async () => {
        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          0, // relayerFee
          1 // relayerFeePrecision
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

  describe("Update Relayer Fee", () => {
    describe("Expect Failure", () => {
      it("Cannot Update as Non-Owner", async () => {
        const relayerFee = 69;
        const relayerFeePrecision = 420;

        const updateRelayerFeeTx = await createUpdateRelayerFeeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          relayer.key(),
          relayerFee,
          relayerFeePrecision
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [relayer.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "OwnerOnly")).is.true;
            return null;
          });
        expect(updateRelayerFeeTx).is.null;
      });

      it("Cannot Update With relayer_fee_precision == 0", async () => {
        const relayerFee = 0;
        const relayerFeePrecision = 0;
        expect(relayerFeePrecision).to.equal(0);

        const updateRelayerFeeTx = await createUpdateRelayerFeeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          relayerFee,
          relayerFeePrecision
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRelayerFee")).is.true;
            return null;
          });
        expect(updateRelayerFeeTx).is.null;
      });

      it("Cannot Update With relayer_fee > relayer_fee_precision", async () => {
        const relayerFee = 100_000_000;
        const relayerFeePrecision = 1_000_000;
        expect(relayerFee).is.greaterThan(relayerFeePrecision);
        const updateRelayerFeeTx = await createUpdateRelayerFeeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          relayerFee,
          relayerFeePrecision
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRelayerFee")).is.true;
            return null;
          });
        expect(updateRelayerFeeTx).is.null;
      });
    });

    describe("Finally Update Relayer Fee", () => {
      it("Instruction: update_relayer_fee", async () => {
        // we are configuring the relayer fee to be 0.1%, so that means the
        // relayer fee precision must be 1000x the relayer fee
        const relayerFee = 100_000;
        const relayerFeePrecision = 100_000_000;
        const updateRelayerFeeTx = await createUpdateRelayerFeeInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          relayerFee,
          relayerFeePrecision
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
        expect(updateRelayerFeeTx).is.not.null;

        const redeemerConfigData = await getRedeemerConfigData(
          connection,
          HELLO_TOKEN_ADDRESS
        );
        expect(redeemerConfigData.relayerFee).equals(relayerFee);
        expect(redeemerConfigData.relayerFeePrecision).equals(
          relayerFeePrecision
        );
      });
    });
  });

  describe("Register Foreign Emitter", () => {
    describe("Expect Failure", () => {
      it("Cannot Update as Non-Owner", async () => {
        const chain = foreignChain;
        const contractAddress = Buffer.alloc(32, "fbadc0de", "hex");

        const registerForeignEmitterTx =
          await createRegisterForeignContractInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            chain,
            contractAddress,
            ETHEREUM_TOKEN_BRIDGE_ADDRESS
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "OwnerOnly")).is.true;
              return null;
            });
        expect(registerForeignEmitterTx).is.null;
      });

      it("Cannot Register Chain ID == 0", async () => {
        const bogusChain = 0;
        const registerForeignEmitterTx = await createHelloTokenProgramInterface(
          connection,
          HELLO_TOKEN_ADDRESS
        )
          .methods.registerForeignContract(bogusChain, [
            ...foreignContractAddress,
          ])
          .accounts({
            owner: wallet.key(),
            config: deriveSenderConfigKey(HELLO_TOKEN_ADDRESS),
            foreignContract: deriveForeignContractKey(
              HELLO_TOKEN_ADDRESS,
              bogusChain
            ),
            tokenBridgeForeignEndpoint: deriveMaliciousTokenBridgeEndpointKey(
              TOKEN_BRIDGE_ADDRESS,
              bogusChain,
              Buffer.alloc(32)
            ),
            tokenBridgeProgram: new web3.PublicKey(TOKEN_BRIDGE_ADDRESS),
          })
          .instruction()
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidForeignContract")).is.true;
            return null;
          });
        expect(registerForeignEmitterTx).is.null;
      });

      it("Cannot Register Chain ID == 1", async () => {
        const bogusChain = 1;
        const registerForeignEmitterTx = await createHelloTokenProgramInterface(
          connection,
          HELLO_TOKEN_ADDRESS
        )
          .methods.registerForeignContract(bogusChain, [
            ...foreignContractAddress,
          ])
          .accounts({
            owner: wallet.key(),
            config: deriveSenderConfigKey(HELLO_TOKEN_ADDRESS),
            foreignContract: deriveForeignContractKey(
              HELLO_TOKEN_ADDRESS,
              bogusChain
            ),
            tokenBridgeForeignEndpoint: deriveMaliciousTokenBridgeEndpointKey(
              TOKEN_BRIDGE_ADDRESS,
              bogusChain,
              Buffer.alloc(32)
            ),
            tokenBridgeProgram: new web3.PublicKey(TOKEN_BRIDGE_ADDRESS),
          })
          .instruction()
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [wallet.signer()]
            )
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidForeignContract")).is.true;
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
            TOKEN_BRIDGE_ADDRESS,
            foreignChain,
            Buffer.alloc(32), // contractAddress
            ETHEREUM_TOKEN_BRIDGE_ADDRESS
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidForeignContract")).is
                .true;
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
            TOKEN_BRIDGE_ADDRESS,
            foreignChain,
            Buffer.alloc(31, "deadbeef", "hex"), // contractAddress
            ETHEREUM_TOKEN_BRIDGE_ADDRESS
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InstructionDidNotDeserialize"))
                .is.true;
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
            TOKEN_BRIDGE_ADDRESS,
            chain,
            contractAddress,
            ETHEREUM_TOKEN_BRIDGE_ADDRESS
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
            TOKEN_BRIDGE_ADDRESS,
            chain,
            contractAddress,
            ETHEREUM_TOKEN_BRIDGE_ADDRESS
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

  describe("Send Native Tokens (decimals=9) With Payload", () => {
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
          MINT_WITH_DECIMALS_9,
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
            expect(errorExistsInLog(reason, "AccountNotInitialized")).is.true;
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
          MINT_WITH_DECIMALS_9,
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
            expect(errorExistsInLog(reason, "ZeroBridgeAmount")).is.true;
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
          MINT_WITH_DECIMALS_9,
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
            expect(
              errorExistsInLog(
                reason,
                "AnchorError caused by account: foreign_contract. Error Code: AccountNotInitialized"
              )
            ).is.true;
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
          MINT_WITH_DECIMALS_9,
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
            expect(
              errorExistsInLog(
                reason,
                "AnchorError caused by account: foreign_contract. Error Code: AccountNotInitialized"
              )
            ).is.true;
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
          MINT_WITH_DECIMALS_9,
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
            expect(errorExistsInLog(reason, "InvalidRecipient")).is.true;
            return null;
          });
        expect(sendTokensTx).is.null;
      });
    });

    describe("Finally Send Tokens With Payload", () => {
      it("Instruction: send_native_tokens_with_payload", async () => {
        const tokenAccount = getAssociatedTokenAddressSync(
          MINT_WITH_DECIMALS_9,
          wallet.key()
        );

        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // save message count to grab posted message later
        const sequence = await wormhole
          .getProgramSequenceTracker(
            connection,
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS
          )
          .then((sequenceTracker) => sequenceTracker.value() + 1n);

        const batchId = 69;
        const amount = 2n * 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const recipientChain = 2;
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT_WITH_DECIMALS_9,
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
          MINT_WITH_DECIMALS_9
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;

        // verify wormhole message
        const payload = await wormhole
          .getPostedMessage(
            connection,
            deriveTokenTransferMessageKey(HELLO_TOKEN_ADDRESS, sequence)
          )
          .then(
            (posted) =>
              parseTokenTransferPayload(posted.message.payload)
                .tokenTransferPayload
          );

        expect(payload.readUint8(0)).to.equal(1); // payload ID
        expect(
          Buffer.compare(payload.subarray(1, 33), recipientAddress)
        ).to.equal(0);
      });
    });
  });

  describe("Receive Native Tokens (decimals=9) With Payload (payer == recipient)", () => {
    const tokenAccount = getAssociatedTokenAddressSync(
      MINT_WITH_DECIMALS_9,
      wallet.key()
    );

    const tokenAddress = MINT_WITH_DECIMALS_9.toBuffer().toString("hex");
    const amount = 42060n;
    const tokenTransferPayload = (() => {
      const buf = Buffer.alloc(33);
      buf.writeUInt8(1, 0); // payload ID
      buf.write(wallet.key().toBuffer().toString("hex"), 1, "hex");
      return buf;
    })();
    const batchId = 69;

    describe("Expect Failure", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        1, // tokenChain
        amount / 10n,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        Buffer.alloc(32, "deafbeef", "hex"),
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          wallet.signTransaction,
          WORMHOLE_ADDRESS,
          wallet.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem From Unregistered Foreign Contract", async () => {
        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidForeignContract")).is
                .true;
              return null;
            });
        expect(redeemTransferTx).is.null;
      });
    });

    describe("Finally Receive Tokens With Payload", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        1, // tokenChain
        amount / 10n,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        foreignContractAddress,
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          wallet.signTransaction,
          WORMHOLE_ADDRESS,
          wallet.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem With Bogus Token Account", async () => {
        const bogusTokenAccount = getAssociatedTokenAddressSync(
          MINT_WITH_DECIMALS_9,
          relayer.key()
        );

        const maliciousInstruction = await (async () => {
          const program = createHelloTokenProgramInterface(
            connection,
            HELLO_TOKEN_ADDRESS
          );

          const parsed = parseTokenTransferVaa(signedWormholeMessage);

          const mint = new web3.PublicKey(parsed.tokenAddress);

          const tmpTokenAccount = deriveTmpTokenAccountKey(
            HELLO_TOKEN_ADDRESS,
            mint
          );
          const tokenBridgeAccounts =
            getCompleteTransferNativeWithPayloadCpiAccounts(
              TOKEN_BRIDGE_ADDRESS,
              WORMHOLE_ADDRESS,
              relayer.key(),
              parsed,
              tmpTokenAccount
            );

          return program.methods
            .redeemNativeTransferWithPayload([...parsed.hash])
            .accounts({
              config: deriveRedeemerConfigKey(HELLO_TOKEN_ADDRESS),
              foreignContract: deriveForeignContractKey(
                HELLO_TOKEN_ADDRESS,
                parsed.emitterChain
              ),
              tmpTokenAccount,
              recipientTokenAccount: bogusTokenAccount,
              recipient: relayer.key(),
              payerTokenAccount: getAssociatedTokenAddressSync(
                mint,
                relayer.key()
              ),
              tokenBridgeProgram: TOKEN_BRIDGE_ADDRESS,
              ...tokenBridgeAccounts,
            })
            .instruction();
        })();

        const redeemTransferTx = await web3
          .sendAndConfirmTransaction(
            connection,
            new web3.Transaction().add(maliciousInstruction),
            [relayer.signer()]
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRecipient")).is.true;
            return null;
          });
        expect(redeemTransferTx).is.null;
      });

      it("Instruction: redeem_native_transfer_with_payload", async () => {
        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
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
        expect(redeemTransferTx).is.not.null;

        const walletBalanceAfter = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // check balance change
        expect(walletBalanceAfter - walletBalanceBefore).to.equal(amount);

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          MINT_WITH_DECIMALS_9
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;
      });

      it("Cannot Redeem Transfer Again", async () => {
        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "AlreadyRedeemed")).is.true;
              return null;
            });
        expect(redeemTransferTx).is.null;
      });
    });
  });

  describe("Receive Native Tokens (decimals=9) With Payload (payer != recipient)", () => {
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      MINT_WITH_DECIMALS_9,
      wallet.key()
    );
    const relayerTokenAccount = getAssociatedTokenAddressSync(
      MINT_WITH_DECIMALS_9,
      relayer.key()
    );

    const tokenAddress = MINT_WITH_DECIMALS_9.toBuffer().toString("hex");
    const amount = 42060n;
    const tokenTransferPayload = (() => {
      const buf = Buffer.alloc(33);
      buf.writeUInt8(1, 0); // payload ID
      buf.write(wallet.key().toBuffer().toString("hex"), 1, "hex");
      return buf;
    })();
    const batchId = 69;

    describe("Expect Failure", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        1, // tokenChain
        amount / 10n,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        Buffer.alloc(32, "deafbeef", "hex"),
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          relayer.signTransaction,
          WORMHOLE_ADDRESS,
          relayer.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem From Unregistered Foreign Contract", async () => {
        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidForeignContract")).is
                .true;
              return null;
            });
        expect(redeemTransferTx).is.null;
      });
    });

    describe("Finally Receive Tokens With Payload", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        1, // tokenChain
        amount / 10n,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        foreignContractAddress,
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          relayer.signTransaction,
          WORMHOLE_ADDRESS,
          relayer.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem With Bogus Token Account", async () => {
        const bogusTokenAccount = getAssociatedTokenAddressSync(
          MINT_WITH_DECIMALS_9,
          relayer.key()
        );

        const maliciousInstruction = await (async () => {
          const program = createHelloTokenProgramInterface(
            connection,
            HELLO_TOKEN_ADDRESS
          );

          const parsed = parseTokenTransferVaa(signedWormholeMessage);

          const mint = new web3.PublicKey(parsed.tokenAddress);

          const tmpTokenAccount = deriveTmpTokenAccountKey(
            HELLO_TOKEN_ADDRESS,
            mint
          );
          const tokenBridgeAccounts =
            getCompleteTransferNativeWithPayloadCpiAccounts(
              TOKEN_BRIDGE_ADDRESS,
              WORMHOLE_ADDRESS,
              relayer.key(),
              parsed,
              tmpTokenAccount
            );

          return program.methods
            .redeemNativeTransferWithPayload([...parsed.hash])
            .accounts({
              config: deriveRedeemerConfigKey(HELLO_TOKEN_ADDRESS),
              foreignContract: deriveForeignContractKey(
                HELLO_TOKEN_ADDRESS,
                parsed.emitterChain
              ),
              tmpTokenAccount,
              recipientTokenAccount: bogusTokenAccount,
              recipient: new web3.PublicKey(
                parsed.tokenTransferPayload.subarray(1, 33)
              ),
              payerTokenAccount: getAssociatedTokenAddressSync(
                mint,
                relayer.key()
              ),
              tokenBridgeProgram: TOKEN_BRIDGE_ADDRESS,
              ...tokenBridgeAccounts,
            })
            .instruction();
        })();

        const redeemTransferTx = await web3
          .sendAndConfirmTransaction(
            connection,
            new web3.Transaction().add(maliciousInstruction),
            [relayer.signer()]
          )
          .catch((reason) => {
            expect(
              errorExistsInLog(
                reason,
                "recipient_token_account. Error Code: ConstraintTokenOwner"
              )
            ).is.true;
            return null;
          });
        expect(redeemTransferTx).is.null;
      });

      it("Instruction: redeem_native_transfer_with_payload", async () => {
        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          recipientTokenAccount
        ).then((account) => account.amount);
        const relayerBalanceBefore = await getAccount(
          connection,
          relayerTokenAccount
        ).then((account) => account.amount);

        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              // should not happen
              console.log(reason);
              return null;
            });
        expect(redeemTransferTx).is.not.null;

        const walletBalanceAfter = await getAccount(
          connection,
          recipientTokenAccount
        ).then((account) => account.amount);
        const relayerBalanceAfter = await getAccount(
          connection,
          relayerTokenAccount
        ).then((account) => account.amount);

        // check balance change
        const { relayerFee, relayerFeePrecision } = await getRedeemerConfigData(
          connection,
          HELLO_TOKEN_ADDRESS
        );
        const relayerAmount =
          (BigInt(relayerFee) * amount) / BigInt(relayerFeePrecision);
        expect(relayerBalanceAfter - relayerBalanceBefore).to.equal(
          relayerAmount
        );
        expect(walletBalanceAfter - walletBalanceBefore).to.equal(
          amount - relayerAmount
        );

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          MINT_WITH_DECIMALS_9
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;
      });

      it("Cannot Redeem Transfer Again", async () => {
        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "AlreadyRedeemed")).is.true;
              return null;
            });
        expect(redeemTransferTx).is.null;
      });
    });
  });

  describe("Send Native Tokens (decimals=8) With Payload", () => {
    describe("Finally Send Tokens With Payload", () => {
      it("Instruction: send_native_tokens_with_payload", async () => {
        const tokenAccount = getAssociatedTokenAddressSync(
          MINT_WITH_DECIMALS_8,
          wallet.key()
        );

        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // save message count to grab posted message later
        const sequence = await wormhole
          .getProgramSequenceTracker(
            connection,
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS
          )
          .then((sequenceTracker) => sequenceTracker.value() + 1n);

        const batchId = 69;
        const amount = 2n * 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const recipientChain = 2;
        const sendTokensTx = await createSendNativeTokensWithPayloadInstruction(
          connection,
          HELLO_TOKEN_ADDRESS,
          wallet.key(),
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS,
          MINT_WITH_DECIMALS_8,
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
        expect(walletBalanceBefore - walletBalanceAfter).to.equal(amount);

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          MINT_WITH_DECIMALS_8
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;

        // verify wormhole message
        const payload = await wormhole
          .getPostedMessage(
            connection,
            deriveTokenTransferMessageKey(HELLO_TOKEN_ADDRESS, sequence)
          )
          .then(
            (posted) =>
              parseTokenTransferPayload(posted.message.payload)
                .tokenTransferPayload
          );

        expect(payload.readUint8(0)).to.equal(1); // payload ID
        expect(
          Buffer.compare(payload.subarray(1, 33), recipientAddress)
        ).to.equal(0);
      });
    });
  });

  describe("Receive Native Tokens (decimals=8) With Payload (payer == recipient)", () => {
    const tokenAccount = getAssociatedTokenAddressSync(
      MINT_WITH_DECIMALS_8,
      wallet.key()
    );

    const tokenAddress = MINT_WITH_DECIMALS_8.toBuffer().toString("hex");
    const amount = 42069n;
    const tokenTransferPayload = (() => {
      const buf = Buffer.alloc(33);
      buf.writeUInt8(1, 0); // payload ID
      buf.write(wallet.key().toBuffer().toString("hex"), 1, "hex");
      return buf;
    })();
    const batchId = 69;

    describe("Finally Receive Tokens With Payload", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        1, // tokenChain
        amount,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        foreignContractAddress,
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          wallet.signTransaction,
          WORMHOLE_ADDRESS,
          wallet.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Instruction: redeem_native_transfer_with_payload", async () => {
        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
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
        expect(redeemTransferTx).is.not.null;

        const walletBalanceAfter = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // check balance change
        expect(walletBalanceAfter - walletBalanceBefore).to.equal(amount);

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          MINT_WITH_DECIMALS_8
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;
      });
    });
  });

  describe("Receive Native Tokens (decimals=8) With Payload (payer != recipient)", () => {
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      MINT_WITH_DECIMALS_8,
      wallet.key()
    );
    const relayerTokenAccount = getAssociatedTokenAddressSync(
      MINT_WITH_DECIMALS_8,
      relayer.key()
    );

    const tokenAddress = MINT_WITH_DECIMALS_8.toBuffer().toString("hex");
    const amount = 42069n;
    const tokenTransferPayload = (() => {
      const buf = Buffer.alloc(33);
      buf.writeUInt8(1, 0); // payload ID
      buf.write(wallet.key().toBuffer().toString("hex"), 1, "hex");
      return buf;
    })();
    const batchId = 69;

    describe("Finally Receive Tokens With Payload", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        1, // tokenChain
        amount,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        foreignContractAddress,
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          relayer.signTransaction,
          WORMHOLE_ADDRESS,
          relayer.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Instruction: redeem_native_transfer_with_payload", async () => {
        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          recipientTokenAccount
        ).then((account) => account.amount);
        const relayerBalanceBefore = await getAccount(
          connection,
          relayerTokenAccount
        ).then((account) => account.amount);

        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              // should not happen
              console.log(reason);
              return null;
            });
        expect(redeemTransferTx).is.not.null;

        const walletBalanceAfter = await getAccount(
          connection,
          recipientTokenAccount
        ).then((account) => account.amount);
        const relayerBalanceAfter = await getAccount(
          connection,
          relayerTokenAccount
        ).then((account) => account.amount);

        // check balance change
        const { relayerFee, relayerFeePrecision } = await getRedeemerConfigData(
          connection,
          HELLO_TOKEN_ADDRESS
        );
        const relayerAmount =
          (BigInt(relayerFee) * amount) / BigInt(relayerFeePrecision);
        expect(relayerBalanceAfter - relayerBalanceBefore).to.equal(
          relayerAmount
        );
        expect(walletBalanceAfter - walletBalanceBefore).to.equal(
          amount - relayerAmount
        );

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          MINT_WITH_DECIMALS_8
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;
      });
    });
  });

  describe("Send Wrapped Tokens With Payload", () => {
    const tokenBridgeWethMint = deriveWrappedMintKey(
      TOKEN_BRIDGE_ADDRESS,
      2,
      WETH_ADDRESS
    );

    describe("Expect Failure", () => {
      it("Cannot Send To Unregistered Foreign Contract", async () => {
        const batchId = 69;
        const amount = 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const recipientChain = 6;
        const sendTokensTx =
          await createSendWrappedTokensWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            tokenBridgeWethMint,
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

      it("Cannot Send To Chain ID == 0", async () => {
        const batchId = 69;
        const amount = 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const sendTokensTx =
          await createSendWrappedTokensWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            tokenBridgeWethMint,
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
        const sendTokensTx =
          await createSendWrappedTokensWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            tokenBridgeWethMint,
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
        const sendTokensTx =
          await createSendWrappedTokensWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            tokenBridgeWethMint,
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
      it("Instruction: send_wrapped_tokens_with_payload", async () => {
        const tokenAccount = getAssociatedTokenAddressSync(
          tokenBridgeWethMint,
          wallet.key()
        );

        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // save message count to grab posted message later
        const sequence = await wormhole
          .getProgramSequenceTracker(
            connection,
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS
          )
          .then((sequenceTracker) => sequenceTracker.value() + 1n);

        const batchId = 69;
        const amount = 2n * 42069n;
        const recipientAddress = Buffer.alloc(32, "1337beef", "hex");
        const recipientChain = 2;
        const sendTokensTx =
          await createSendWrappedTokensWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            tokenBridgeWethMint,
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
        expect(walletBalanceBefore - walletBalanceAfter).to.equal(amount);

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          tokenBridgeWethMint
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;

        // verify wormhole message
        const payload = await wormhole
          .getPostedMessage(
            connection,
            deriveTokenTransferMessageKey(HELLO_TOKEN_ADDRESS, sequence)
          )
          .then(
            (posted) =>
              parseTokenTransferPayload(posted.message.payload)
                .tokenTransferPayload
          );

        expect(payload.readUint8(0)).to.equal(1); // payload ID
        expect(
          Buffer.compare(payload.subarray(1, 33), recipientAddress)
        ).to.equal(0);
      });
    });
  });

  describe("Receive Wrapped Tokens With Payload (payer == recipient)", () => {
    const tokenChain = 2;
    const tokenBridgeWethMint = deriveWrappedMintKey(
      TOKEN_BRIDGE_ADDRESS,
      tokenChain,
      WETH_ADDRESS
    );
    const tokenAccount = getAssociatedTokenAddressSync(
      tokenBridgeWethMint,
      wallet.key()
    );

    const tokenAddress = tryNativeToHexString(WETH_ADDRESS, "ethereum");
    const rawAmount = 420_690_000_000_000n;
    const amount = rawAmount / 10n ** (18n - 8n);
    const tokenTransferPayload = (() => {
      const buf = Buffer.alloc(33);
      buf.writeUInt8(1, 0); // payload ID
      buf.write(wallet.key().toBuffer().toString("hex"), 1, "hex");
      return buf;
    })();
    const batchId = 69;

    describe("Expect Failure", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        tokenChain,
        amount,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        Buffer.alloc(32, "deafbeef", "hex"),
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          relayer.signTransaction,
          WORMHOLE_ADDRESS,
          relayer.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem From Unregistered Foreign Contract", async () => {
        const redeemTransferTx =
          await createRedeemWrappedTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
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
        expect(redeemTransferTx).is.null;
      });
    });

    describe("Finally Receive Tokens With Payload", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        tokenChain,
        amount,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        foreignContractAddress,
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          wallet.signTransaction,
          WORMHOLE_ADDRESS,
          wallet.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem With Bogus Token Account", async () => {
        const bogusTokenAccount = getAssociatedTokenAddressSync(
          tokenBridgeWethMint,
          relayer.key()
        );

        const maliciousInstruction = await (async () => {
          const program = createHelloTokenProgramInterface(
            connection,
            HELLO_TOKEN_ADDRESS
          );

          const parsed = parseTokenTransferVaa(signedWormholeMessage);

          const wrappedMint = deriveWrappedMintKey(
            TOKEN_BRIDGE_ADDRESS,
            parsed.tokenChain,
            parsed.tokenAddress
          );
          const tmpTokenAccount = deriveTmpTokenAccountKey(
            HELLO_TOKEN_ADDRESS,
            wrappedMint
          );
          const tokenBridgeAccounts =
            getCompleteTransferWrappedWithPayloadCpiAccounts(
              TOKEN_BRIDGE_ADDRESS,
              WORMHOLE_ADDRESS,
              relayer.key(),
              parsed,
              tmpTokenAccount
            );

          return program.methods
            .redeemWrappedTransferWithPayload([...parsed.hash])
            .accounts({
              config: deriveRedeemerConfigKey(HELLO_TOKEN_ADDRESS),
              foreignContract: deriveForeignContractKey(
                HELLO_TOKEN_ADDRESS,
                parsed.emitterChain
              ),
              tmpTokenAccount,
              recipientTokenAccount: bogusTokenAccount,
              recipient: relayer.key(),
              payerTokenAccount: getAssociatedTokenAddressSync(
                wrappedMint,
                relayer.key()
              ),
              tokenBridgeProgram: TOKEN_BRIDGE_ADDRESS,
              ...tokenBridgeAccounts,
            })
            .instruction();
        })();

        const redeemTransferTx = await web3
          .sendAndConfirmTransaction(
            connection,
            new web3.Transaction().add(maliciousInstruction),
            [relayer.signer()]
          )
          .catch((reason) => {
            expect(errorExistsInLog(reason, "InvalidRecipient")).is.true;
            return null;
          });
        expect(redeemTransferTx).is.null;
      });

      it("Instruction: redeem_wrapped_transfer_with_payload", async () => {
        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        const redeemTransferTx =
          await createRedeemWrappedTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
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
        expect(redeemTransferTx).is.not.null;

        const walletBalanceAfter = await getAccount(
          connection,
          tokenAccount
        ).then((account) => account.amount);

        // check balance change
        expect(walletBalanceAfter - walletBalanceBefore).to.equal(amount);

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          tokenBridgeWethMint
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;
      });

      it("Cannot Redeem Transfer Again", async () => {
        const redeemTransferTx =
          await createRedeemNativeTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            wallet.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [wallet.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "AlreadyRedeemed"));
              return null;
            });
        expect(redeemTransferTx).is.null;
      });
    });
  });

  describe("Receive Wrapped Tokens With Payload (payer != recipient)", () => {
    const tokenChain = 2;
    const tokenBridgeWethMint = deriveWrappedMintKey(
      TOKEN_BRIDGE_ADDRESS,
      tokenChain,
      WETH_ADDRESS
    );
    const recipientTokenAccount = getAssociatedTokenAddressSync(
      tokenBridgeWethMint,
      wallet.key()
    );
    const relayerTokenAccount = getAssociatedTokenAddressSync(
      tokenBridgeWethMint,
      relayer.key()
    );

    const tokenAddress = tryNativeToHexString(WETH_ADDRESS, "ethereum");
    const rawAmount = 420_690_000_000_000n;
    const amount = rawAmount / 10n ** (18n - 8n);
    const tokenTransferPayload = (() => {
      const buf = Buffer.alloc(33);
      buf.writeUInt8(1, 0); // payload ID
      buf.write(wallet.key().toBuffer().toString("hex"), 1, "hex");
      return buf;
    })();
    const batchId = 69;

    describe("Expect Failure", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        tokenChain,
        amount,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        Buffer.alloc(32, "deafbeef", "hex"),
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          relayer.signTransaction,
          WORMHOLE_ADDRESS,
          relayer.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem From Unregistered Foreign Contract", async () => {
        const redeemTransferTx =
          await createRedeemWrappedTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidForeignContract"));
              return null;
            });
        expect(redeemTransferTx).is.null;
      });
    });

    describe("Finally Receive Tokens With Payload", () => {
      const published = ethereumTokenBridge.publishTransferTokensWithPayload(
        tokenAddress,
        tokenChain,
        amount,
        1, // recipientChain
        HELLO_TOKEN_ADDRESS.toBuffer().toString("hex"),
        foreignContractAddress,
        tokenTransferPayload,
        batchId
      );
      published[51] = 3;

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          relayer.signTransaction,
          WORMHOLE_ADDRESS,
          relayer.key(),
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Cannot Redeem With Bogus Token Account", async () => {
        const bogusTokenAccount = getAssociatedTokenAddressSync(
          tokenBridgeWethMint,
          relayer.key()
        );

        const maliciousInstruction = await (async () => {
          const program = createHelloTokenProgramInterface(
            connection,
            HELLO_TOKEN_ADDRESS
          );

          const parsed = parseTokenTransferVaa(signedWormholeMessage);

          const wrappedMint = deriveWrappedMintKey(
            TOKEN_BRIDGE_ADDRESS,
            parsed.tokenChain,
            parsed.tokenAddress
          );

          const tmpTokenAccount = deriveTmpTokenAccountKey(
            HELLO_TOKEN_ADDRESS,
            wrappedMint
          );
          const tokenBridgeAccounts =
            getCompleteTransferWrappedWithPayloadCpiAccounts(
              TOKEN_BRIDGE_ADDRESS,
              WORMHOLE_ADDRESS,
              relayer.key(),
              parsed,
              tmpTokenAccount
            );

          return program.methods
            .redeemWrappedTransferWithPayload([...parsed.hash])
            .accounts({
              config: deriveRedeemerConfigKey(HELLO_TOKEN_ADDRESS),
              foreignContract: deriveForeignContractKey(
                HELLO_TOKEN_ADDRESS,
                parsed.emitterChain
              ),
              tmpTokenAccount,
              recipientTokenAccount: bogusTokenAccount,
              recipient: new web3.PublicKey(
                parsed.tokenTransferPayload.subarray(1, 33)
              ),
              payerTokenAccount: getAssociatedTokenAddressSync(
                wrappedMint,
                relayer.key()
              ),
              tokenBridgeProgram: TOKEN_BRIDGE_ADDRESS,
              ...tokenBridgeAccounts,
            })
            .instruction();
        })();

        const redeemTransferTx = await web3
          .sendAndConfirmTransaction(
            connection,
            new web3.Transaction().add(maliciousInstruction),
            [relayer.signer()]
          )
          .catch((reason) => {
            expect(
              errorExistsInLog(
                reason,
                "recipient_token_account. Error Code: ConstraintTokenOwner"
              )
            ).is.true;
            return null;
          });
        expect(redeemTransferTx).is.null;
      });

      it("Instruction: redeem_wrapped_transfer_with_payload", async () => {
        // will be used for balance change later
        const walletBalanceBefore = await getAccount(
          connection,
          recipientTokenAccount
        ).then((account) => account.amount);
        const relayerBalanceBefore = await getAccount(
          connection,
          relayerTokenAccount
        ).then((account) => account.amount);

        const redeemTransferTx =
          await createRedeemWrappedTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              // should not happen
              console.log(reason);
              return null;
            });
        expect(redeemTransferTx).is.not.null;

        const walletBalanceAfter = await getAccount(
          connection,
          recipientTokenAccount
        ).then((account) => account.amount);
        const relayerBalanceAfter = await getAccount(
          connection,
          relayerTokenAccount
        ).then((account) => account.amount);

        // check balance change
        const { relayerFee, relayerFeePrecision } = await getRedeemerConfigData(
          connection,
          HELLO_TOKEN_ADDRESS
        );
        const relayerAmount =
          (BigInt(relayerFee) * amount) / BigInt(relayerFeePrecision);
        expect(relayerBalanceAfter - relayerBalanceBefore).to.equal(
          relayerAmount
        );
        expect(walletBalanceAfter - walletBalanceBefore).to.equal(
          amount - relayerAmount
        );

        // tmp_token_account should not exist
        const tmpTokenAccountKey = deriveTmpTokenAccountKey(
          HELLO_TOKEN_ADDRESS,
          tokenBridgeWethMint
        );
        const tmpTokenAccount = await getAccount(
          connection,
          tmpTokenAccountKey
        ).catch((reason) => null);
        expect(tmpTokenAccount).is.null;
      });

      it("Cannot Redeem Transfer Again", async () => {
        const redeemTransferTx =
          await createRedeemWrappedTransferWithPayloadInstruction(
            connection,
            HELLO_TOKEN_ADDRESS,
            relayer.key(),
            TOKEN_BRIDGE_ADDRESS,
            WORMHOLE_ADDRESS,
            signedWormholeMessage
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [relayer.signer()]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "AlreadyRedeemed"));
              return null;
            });
        expect(redeemTransferTx).is.null;
      });
    });
  });
});
