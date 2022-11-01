import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveForeignEmitterKey(
  programId: PublicKeyInitData,
  chain: number
) {
  return deriveAddress(
    [
      Buffer.from("foreign_emitter"),
      (() => {
        const buf = Buffer.alloc(2);
        buf.writeUInt16LE(chain);
        return buf;
      })(),
    ],
    programId
  );
}

export interface ForeignEmitter {
  chain: number;
  address: Buffer;
}

export async function getForeignEmitterData(
  connection: Connection,
  programId: PublicKeyInitData,
  chain: number,
  commitment?: Commitment
): Promise<ForeignEmitter> {
  const { chain: _, address } = await createHelloWorldProgramInterface(
    connection,
    programId
  ).account.foreignEmitter.fetch(
    deriveForeignEmitterKey(programId, chain),
    commitment
  );
  return {
    chain,
    address: Buffer.from(address),
  };
}
