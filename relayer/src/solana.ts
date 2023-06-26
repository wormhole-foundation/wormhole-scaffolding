import * as wh from "@certusone/wormhole-sdk";

import { Connection, GetVersionedTransactionConfig, PublicKey, TransactionResponse } from "@solana/web3.js";

import * as helloWorld from "../../solana/ts/sdk/01_hello_world/";
import {
  LOCALHOST,
  PAYER_KEYPAIR,
  CORE_BRIDGE_PID,
  programIdFromEnvVar,
  boilerPlateReduction,
} from "../../solana/ts/tests/helpers";

export const HELLO_WORLD_PID = new PublicKey("3v6vnffes8BPB3tuYcMfQEp15FPjGobYaqDJn96qSb2Q");



// const HELLO_WORLD_PID = programIdFromEnvVar("HELLO_WORLD_PROGRAM_ID");
const connection = new Connection(LOCALHOST, "confirmed");
const payer = PAYER_KEYPAIR;

const { requestAirdrop, postSignedMsgAsVaaOnSolana, sendAndConfirmIx } = boilerPlateReduction(
  connection,
  payer
);


async function initProgram() {
  await requestAirdrop(payer.publicKey);

  console.log(HELLO_WORLD_PID)
  console.log(CORE_BRIDGE_PID)

  await sendAndConfirmIx(
    helloWorld.createInitializeInstruction(
      connection,
      HELLO_WORLD_PID,
      payer.publicKey,
      CORE_BRIDGE_PID
    )
  );
}

async function registerEmitter(emitterChain: wh.ChainId, emitterAddress: string) {
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
  console.log(txid)
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

export { initProgram, registerEmitter, sendMessage, receiveMessage };
