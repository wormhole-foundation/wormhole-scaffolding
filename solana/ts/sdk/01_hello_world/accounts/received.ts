import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveReceivedKey(
  programId: PublicKeyInitData,
  chain: number,
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
  chain: number,
  sequence: bigint,
  commitment?: Commitment
): Promise<Received> {
  return createHelloWorldProgramInterface(connection, programId)
    .account.received.fetch(
      deriveReceivedKey(programId, chain, sequence),
      commitment
    )
    .then((received) => {
      return { batchId: received.batchId, message: received.message as Buffer };
    });
}
