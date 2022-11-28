import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { PublicKey, PublicKeyInitData } from "@solana/web3.js";

export function deriveTmpTokenAccountKey(
  programId: PublicKeyInitData,
  mint: PublicKeyInitData
) {
  return deriveAddress(
    [Buffer.from("tmp"), new PublicKey(mint).toBuffer()],
    programId
  );
}
