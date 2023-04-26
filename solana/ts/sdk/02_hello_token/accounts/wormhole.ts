import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { deriveWormholeEmitterKey } from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import { PublicKeyInitData } from "@solana/web3.js";

export { deriveWormholeEmitterKey };

export function deriveTokenTransferMessageKey(
  programId: PublicKeyInitData,
  sequence: bigint
) {
  return deriveAddress(
    [
      Buffer.from("bridged"),
      (() => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(sequence);
        return buf;
      })(),
    ],
    programId
  );
}
