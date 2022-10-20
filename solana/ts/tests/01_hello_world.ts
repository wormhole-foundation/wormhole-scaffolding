import { expect } from "chai";
import * as web3 from "@solana/web3.js";
import {
  deriveAddress,
  getPostMessageCpiAccounts,
  NodeWallet,
  postVaaSolana,
} from "@certusone/wormhole-sdk/solana";
import { getPostedMessage } from "@certusone/wormhole-sdk/solana/wormhole";
import { MockEmitter, MockGuardians } from "@certusone/wormhole-sdk/mock";
import { parseVaa } from "@certusone/wormhole-sdk";
import {
  createHelloWorldProgramInterface,
  createInitializeInstruction,
  createReceiveMessageInstruction,
  createRegisterForeignEmitterInstruction,
  createSendMessageInstruction,
  deriveConfigKey,
  deriveForeignEmitterKey,
  deriveWormholeMessageKey,
  getConfigData,
  getForeignEmitterData,
  getReceivedData,
} from "../sdk/01_hello_world";
import {
  FUZZ_TEST_ITERATIONS,
  GUARDIAN_PRIVATE_KEY,
  HELLO_WORLD_ADDRESS,
  LOCALHOST,
  PAYER_PRIVATE_KEY,
  WORMHOLE_ADDRESS,
} from "./helpers/consts";
import { errorExistsInLog } from "./helpers/error";

describe(" 1: Hello World", () => {
  const connection = new web3.Connection(LOCALHOST, "confirmed");
  const payer = web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);

  // program interface
  const program = createHelloWorldProgramInterface(
    connection,
    HELLO_WORLD_ADDRESS
  );

  // foreign emitter info
  const foreignEmitterChain = 2;
  const foreignEmitterAddress = Buffer.alloc(32, "deadbeef", "hex");

  // create real pdas and array of invalid ones (generated from other bumps)
  const realConfig = deriveConfigKey(program.programId);
  const invalidConfigs: web3.PublicKey[] = [];
  for (let i = 255; i >= 0; --i) {
    const bumpBytes = Buffer.alloc(1);
    bumpBytes.writeUint8(i);
    try {
      const pda = web3.PublicKey.createProgramAddressSync(
        [Buffer.from("hello_world.config"), bumpBytes],
        program.programId
      );
      if (!pda.equals(realConfig)) {
        invalidConfigs.push(pda);
      }
    } catch (reason) {
      // do nothing
    }
  }

  const realForeignEmitter = deriveForeignEmitterKey(
    program.programId,
    foreignEmitterChain
  );
  const invalidForeignEmitters: web3.PublicKey[] = [];
  for (let i = 255; i >= 0; --i) {
    const bumpBytes = Buffer.alloc(1);
    bumpBytes.writeUint8(i);
    try {
      const pda = web3.PublicKey.createProgramAddressSync(
        [
          Buffer.from("hello_world.foreign_emitter"),
          (() => {
            const buf = Buffer.alloc(2);
            buf.writeUInt16LE(foreignEmitterChain);
            return buf;
          })(),
          bumpBytes,
        ],
        program.programId
      );
      if (!pda.equals(realForeignEmitter)) {
        invalidForeignEmitters.push(pda);
      }
    } catch (reason) {
      // do nothing
    }
  }

  describe("Initialize Program", () => {
    describe("Fuzz Test Invalid Accounts for Instruction: initialize", () => {
      const wormholeCpi = getPostMessageCpiAccounts(
        program.programId,
        WORMHOLE_ADDRESS,
        payer.publicKey,
        web3.PublicKey.default // dummy for message
      );

      // TODO: use createProgramAddressSync to try different bumps for config
      // Also add for other config account injections
      it("Invalid Account: config", async () => {
        //for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
        for (const config of invalidConfigs) {
          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config,
              wormholeProgram: WORMHOLE_ADDRESS,
              wormholeConfig: wormholeCpi.wormholeConfig,
              wormholeFeeCollector: wormholeCpi.wormholeFeeCollector,
              wormholeEmitter: wormholeCpi.wormholeEmitter,
              wormholeSequence: wormholeCpi.wormholeSequence,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(
                  reason,
                  "Cross-program invocation with unauthorized signer or writable account"
                )
              ).is.true;
              return null;
            });
          expect(initializeTx).is.null;
        }
      });

      it("Invalid Account: wormhole_program", async () => {
        // First create invalid wormhole program and derive CPI PDAs
        // from this bogus address.
        {
          const wormholeProgram = web3.BPF_LOADER_PROGRAM_ID;
          const cpi = getPostMessageCpiAccounts(
            program.programId,
            wormholeProgram,
            payer.publicKey,
            web3.PublicKey.default // dummy for message
          );

          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              wormholeProgram,
              wormholeConfig: cpi.wormholeConfig,
              wormholeFeeCollector: cpi.wormholeFeeCollector,
              wormholeEmitter: cpi.wormholeEmitter,
              wormholeSequence: cpi.wormholeSequence,
            })
            .instruction()
            .then((ix) => {
              return web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              );
            })
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidWormholeProgram")).is
                .true;
              return null;
            });
          expect(initializeTx).is.null;
        }

        // Now just pass an invalid Wormhole program address
        // while passing in the correct PDAs.
        {
          const wormholeProgram = web3.Ed25519Program.programId;

          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              wormholeProgram,
              wormholeConfig: wormholeCpi.wormholeConfig,
              wormholeFeeCollector: wormholeCpi.wormholeFeeCollector,
              wormholeEmitter: wormholeCpi.wormholeEmitter,
              wormholeSequence: wormholeCpi.wormholeSequence,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidWormholeProgram")).to.be
                .true;
              return null;
            });
          expect(initializeTx).is.null;
        }
      });

      it("Invalid Account: wormhole_config", async () => {
        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const wormholeConfig = deriveAddress(
            [Buffer.from(`Bogus ${i}`)],
            web3.Keypair.generate().publicKey
          );

          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              wormholeProgram: WORMHOLE_ADDRESS,
              wormholeConfig,
              wormholeFeeCollector: wormholeCpi.wormholeFeeCollector,
              wormholeEmitter: wormholeCpi.wormholeEmitter,
              wormholeSequence: wormholeCpi.wormholeSequence,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(reason, "A seeds constraint was violated")
              ).is.true;
              return null;
            });
          expect(initializeTx).is.null;
        }
      });

      it("Invalid Account: wormhole_fee_collector", async () => {
        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const wormholeFeeCollector = deriveAddress(
            [Buffer.from(`Bogus ${i}`)],
            web3.Keypair.generate().publicKey
          );

          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              wormholeProgram: WORMHOLE_ADDRESS,
              wormholeConfig: wormholeCpi.wormholeConfig,
              wormholeFeeCollector,
              wormholeEmitter: wormholeCpi.wormholeEmitter,
              wormholeSequence: wormholeCpi.wormholeSequence,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(reason, "A seeds constraint was violated")
              ).is.true;
              return null;
            });
          expect(initializeTx).is.null;
        }
      });

      it("Invalid Account: wormhole_emitter", async () => {
        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const wormholeEmitter = deriveAddress(
            [Buffer.from(`Bogus ${i}`)],
            web3.Keypair.generate().publicKey
          );

          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              wormholeProgram: WORMHOLE_ADDRESS,
              wormholeConfig: wormholeCpi.wormholeConfig,
              wormholeFeeCollector: wormholeCpi.wormholeFeeCollector,
              wormholeEmitter,
              wormholeSequence: wormholeCpi.wormholeSequence,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(reason, "A seeds constraint was violated")
              ).is.true;
              return null;
            });
          expect(initializeTx).is.null;
        }
      });

      it("Invalid Account: wormhole_sequence", async () => {
        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const wormholeSequence = deriveAddress(
            [Buffer.from(`Bogus ${i}`)],
            web3.Keypair.generate().publicKey
          );

          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              wormholeProgram: WORMHOLE_ADDRESS,
              wormholeConfig: wormholeCpi.wormholeConfig,
              wormholeFeeCollector: wormholeCpi.wormholeFeeCollector,
              wormholeEmitter: wormholeCpi.wormholeSequence,
              wormholeSequence,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(reason, "A seeds constraint was violated")
              ).is.true;
              return null;
            });
          expect(initializeTx).is.null;
        }
      });
    });

    describe("Finally Set Up Program", () => {
      it("Instruction: initialize", async () => {
        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_WORLD_ADDRESS,
          payer.publicKey,
          WORMHOLE_ADDRESS
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [payer]
            )
          )
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(initializeTx).is.not.null;

        // verify account data
        const configData = await getConfigData(connection, program.programId);
        expect(configData.owner.equals(payer.publicKey)).is.true;

        const wormholeCpi = getPostMessageCpiAccounts(
          program.programId,
          WORMHOLE_ADDRESS,
          payer.publicKey,
          web3.PublicKey.default // dummy for message
        );
        expect(configData.wormhole.program.equals(WORMHOLE_ADDRESS)).is.true;
        expect(configData.wormhole.config.equals(wormholeCpi.wormholeConfig)).to
          .be.true;
        expect(
          configData.wormhole.feeCollector.equals(
            wormholeCpi.wormholeFeeCollector
          )
        ).is.true;
        expect(configData.wormhole.emitter.equals(wormholeCpi.wormholeEmitter))
          .is.true;
        expect(
          configData.wormhole.sequence.equals(wormholeCpi.wormholeSequence)
        ).is.true;

        expect(configData.bump).is.greaterThanOrEqual(0);
        expect(configData.bump).is.lessThanOrEqual(255);
        expect(configData.messageCount).to.equal(0n);
      });

      it("Cannot Call Instruction Again: initialize", async () => {
        const initializeTx = await createInitializeInstruction(
          connection,
          HELLO_WORLD_ADDRESS,
          payer.publicKey,
          WORMHOLE_ADDRESS
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [payer]
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
    describe("Fuzz Test Invalid Accounts for Instruction: register_foreign_emitter", () => {
      const emitterChain = foreignEmitterChain;
      const emitterAddress = foreignEmitterAddress;

      it("Invalid Account: owner", async () => {
        const nonOwners = [];

        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          nonOwners.push(web3.Keypair.generate());
        }

        // Airdrop funds for these a-holes
        await Promise.all(
          nonOwners.map(async (nonOwner) => {
            await connection
              .requestAirdrop(nonOwner.publicKey, 69 * web3.LAMPORTS_PER_SOL)
              .then((tx) => connection.confirmTransaction(tx));
          })
        );

        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const nonOwner = nonOwners[i];

          const registerForeignEmitterTx = await program.methods
            .registerForeignEmitter(emitterChain, [...emitterAddress])
            .accounts({
              owner: nonOwner.publicKey,
              config: realConfig,
              foreignEmitter: realForeignEmitter,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [nonOwner]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "PermissionDenied")).is.true;
              return null;
            });
          expect(registerForeignEmitterTx).is.null;
        }
      });

      it("Invalid Account: config", async () => {
        for (const config of invalidConfigs) {
          const registerForeignEmitterTx = await program.methods
            .registerForeignEmitter(emitterChain, [...emitterAddress])
            .accounts({
              owner: payer.publicKey,
              config,
              foreignEmitter: realForeignEmitter,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(
                  reason,
                  "The program expected this account to be already initialized"
                )
              ).is.true;
              return null;
            });
          expect(registerForeignEmitterTx).is.null;
        }
      });

      it("Invalid Account: foreign_emitter", async () => {
        // First pass completely bogus PDAs
        for (const foreignEmitter of invalidForeignEmitters) {
          const registerForeignEmitterTx = await program.methods
            .registerForeignEmitter(emitterChain, [...emitterAddress])
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              foreignEmitter,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(
                  reason,
                  "Cross-program invocation with unauthorized signer or writable account"
                )
              ).is.true;
              return null;
            });
          expect(registerForeignEmitterTx).is.null;
        }

        // Now try to pass PDAs that do not agree with chain from instruction data
        {
          const bogusEmitterChain = emitterChain + 1;

          const registerForeignEmitterTx = await program.methods
            .registerForeignEmitter(bogusEmitterChain, [...emitterAddress])
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              foreignEmitter: realForeignEmitter,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(
                  reason,
                  "Cross-program invocation with unauthorized signer or writable account"
                )
              ).is.true;
              return null;
            });
          expect(registerForeignEmitterTx).is.null;
        }

        // Now try to pass emitter address with length != 32 bytes
        {
          const bogusEmitterAddress = Buffer.alloc(20, "deadbeef", "hex");
          const registerForeignEmitterTx = await program.methods
            .registerForeignEmitter(emitterChain, [...bogusEmitterAddress])
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              foreignEmitter: realForeignEmitter,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(
                errorExistsInLog(
                  reason,
                  "The program could not deserialize the given instruction"
                )
              ).is.true;
              return null;
            });
          expect(registerForeignEmitterTx).is.null;
        }

        // Now try to pass zero emitter address
        {
          const bogusEmitterAddress = Buffer.alloc(32);
          const registerForeignEmitterTx = await program.methods
            .registerForeignEmitter(emitterChain, [...bogusEmitterAddress])
            .accounts({
              owner: payer.publicKey,
              config: realConfig,
              foreignEmitter: realForeignEmitter,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              expect(errorExistsInLog(reason, "InvalidForeignEmitter")).to.be
                .true;
              return null;
            });
          expect(registerForeignEmitterTx).is.null;
        }
      });
    });

    describe("Finally Register Foreign Emitter", () => {
      it("Instruction: register_foreign_emitter", async () => {
        const emitterChain = foreignEmitterChain;
        const emitterAddress = Buffer.alloc(32, "fbadc0de", "hex");

        const registerForeignEmitterTx =
          await createRegisterForeignEmitterInstruction(
            connection,
            program.programId,
            payer.publicKey,
            emitterChain,
            emitterAddress
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              // should not happen
              console.log(reason);
              return null;
            });
        expect(registerForeignEmitterTx).is.not.null;

        // verify account data
        const foreignEmitterData = await getForeignEmitterData(
          connection,
          program.programId,
          emitterChain
        );
        expect(foreignEmitterData.chain).to.equal(emitterChain);
        expect(
          Buffer.compare(emitterAddress, foreignEmitterData.address)
        ).to.equal(0);
      });

      it("Call Instruction Again With Different Emitter Address", async () => {
        const emitterChain = foreignEmitterChain;
        const emitterAddress = foreignEmitterAddress;

        const registerForeignEmitterTx =
          await createRegisterForeignEmitterInstruction(
            connection,
            program.programId,
            payer.publicKey,
            emitterChain,
            emitterAddress
          )
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => {
              // should not happen
              console.log(reason);
              return null;
            });
        expect(registerForeignEmitterTx).is.not.null;

        // verify account data
        const foreignEmitterData = await getForeignEmitterData(
          connection,
          program.programId,
          emitterChain
        );
        expect(foreignEmitterData.chain).to.equal(emitterChain);
        expect(
          Buffer.compare(emitterAddress, foreignEmitterData.address)
        ).to.equal(0);
      });
    });
  });

  describe("Send Message", () => {
    describe("Finally Send Message", () => {
      const batchId = 42069;
      const helloMessage = Buffer.from("All your base are belong to us");

      it("Instruction: send_message", async () => {
        // save message count to grab posted message later
        const messageCount = await getConfigData(
          connection,
          program.programId
        ).then((config) => config.messageCount);

        const sendMessageTx = await createSendMessageInstruction(
          connection,
          program.programId,
          payer.publicKey,
          WORMHOLE_ADDRESS,
          batchId,
          helloMessage
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [payer]
            )
          )
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(sendMessageTx).is.not.null;

        // verify account data
        const messageData = await getPostedMessage(
          connection,
          deriveWormholeMessageKey(program.programId, messageCount)
        ).then((posted) => posted.message);
        expect(messageData.nonce).to.equal(batchId);

        const payload = messageData.payload;
        expect(payload.readUint8(0)).to.equal(1); // payload ID
        expect(payload.readUint16BE(1)).to.equal(helloMessage.length);
        expect(Buffer.compare(payload.subarray(3), helloMessage)).to.equal(0);
      });
    });
  });

  describe("Receive Message", () => {
    const emitter = new MockEmitter(
      foreignEmitterAddress.toString("hex"),
      foreignEmitterChain
    );

    const guardians = new MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);

    describe("Finally Receive Message", () => {
      const nonce = 69;
      const payload = Buffer.from("Somebody set up us the bomb");
      const consistencyLevel = 1;
      const published = emitter.publishMessage(
        nonce,
        payload,
        consistencyLevel
      );

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      it("Post Wormhole Message", async () => {
        const response = await postVaaSolana(
          connection,
          new NodeWallet(payer).signTransaction,
          WORMHOLE_ADDRESS,
          payer.publicKey,
          signedWormholeMessage
        ).catch((reason) => null);
        expect(response).is.not.null;
      });

      it("Instruction: receive_message", async () => {
        const parsed = parseVaa(signedWormholeMessage);
        console.log("parsed", parsed);

        const receiveMessageTx = await createReceiveMessageInstruction(
          connection,
          program.programId,
          payer.publicKey,
          WORMHOLE_ADDRESS,
          parsed
        )
          .then((ix) =>
            web3.sendAndConfirmTransaction(
              connection,
              new web3.Transaction().add(ix),
              [payer]
            )
          )
          .catch((reason) => {
            // should not happen
            console.log(reason);
            return null;
          });
        expect(receiveMessageTx).is.not.null;

        const received = await getReceivedData(
          connection,
          program.programId,
          parsed.sequence
        );
        console.log("wut", received);
      });
    });
  });
});
