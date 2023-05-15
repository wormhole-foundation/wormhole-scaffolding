import { ChainId } from "@certusone/wormhole-sdk";
import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { Connection, PublicKeyInitData } from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveReceivedKey(
  programId: PublicKeyInitData,
  chain: ChainId,
  sequence: bigint
) {
  return deriveAddress(
    [
      Buffer.from("received"),
      (() => {
        const buf = Buffer.alloc(10);
        buf.writeUInt16LE(chain, 0);
        buf.writeBigInt64LE(sequence, 2);
        return buf;
      })(),
    ],
    programId
  );
}

export interface Received {
  batchId: number;
  message: Buffer;
}

export async function getReceivedData(
  connection: Connection,
  programId: PublicKeyInitData,
  chain: ChainId,
  sequence: bigint
): Promise<Received> {
  const received = await createHelloWorldProgramInterface(connection, programId)
    .account.received.fetch(deriveReceivedKey(programId, chain, sequence));

  return {
    batchId: received.batchId,
    message: received.message as Buffer
  };
}
