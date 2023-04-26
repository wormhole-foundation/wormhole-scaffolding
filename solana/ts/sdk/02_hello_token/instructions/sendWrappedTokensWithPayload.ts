import { Connection, PublicKey, PublicKeyInitData, TransactionInstruction } from "@solana/web3.js";
import { getTransferWrappedWithPayloadCpiAccounts } from "@certusone/wormhole-sdk/lib/cjs/solana";
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
import { getWrappedMeta } from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";
import { BN } from "@coral-xyz/anchor";

export async function createSendWrappedTokensWithPayloadInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  mint: PublicKeyInitData,
  params: SendTokensParams
): Promise<TransactionInstruction> {
  const program = createHelloTokenProgramInterface(connection, programId);

  return getProgramSequenceTracker(
    connection,
    tokenBridgeProgramId,
    wormholeProgramId
  )
    .then((tracker) =>
      deriveTokenTransferMessageKey(programId, tracker.sequence + 1n)
    )
    .then(async (message) => {
      const fromTokenAccount = getAssociatedTokenAddressSync(
        new PublicKey(mint),
        new PublicKey(payer)
      );
      const tmpTokenAccount = deriveTmpTokenAccountKey(programId, mint);

      const wrappedMeta = await getWrappedMeta(
        connection,
        tokenBridgeProgramId,
        mint
      );
      const tokenBridgeAccounts = getTransferWrappedWithPayloadCpiAccounts(
        programId,
        tokenBridgeProgramId,
        wormholeProgramId,
        payer,
        message,
        fromTokenAccount,
        wrappedMeta.chain,
        wrappedMeta.tokenAddress
      );

      return program.methods
        .sendWrappedTokensWithPayload(
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
