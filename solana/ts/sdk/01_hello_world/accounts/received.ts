import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveReceivedKey(
  programId: PublicKeyInitData,
  sequence: bigint
) {
  return deriveAddress(
    [
      Buffer.from("received"),
      (() => {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64LE(sequence);
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
  sequence: bigint,
  commitment?: Commitment
): Promise<Received> {
  return createHelloWorldProgramInterface(connection, programId)
    .account.received.fetch(deriveReceivedKey(programId, sequence), commitment)
    .then((received) => {
      return { batchId: received.batchId, message: received.message as Buffer };
    });
}
