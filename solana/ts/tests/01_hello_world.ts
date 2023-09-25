import { expect, use as chaiUse } from "chai";
import chaiAsPromised from 'chai-as-promised';
chaiUse(chaiAsPromised);
import {
  Connection,
  Keypair,
  PublicKey,
  Ed25519Program,
} from "@solana/web3.js";
import { CHAINS, ChainId, parseVaa } from "@certusone/wormhole-sdk";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  deriveAddress,
  getPostMessageCpiAccounts,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import * as wormhole from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import * as helloWorld from "../sdk/01_hello_world";
import {
  LOCALHOST,
  PAYER_KEYPAIR,
  CORE_BRIDGE_PID,
  range,
  programIdFromEnvVar,
  boilerPlateReduction,
} from "./helpers";

const FUZZ_TEST_ITERATIONS = 64;
const HELLO_WORLD_PID = new PublicKey("Scaffo1dingHe11oWor1d1111111111111111111111");

describe(" 1: Hello World", function() {
  const connection = new Connection(LOCALHOST, "processed");
  const payer = PAYER_KEYPAIR;

  const {
    requestAirdrop,
    guardianSign,
    postSignedMsgAsVaaOnSolana,
    expectIxToSucceed,
    expectIxToFailWithError,
  } = boilerPlateReduction(connection, payer);

  // foreign emitter info
  const realForeignEmitterChain = CHAINS.ethereum;
  const realForeignEmitterAddress = Buffer.alloc(32, "deadbeef", "hex");

  const realConfig = helloWorld.deriveConfigKey(HELLO_WORLD_PID);
  const realForeignEmitter =
    helloWorld.deriveForeignEmitterKey(HELLO_WORLD_PID, realForeignEmitterChain);
  const program = helloWorld.createHelloWorldProgramInterface(connection, HELLO_WORLD_PID);

  const getFalseAccountsAndCheckReal = (
    seeds: string | [string, Buffer],
    programId: PublicKey,
    realAccount: PublicKey,
  ) => {
    const possibleAccounts: PublicKey[] = [];
    for (let i = 255; i >= 0; --i) {
      const bumpByte = Buffer.alloc(1);
      bumpByte.writeUint8(i);
      try {
        possibleAccounts.push(
          PublicKey.createProgramAddressSync(
            [
              ...(typeof seeds === "string"
                ? [Buffer.from(seeds)]
                : [Buffer.from(seeds[0]), seeds[1]]
              ),
              bumpByte
            ],
            programId
          )
        );
      } catch (_) {
        // ignore
      }
    }
    expect(possibleAccounts.shift()!).deep.equals(realAccount);
    return possibleAccounts;
  }

  describe("Initialize Program", function() {
    const wormholeCpi = getPostMessageCpiAccounts(
      HELLO_WORLD_PID,
      CORE_BRIDGE_PID,
      payer.publicKey,
      deriveAddress([Buffer.from("alive")], HELLO_WORLD_PID)
    );

    const realInitializeAccounts = {
      owner: payer.publicKey,
      config: realConfig,
      wormholeProgram: CORE_BRIDGE_PID,
      wormholeBridge: wormholeCpi.wormholeBridge,
      wormholeFeeCollector: wormholeCpi.wormholeFeeCollector,
      wormholeEmitter: wormholeCpi.wormholeEmitter,
      wormholeSequence: wormholeCpi.wormholeSequence,
      wormholeMessage: wormholeCpi.wormholeMessage,
      clock: wormholeCpi.clock,
      rent: wormholeCpi.rent,
    };

    const expectInitializeToFailWith =
      async (falseAccounts: {[name: string]: PublicKey}, error: string) =>
        expectIxToFailWithError(
          program.methods
            .initialize()
            .accounts({...realInitializeAccounts, ...falseAccounts})
            .instruction(),
          error
        );

    it("Invalid Account PDA: wormhole_program", async function() {
      const wormholeProgram = Ed25519Program.programId;

      await expectInitializeToFailWith({wormholeProgram}, "InvalidProgramId");
    });

    ([
      [
        "config",
        ["config", HELLO_WORLD_PID, realConfig],
        "Error Code: ConstraintSeeds. Error Number: 2006."
      ],
      [
        "wormholeBridge",
        ["Bridge", CORE_BRIDGE_PID, wormholeCpi.wormholeBridge],
        "AccountNotInitialized"
      ],
      [
        "wormholeFeeCollector",
        ["fee_collector", CORE_BRIDGE_PID, wormholeCpi.wormholeFeeCollector],
        "AccountNotInitialized"
      ],
      [
        "wormholeEmitter",
        ["emitter", HELLO_WORLD_PID, wormholeCpi.wormholeEmitter],
        "Error Code: ConstraintSeeds. Error Number: 2006."
      ],
      [
        "wormholeSequence",
        [
          ["Sequence", wormholeCpi.wormholeEmitter.toBuffer()],
          CORE_BRIDGE_PID,
          wormholeCpi.wormholeSequence
        ],
        "Error Code: ConstraintSeeds. Error Number: 2006."
      ],
    ] as [string, Parameters<typeof getFalseAccountsAndCheckReal>, string][])
    .forEach(([name, [seed, programId, realAccount], error]) =>
      it(`Fuzz Test Invalid Account PDA: ${name}`, async function() {
        await Promise.all(
          getFalseAccountsAndCheckReal(seed, programId, realAccount)
          .map(async (account) =>
            expectInitializeToFailWith({[name]: account}, error)
          )
        );
      })
    );
    
    const createInitializeIx = () =>
      helloWorld.createInitializeInstruction(
        connection,
        HELLO_WORLD_PID,
        payer.publicKey,
        CORE_BRIDGE_PID
      );

    it("Finally Set Up Program", async function() {
      await expectIxToSucceed(createInitializeIx());

      // verify account data
      const configData = await helloWorld.getConfigData(connection, HELLO_WORLD_PID);
      expect(configData.owner).deep.equals(payer.publicKey);

      const {wormholeBridge, wormholeFeeCollector} =
        wormhole.getWormholeDerivedAccounts(HELLO_WORLD_PID, CORE_BRIDGE_PID);
      expect(configData.wormhole.bridge).deep.equals(wormholeBridge);
      expect(configData.wormhole.feeCollector).deep.equals(wormholeFeeCollector);
    });

    it("Cannot Call Instruction Again: initialize", async function() {
      await expectIxToFailWithError(await createInitializeIx(), "already in use");
    });
  });

  describe("Register Foreign Emitter", function() {
    const realRegisterEmitterAccounts = {
      owner: payer.publicKey,
      config: realConfig,
      foreignEmitter: realForeignEmitter,
    }

    const expectRegisterEmitterToFailWith = async (
      emitterChain: ChainId,
      falseAccounts: any,
      error: string,
      signer?: Keypair
    ) => {
      const registerForeignEmitterIx = await program.methods
          .registerEmitter(emitterChain, [...realForeignEmitterAddress])
          .accounts({...realRegisterEmitterAccounts, ...falseAccounts})
          .instruction();
      await expectIxToFailWithError(registerForeignEmitterIx, error, signer);
    }

    it("Invalid Account PDA: owner", async function() {
      await Promise.all(
        range(FUZZ_TEST_ITERATIONS).map(async () => {
          const nonOwner = Keypair.generate();
          await requestAirdrop(nonOwner.publicKey);
          await expectRegisterEmitterToFailWith(
            realForeignEmitterChain,
            {owner: nonOwner.publicKey},
            "OwnerOnly",
            nonOwner
          );
        })
      );
    });

    ([
      [
        "config",
        ["config", HELLO_WORLD_PID, realConfig],
        realForeignEmitterChain,
        "The program expected this account to be already initialized"
      ],
      [
        "foreignEmitter",
        [
          [
            "foreign_emitter",
            (() => {
              const buf = Buffer.alloc(2);
              buf.writeUInt16LE(realForeignEmitterChain);
              return buf;
            })()
          ],
          HELLO_WORLD_PID,
          realForeignEmitter
        ],
        realForeignEmitterChain,
        "Error Code: ConstraintSeeds. Error Number: 2006."
      ],
    ] as [string, Parameters<typeof getFalseAccountsAndCheckReal>, ChainId, string][])
    .forEach(([name, [seeds, programId, realAccount], emitterChain, error]) =>
      it(`Fuzz Test Invalid Account PDA: ${name}`, async function() {
        await Promise.all(
          getFalseAccountsAndCheckReal(seeds, programId, realAccount)
          .map(async (account) =>
            expectRegisterEmitterToFailWith(emitterChain, {[name]: account}, error)
          )
        );
      })
    );

    it("Cannot Register Emitter With Conflicting Chain ID", async function() {
      const bogusEmitterChain = realForeignEmitterChain + 1 as ChainId;
      await expectRegisterEmitterToFailWith(
        bogusEmitterChain,
        {},
        "Error Code: ConstraintSeeds. Error Number: 2006."
      );
    });
    
    [
      CHAINS.unset,
      CHAINS.solana,
    ]
    .forEach(emitterChain =>
      it(`Cannot Register Chain ID == ${emitterChain}`, async function() {
        await expectIxToFailWithError(
          await helloWorld.createRegisterForeignEmitterInstruction(
            connection,
            HELLO_WORLD_PID,
            payer.publicKey,
            emitterChain,
            realForeignEmitterAddress
          ),
          "InvalidForeignEmitter"
        );
      })
    );

    it("Cannot Register Zero Address", async function() {
      await expectIxToFailWithError(
        await helloWorld.createRegisterForeignEmitterInstruction(
          connection,
          HELLO_WORLD_PID,
          payer.publicKey,
          realForeignEmitterChain,
          Buffer.alloc(32) // emitterAddress
        ),
        "InvalidForeignEmitter"
      );
    });

    it("Cannot Register Emitter Address Length != 32", async function() {
      await expectIxToFailWithError(
        helloWorld.createRegisterForeignEmitterInstruction(
          connection,
          HELLO_WORLD_PID,
          payer.publicKey,
          realForeignEmitterChain,
          Buffer.alloc(20, "deadbeef", "hex") // emitterAddress
        ),
        "The program could not deserialize the given instruction"
      );
    });

    [
      Buffer.alloc(32, "fbadc0de", "hex"),
      realForeignEmitterAddress,
    ]
    .forEach((emitterAddress) =>
      it(`Register ${emitterAddress === realForeignEmitterAddress ? "Final" : "Random"} Emitter`,
      async function() {
        await expectIxToSucceed(
          helloWorld.createRegisterForeignEmitterInstruction(
            connection,
            HELLO_WORLD_PID,
            payer.publicKey,
            realForeignEmitterChain,
            emitterAddress
          )
        );

        const {chain, address} = 
          await helloWorld.getForeignEmitterData(
            connection,
            HELLO_WORLD_PID,
            realForeignEmitterChain
          );
        expect(chain).equals(realForeignEmitterChain);
        expect(address).deep.equals(emitterAddress);
      })
    );
  });

  describe("Send Message", function() {
    it("Cannot Send Message With Length > 512", async function() {
      const helloMessage = Buffer.alloc(513, "All your base are belong to us");

      await expectIxToFailWithError(
        await helloWorld.createSendMessageInstruction(
          connection,
          HELLO_WORLD_PID,
          payer.publicKey,
          CORE_BRIDGE_PID,
          helloMessage
        ),
        "IO Error: message exceeds 512 bytes"
      );
    });

    it("Finally Send Message", async function() {
      const helloMessage = Buffer.from("All your base are belong to us");

      // save message count to grab posted message later
      const sequence = (
        await wormhole.getProgramSequenceTracker(connection, HELLO_WORLD_PID, CORE_BRIDGE_PID)
      ).value() + 1n;

      await expectIxToSucceed(
        helloWorld.createSendMessageInstruction(
          connection,
          HELLO_WORLD_PID,
          payer.publicKey,
          CORE_BRIDGE_PID,
          helloMessage
        )
      );

      const {payload} =
        (await wormhole.getPostedMessage(
          connection,
          helloWorld.deriveWormholeMessageKey(HELLO_WORLD_PID, sequence)
        )).message;

      expect(payload.readUint8(0)).equals(1); // payload ID
      expect(payload.readUint16BE(1)).equals(helloMessage.length);
      expect(payload.subarray(3)).deep.equals(helloMessage);
    });
  });

  describe("Receive Message", function() {
    const realEmitter = new mock.MockEmitter(
      realForeignEmitterAddress.toString("hex"),
      realForeignEmitterChain
    );

    const batchId = 0;
    const message = Buffer.from("Somebody set up us the bomb");
    
    const createPayload = (options?: {payloadId?: number; length?: number}) => {
      const length = (options?.length ?? message.length);
      const buf = Buffer.alloc(3 + length);
      buf.writeUint8(options?.payloadId ?? 1, 0);
      buf.writeUint16BE(length, 1);
      message.copy(buf, 3);
      return buf;
    };

    const publishAndSign = (payload: Buffer, emitter: mock.MockEmitter) => {
      const finality = 1;
      return guardianSign(emitter.publishMessage(batchId, payload, finality));
    }

    const createAndReceiveIx = (signedMsg: Buffer) =>
      helloWorld.createReceiveMessageInstruction(
        connection,
        HELLO_WORLD_PID,
        payer.publicKey,
        CORE_BRIDGE_PID,
        signedMsg
      );
    
    ([
      [
        "Unregistered Emitter",
        new mock.MockEmitter(
          Buffer.alloc(32, "deafbeef").toString("hex"),
          realForeignEmitterChain
        ),
        createPayload(),
        "InvalidForeignEmitter"
      ],
      [
        "Invalid Payload ID",
        realEmitter,
        createPayload({payloadId: 2}),
        "IO Error: invalid payload ID"
      ],
      [
        "Payload ID == 0 (Alive)",
        realEmitter,
        (() => {
          const buf = Buffer.alloc(33);
          buf.writeUint8(0, 0); // payload ID
          HELLO_WORLD_PID.toBuffer().copy(buf, 1);
          return buf;
        })(),
        "InvalidMessage"
      ],
      [
        "Length > 512",
        realEmitter,
        createPayload({length: 513}),
        "IO Error: message exceeds 512 bytes"
      ]
    ] as [string, mock.MockEmitter, Buffer, string][])
    .forEach(([testcase, emitter, payload, error]) =>
      it(`Cannot Receive Message With ${testcase}`, async function() {
        const signedMsg = publishAndSign(payload, emitter);
        await expect(postSignedMsgAsVaaOnSolana(signedMsg)).to.be.fulfilled;
        await expectIxToFailWithError(await createAndReceiveIx(signedMsg), error);
      })
    );

    const signedMsg = publishAndSign(createPayload(), realEmitter);

    it("Post Wormhole Message", async function() {
      await expect(postSignedMsgAsVaaOnSolana(signedMsg)).to.be.fulfilled;
    });

    it("Finally Receive Message", async function() {
      await expectIxToSucceed(createAndReceiveIx(signedMsg));

      const parsed = parseVaa(signedMsg);
      const received = await helloWorld.getReceivedData(
        connection,
        HELLO_WORLD_PID,
        parsed.emitterChain as ChainId, // don't do this at home, kids
        parsed.sequence
      );
      expect(received.batchId).equals(batchId);
      expect(received.message).deep.equals(message);
    });

    it("Cannot Call Instruction Again With Same Wormhole Message", async function() {
      await expectIxToFailWithError(await createAndReceiveIx(signedMsg), "already in use");
    });
  });
});
