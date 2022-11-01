import {
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  deriveAddress,
  getPostMessageCpiAccounts,
  getWormholeDerivedAccounts,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import { createHelloWorldProgramInterface } from "../program";
import { deriveConfigKey, deriveWormholeMessageKey } from "../accounts";

export async function createInitializeInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData
): Promise<TransactionInstruction> {
  const program = createHelloWorldProgramInterface(connection, programId);
  const message = deriveWormholeMessageKey(programId, 1n);
  const wormholeAccounts = getPostMessageCpiAccounts(
    program.programId,
    wormholeProgramId,
    payer,
    message
  );
  return program.methods
    .initialize()
    .accounts({
      owner: new PublicKey(payer),
      config: deriveConfigKey(programId),
      wormholeProgram: new PublicKey(wormholeProgramId),
      ...wormholeAccounts,
    })
    .instruction();
}
