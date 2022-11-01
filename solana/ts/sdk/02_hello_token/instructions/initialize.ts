import {
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import { getTokenBridgeDerivedAccounts } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { createHelloTokenProgramInterface } from "../program";
import { deriveConfigKey } from "../accounts";

export async function createInitializeInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData
): Promise<TransactionInstruction> {
  const program = createHelloTokenProgramInterface(connection, programId);
  const tokenBridgeAccounts = getTokenBridgeDerivedAccounts(
    program.programId,
    tokenBridgeProgramId,
    wormholeProgramId
  );
  return program.methods
    .initialize()
    .accounts({
      owner: new PublicKey(payer),
      config: deriveConfigKey(programId),
      tokenBridgeProgram: new PublicKey(tokenBridgeProgramId),
      wormholeProgram: new PublicKey(wormholeProgramId),
      ...tokenBridgeAccounts,
    })
    .instruction();
}
