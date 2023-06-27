import * as wh from "@certusone/wormhole-sdk";

import {
  Connection,
  GetVersionedTransactionConfig,
  PublicKey,
  TransactionResponse,
} from "@solana/web3.js";

import * as helloWorld from "../../solana/ts/sdk/01_hello_world/";
import {
  LOCALHOST,
  PAYER_KEYPAIR,
  CORE_BRIDGE_PID,
  programIdFromEnvVar,
  boilerPlateReduction,
} from "../../solana/ts/tests/helpers";
import { HelloWorldContract } from "./hello-world-contract";

// TODO: dont hardcode it
// const HELLO_WORLD_PID = programIdFromEnvVar("HELLO_WORLD_PROGRAM_ID");
const HELLO_WORLD_PID = new PublicKey(
  "3v6vnffes8BPB3tuYcMfQEp15FPjGobYaqDJn96qSb2Q"
);

const connection = new Connection(LOCALHOST, "confirmed");
const payer = PAYER_KEYPAIR;

const { requestAirdrop, postSignedMsgAsVaaOnSolana, sendAndConfirmIx } =
  boilerPlateReduction(connection, payer);

async function initProgram(): Promise<string> {
  try {
    // Check to see if its been deployed
    // an error here implies its not been deployed
    await helloWorld.getConfigData(connection, HELLO_WORLD_PID);
    return wh.getEmitterAddressSolana(HELLO_WORLD_PID);
  } catch (e) {
    /*noop*/
  }

  await requestAirdrop(payer.publicKey);
  await sendAndConfirmIx(
    helloWorld.createInitializeInstruction(
      connection,
      HELLO_WORLD_PID,
      payer.publicKey,
      CORE_BRIDGE_PID
    )
  );
  return wh.getEmitterAddressSolana(HELLO_WORLD_PID);
}

async function registerEmitter(
  emitterChain: wh.ChainId,
  emitterAddress: string
) {
  try {
    const { chain, address } = await helloWorld.getForeignEmitterData(
      connection,
      HELLO_WORLD_PID,
      emitterChain
    );
    console.log(`Already registered ${address} for chain ${chain}`);
    return;
  } catch (e) {
    /*noop*/
  }

  await sendAndConfirmIx(
    helloWorld.createRegisterForeignEmitterInstruction(
      connection,
      HELLO_WORLD_PID,
      payer.publicKey,
      emitterChain,
      Buffer.from(emitterAddress, "hex")
    )
  );

  const { chain, address } = await helloWorld.getForeignEmitterData(
    connection,
    HELLO_WORLD_PID,
    emitterChain
  );
  console.log(`Registered ${address} for chain ${chain}`);
}

async function sendMessage(msg: Buffer): Promise<string> {
  const txid = await sendAndConfirmIx(
    helloWorld.createSendMessageInstruction(
      connection,
      HELLO_WORLD_PID,
      payer.publicKey,
      CORE_BRIDGE_PID,
      msg
    )
  );
  return await getSequence(txid);
}

async function receiveMessage(vaa: Buffer): Promise<Buffer> {
  await postSignedMsgAsVaaOnSolana(vaa);
  await sendAndConfirmIx(
    helloWorld.createReceiveMessageInstruction(
      connection,
      HELLO_WORLD_PID,
      payer.publicKey,
      CORE_BRIDGE_PID,
      vaa
    )
  );

  const parsed = wh.parseVaa(vaa);
  return (
    await helloWorld.getReceivedData(
      connection,
      HELLO_WORLD_PID,
      parsed.emitterChain as wh.ChainId,
      parsed.sequence
    )
  ).message;
}

async function getSequence(txid: string): Promise<string> {
  const vtc: GetVersionedTransactionConfig = {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 2,
  };

  // TODO: flagged as deprecated, passing version tx config tho?
  const info = await connection.getTransaction(txid);

  if (info === null)
    throw new Error("Couldn't get info for transaction: " + txid);

  return wh.parseSequenceFromLogSolana(info);
}

export const SolanaContract: HelloWorldContract = {
  deploy: initProgram,
  registerEmitter,
  send: sendMessage,
  receive: receiveMessage,
};
