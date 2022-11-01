import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
} from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveConfigKey(programId: PublicKeyInitData) {
  return deriveAddress([Buffer.from("config")], programId);
}

export interface WormholeAddresses {
  bridge: PublicKey;
  feeCollector: PublicKey;
  sequence: PublicKey;
}

export interface ConfigData {
  owner: PublicKey;
  wormhole: WormholeAddresses;
}

export async function getConfigData(
  connection: Connection,
  programId: PublicKeyInitData,
  commitment?: Commitment
): Promise<ConfigData> {
  const data = await createHelloWorldProgramInterface(
    connection,
    programId
  ).account.config.fetch(deriveConfigKey(programId), commitment);

  return {
    owner: data.owner,
    wormhole: data.wormhole,
  };
}
