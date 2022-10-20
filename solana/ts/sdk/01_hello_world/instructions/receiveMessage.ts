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
  deriveForeignEmitterKey,
  deriveReceivedKey,
  deriveWormholeMessageKey,
  getConfigData,
} from "../accounts";
import {
  isBytes,
  ParsedVaa,
  parseVaa,
  SignedVaa,
} from "@certusone/wormhole-sdk";
import { derivePostedVaaKey } from "@certusone/wormhole-sdk/solana/wormhole";

export async function createReceiveMessageInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  wormholeMessage: SignedVaa | ParsedVaa,
  commitment?: Commitment
): Promise<TransactionInstruction> {
  const program = createHelloWorldProgramInterface(connection, programId);

  const parsed = isBytes(wormholeMessage)
    ? parseVaa(wormholeMessage)
    : wormholeMessage;

  return program.methods
    .receiveMessage()
    .accounts({
      payer: new PublicKey(payer),
      config: deriveConfigKey(programId),
      wormholeProgram: new PublicKey(wormholeProgramId),
      wormholeMessage: derivePostedVaaKey(wormholeProgramId, parsed.hash),
      foreignEmitter: deriveForeignEmitterKey(programId, parsed.emitterChain),
      received: deriveReceivedKey(programId, parsed.sequence),
    })
    .instruction();
}
