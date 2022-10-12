import {
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

export async function createInitializeInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData
): Promise<TransactionInstruction> {
  const program = createHelloWorldProgramInterface(connection, programId);
  const wormholeAccounts = getPostMessageCpiAccounts(
    program.programId,
    wormholeProgramId,
    payer,
    PublicKey.default // dummy for message
  );
  return program.methods
    .initialize()
    .accounts({
      owner: wormholeAccounts.payer,
      config: deriveAddress(
        [Buffer.from("hello_world.config")],
        program.programId
      ),
      wormholeProgram: new PublicKey(wormholeProgramId),
      ...wormholeAccounts,
    })
    .instruction();
}
