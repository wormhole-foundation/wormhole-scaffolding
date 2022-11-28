import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import { getTransferNativeWithPayloadCpiAccounts } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { createHelloTokenProgramInterface } from "../program";
import {
  deriveForeignContractKey,
  deriveSenderConfigKey,
  deriveTokenTransferMessageKey,
  deriveTmpTokenAccountKey,
} from "../accounts";
import { getProgramSequenceTracker } from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SendTokensParams } from "./types";

export async function createSendNativeTokensWithPayloadInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  mint: PublicKeyInitData,
  params: SendTokensParams,
  commitment?: Commitment
): Promise<TransactionInstruction> {
  const program = createHelloTokenProgramInterface(connection, programId);

  return getProgramSequenceTracker(
    connection,
    tokenBridgeProgramId,
    wormholeProgramId,
    commitment
  )
    .then((tracker) =>
      deriveTokenTransferMessageKey(programId, tracker.sequence + 1n)
    )
    .then((message) => {
      const fromTokenAccount = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(payer)
      );
      const tmpTokenAccount = deriveTmpTokenAccountKey(programId, mint);
      const tokenBridgeAccounts = getTransferNativeWithPayloadCpiAccounts(
        programId,
        tokenBridgeProgramId,
        wormholeProgramId,
        payer,
        message,
        fromTokenAccount,
        mint
      );

      return program.methods
        .sendNativeTokensWithPayload(
          params.batchId,
          new BN(params.amount.toString()),
          [...params.recipientAddress],
          params.recipientChain
        )
        .accounts({
          config: deriveSenderConfigKey(programId),
          foreignContract: deriveForeignContractKey(
            programId,
            params.recipientChain
          ),
          tmpTokenAccount,
          tokenBridgeProgram: new PublicKey(tokenBridgeProgramId),
          ...tokenBridgeAccounts,
        })
        .instruction();
    });
}
