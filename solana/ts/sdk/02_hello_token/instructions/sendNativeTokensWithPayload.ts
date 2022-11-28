import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import {
  deriveAddress,
  getTransferNativeWithPayloadCpiAccounts,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import { createHelloTokenProgramInterface } from "../program";
import {
  deriveSenderConfigKey,
  deriveTokenTransferMessageKey,
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
      const payerPubkey = new PublicKey(payer);
      const mintPubkey = new PublicKey(mint);

      const fromTokenAccount = getAssociatedTokenAddressSync(
        mintPubkey,
        payerPubkey
      );
      const tmpTokenAccount = deriveAddress(
        [Buffer.from("tmp"), mintPubkey.toBuffer(), payerPubkey.toBuffer()],
        programId
      );
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
          tmpTokenAccount,
          tokenBridgeProgram: new PublicKey(tokenBridgeProgramId),
          ...tokenBridgeAccounts,
        })
        .instruction();
    });
}
