import * as wh from "@certusone/wormhole-sdk";

import { Connection, GetVersionedTransactionConfig } from "@solana/web3.js";

import * as helloWorld from "../../solana/ts/sdk/01_hello_world/";
import {
  LOCALHOST,
  PAYER_KEYPAIR,
  CORE_BRIDGE_PID,
  programIdFromEnvVar,
  boilerPlateReduction,
} from "../../solana/ts/tests/helpers";

const HELLO_WORLD_PID = programIdFromEnvVar("HELLO_WORLD_PROGRAM_ID");
const connection = new Connection(LOCALHOST, "processed");
const payer = PAYER_KEYPAIR;

const { postSignedMsgAsVaaOnSolana, sendAndConfirmIx } = boilerPlateReduction(
  connection,
  payer
);

//const config = helloWorld.deriveConfigKey(HELLO_WORLD_PID);
//const program = helloWorld.createHelloWorldProgramInterface(
//  connection,
//  HELLO_WORLD_PID
//);

async function initProgram() {
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
      // TODO: Assume leading 0x
      Buffer.from(emitterAddress, "hex").subarray(2)
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
    maxSupportedTransactionVersion: 1,
  };

  // TODO: flagged as deprecated, passing version tx config tho?
  const info = await connection.getTransaction(txid, vtc);

  if (info === null)
    throw new Error("Couldn't get info for transaction: " + txid);

  return wh.parseSequenceFromLogSolana(info);
}

export { initProgram, registerEmitter, sendMessage, receiveMessage };
