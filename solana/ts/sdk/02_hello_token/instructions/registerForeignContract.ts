import {
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import { deriveEndpointKey } from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";
import { createHelloTokenProgramInterface } from "../program";
import { deriveSenderConfigKey, deriveForeignContractKey } from "../accounts";

export async function createRegisterForeignContractInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  chain: number,
  contractAddress: Buffer,
  tokenBridgeForeignAddress: string
): Promise<TransactionInstruction> {
  const program = createHelloTokenProgramInterface(connection, programId);
  return program.methods
    .registerForeignContract(chain, [...contractAddress])
    .accounts({
      owner: new PublicKey(payer),
      config: deriveSenderConfigKey(program.programId),
      foreignContract: deriveForeignContractKey(program.programId, chain),
      tokenBridgeForeignEndpoint: deriveEndpointKey(
        tokenBridgeProgramId,
        chain,
        tokenBridgeForeignAddress
      ),
      tokenBridgeProgram: new PublicKey(tokenBridgeProgramId),
    })
    .instruction();
}
