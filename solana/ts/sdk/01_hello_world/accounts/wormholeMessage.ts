import { deriveAddress } from "@certusone/wormhole-sdk/solana";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveWormholeMessageKey(
  programId: PublicKeyInitData,
  messageCount: bigint
) {
  return deriveAddress(
    [
      Buffer.from("hello_world.wormhole_message"),
      (() => {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(messageCount);
        return buf;
      })(),
    ],
    programId
  );
}
