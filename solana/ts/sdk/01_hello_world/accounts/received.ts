import { deriveAddress } from "@certusone/wormhole-sdk/solana";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveReceivedKey(
  programId: PublicKeyInitData,
  sequence: bigint
) {
  return deriveAddress(
    [
      Buffer.from("hello_world.received"),
      (() => {
        const buf = Buffer.alloc(8);
        buf.writeBigInt64LE(sequence);
        return buf;
      })(),
    ],
    programId
  );
}

export async function getReceivedData(
  connection: Connection,
  programId: PublicKeyInitData,
  sequence: bigint,
  commitment?: Commitment
): Promise<Buffer> {
  return createHelloWorldProgramInterface(connection, programId)
    .account.received.fetch(deriveReceivedKey(programId, sequence), commitment)
    .then((received) => received.message as Buffer);
}
