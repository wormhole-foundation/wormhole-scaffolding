import {
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHelloTokenProgramInterface } from "../program";
import { deriveConfigKey, deriveForeignContractKey } from "../accounts";

export async function createRegisterForeignContractInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  chain: number,
  contractAddress: Buffer
): Promise<TransactionInstruction> {
  const program = createHelloTokenProgramInterface(connection, programId);
  return program.methods
    .registerForeignContract(chain, [...contractAddress])
    .accounts({
      owner: new PublicKey(payer),
      config: deriveConfigKey(program.programId),
      foreignContract: deriveForeignContractKey(program.programId, chain),
    })
    .instruction();
}
