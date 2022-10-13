import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  deriveAddress,
  getPostMessageCpiAccounts,
} from "@certusone/wormhole-sdk/solana";
import { createHelloWorldProgramInterface } from "../program";
import {
  deriveConfigKey,
  deriveWormholeMessageKey,
  getConfigData,
} from "../accounts";

export async function createSendMessageInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  batchId: number,
  payload: Buffer,
  commitment?: Commitment
): Promise<TransactionInstruction> {
  const program = createHelloWorldProgramInterface(connection, programId);

  // get message count
  const config = await getConfigData(connection, programId, commitment);
  const message = deriveWormholeMessageKey(programId, config.messageCount);
  const wormholeAccounts = getPostMessageCpiAccounts(
    program.programId,
    wormholeProgramId,
    payer,
    message
  );
  return program.methods
    .sendMessage(batchId, payload)
    .accounts({
      config: deriveConfigKey(programId),
      wormholeProgram: new PublicKey(wormholeProgramId),
      ...wormholeAccounts,
    })
    .instruction();
}
