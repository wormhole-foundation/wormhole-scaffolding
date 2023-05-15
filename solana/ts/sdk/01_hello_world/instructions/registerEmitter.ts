import { Connection, PublicKey, PublicKeyInitData, TransactionInstruction } from "@solana/web3.js";
import {ChainId } from "@certusone/wormhole-sdk";
import { createHelloWorldProgramInterface } from "../program";
import { deriveConfigKey, deriveForeignEmitterKey } from "../accounts";

export async function createRegisterForeignEmitterInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  emitterChain: ChainId,
  emitterAddress: Buffer
): Promise<TransactionInstruction> {
  const program = createHelloWorldProgramInterface(connection, programId);
  return program.methods
    .registerEmitter(emitterChain, [...emitterAddress])
    .accounts({
      owner: new PublicKey(payer),
      config: deriveConfigKey(program.programId),
      foreignEmitter: deriveForeignEmitterKey(program.programId, emitterChain),
    })
    .instruction();
}
