import { deriveAddress } from "@certusone/wormhole-sdk/solana";
import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
} from "@solana/web3.js";
import { createHelloWorldProgramInterface } from "../program";

export function deriveConfigKey(programId: PublicKeyInitData) {
  return deriveAddress([Buffer.from("hello_world.config")], programId);
}

export interface WormholeAddresses {
  program: PublicKey;
  config: PublicKey;
  feeCollector: PublicKey;
  emitter: PublicKey;
  sequence: PublicKey;
}

export interface ConfigData {
  owner: PublicKey;
  wormhole: WormholeAddresses;
  bump: number;
  messageCount: bigint;
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
    bump: data.bump,
    messageCount: BigInt(data.messageCount.toString()),
  };
}
