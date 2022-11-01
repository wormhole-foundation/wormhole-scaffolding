import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";
import {
  deriveConfigKey,
  deriveForeignEmitterKey,
  deriveReceivedKey,
} from "../accounts";
import {
  isBytes,
  ParsedVaa,
  parseVaa,
  SignedVaa,
} from "@certusone/wormhole-sdk";
import { derivePostedVaaKey } from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";

export async function createReceiveMessageInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  wormholeMessage: SignedVaa | ParsedVaa
): Promise<TransactionInstruction> {
  const program = createHelloWorldProgramInterface(connection, programId);

  const parsed = isBytes(wormholeMessage)
    ? parseVaa(wormholeMessage)
    : wormholeMessage;

  return program.methods
    .receiveMessage([...parsed.hash])
    .accounts({
      payer: new PublicKey(payer),
      config: deriveConfigKey(programId),
      wormholeProgram: new PublicKey(wormholeProgramId),
      posted: derivePostedVaaKey(wormholeProgramId, parsed.hash),
      foreignEmitter: deriveForeignEmitterKey(programId, parsed.emitterChain),
      received: deriveReceivedKey(
        programId,
        parsed.emitterChain,
        parsed.sequence
      ),
    })
    .instruction();
}
