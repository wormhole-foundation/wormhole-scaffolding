import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import { Commitment, Connection, PublicKeyInitData } from "@solana/web3.js";
import { createHelloTokenProgramInterface } from "../program";

export function deriveForeignContractKey(
  programId: PublicKeyInitData,
  chain: number
) {
  return deriveAddress(
    [
      Buffer.from("foreign_contract"),
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

export async function getForeignContractData(
  connection: Connection,
  programId: PublicKeyInitData,
  chain: number,
  commitment?: Commitment
): Promise<ForeignEmitter> {
  const { chain: _, address } = await createHelloTokenProgramInterface(
    connection,
    programId
  ).account.foreignContract.fetch(
    deriveForeignContractKey(programId, chain),
    commitment
  );
  return {
    chain,
    address: Buffer.from(address),
  };
}
