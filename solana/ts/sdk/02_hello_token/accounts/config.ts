import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
} from "@solana/web3.js";
import { createHelloTokenProgramInterface } from "../program";

export function deriveConfigKey(programId: PublicKeyInitData) {
  return deriveAddress([Buffer.from("config")], programId);
}

export interface TokenBridgeAddresses {
  config: PublicKey;
  authoritySigner: PublicKey;
  custodySigner: PublicKey;
  mintAuthority: PublicKey;
  sender: PublicKey;
  redeemer: PublicKey;
  emitter: PublicKey;
  sequence: PublicKey;
  senderBump: number;
  redeemerBump: number;
}

export interface WormholeAddresses {
  bridge: PublicKey;
  feeCollector: PublicKey;
}

export interface ConfigData {
  owner: PublicKey;
  tokenBridge: TokenBridgeAddresses;
  wormhole: WormholeAddresses;
  finality: number;
}

export async function getConfigData(
  connection: Connection,
  programId: PublicKeyInitData,
  commitment?: Commitment
): Promise<ConfigData> {
  const data = await createHelloTokenProgramInterface(
    connection,
    programId
  ).account.config.fetch(deriveConfigKey(programId), commitment);

  return {
    owner: data.owner,
    tokenBridge: data.tokenBridge,
    wormhole: data.wormhole,
    finality: data.finality,
  };
}
