import * as anchor from "@project-serum/anchor";
import * as web3 from "@solana/web3.js";
import {
  deriveAddress,
  getPostMessageCpiAccounts,
} from "@certusone/wormhole-sdk/solana";
import {
  FUZZ_TEST_ITERATIONS,
  HELLO_WORLD_ADDRESS,
  LOCALHOST,
  PAYER_PRIVATE_KEY,
  WORMHOLE_ADDRESS,
} from "./helpers/consts";
import {
  createHelloWorldProgramInterface,
  createInitializeInstruction,
} from "../sdk/01_hello_world";
import { expect } from "chai";

describe(" 1: Hello World", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  //const program = anchor.workspace.HelloWorld as anchor.Program<HelloWorld>;
  const connection = new web3.Connection(LOCALHOST, "confirmed");
  const payer = web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);

  describe("Initialize Program", () => {
    describe("Fuzz Test Invalid Accounts for Instruction: initialize", () => {
      const program = createHelloWorldProgramInterface(
        connection,
        HELLO_WORLD_ADDRESS
      );

      const wormholeCpi = getPostMessageCpiAccounts(
        program.programId,
        WORMHOLE_ADDRESS,
        payer.publicKey,
        web3.PublicKey.default // dummy for message
      );

      it("Invalid Account: config", async () => {
        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const config = deriveAddress(
            [Buffer.from(`Bogus ${i}`)],
            program.programId
          );

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
            .catch((reason) => null);
          expect(initializeTx).is.null;
        }
      });

      it("Invalid Account: wormhole_program", async () => {
        // First create invalid wormhole program and derive CPI PDAs
        // from this bogus address.
        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const wormholeProgram = web3.Keypair.generate().publicKey;
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
              config: deriveAddress(
                [Buffer.from("hello_world.config")],
                program.programId
              ),
              wormholeProgram,
              wormholeConfig: cpi.wormholeConfig,
              wormholeFeeCollector: cpi.wormholeFeeCollector,
              wormholeEmitter: cpi.wormholeEmitter,
              wormholeSequence: cpi.wormholeSequence,
            })
            .instruction()
            .then((ix) =>
              web3.sendAndConfirmTransaction(
                connection,
                new web3.Transaction().add(ix),
                [payer]
              )
            )
            .catch((reason) => null);
          expect(initializeTx).is.null;
        }

        // Now just pass an invalid Wormhole program address
        // while passing in the correct PDAs.
        for (let i = 0; i < FUZZ_TEST_ITERATIONS; ++i) {
          const wormholeProgram = web3.Keypair.generate().publicKey;

          const initializeTx = await program.methods
            .initialize()
            .accounts({
              owner: payer.publicKey,
              config: deriveAddress(
                [Buffer.from("hello_world.config")],
                program.programId
              ),
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
            .catch((reason) => null);
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
              config: deriveAddress(
                [Buffer.from("hello_world.config")],
                program.programId
              ),
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
            .catch((reason) => null);
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
              config: deriveAddress(
                [Buffer.from("hello_world.config")],
                program.programId
              ),
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
            .catch((reason) => null);
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
              config: deriveAddress(
                [Buffer.from("hello_world.config")],
                program.programId
              ),
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
            .catch((reason) => null);
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
              config: deriveAddress(
                [Buffer.from("hello_world.config")],
                program.programId
              ),
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
            .catch((reason) => null);
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
          .catch((reason) => null);
        expect(initializeTx).is.not.null;
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
          .catch((reason) => null);
        expect(initializeTx).is.null;
      });
    });
  });
});
