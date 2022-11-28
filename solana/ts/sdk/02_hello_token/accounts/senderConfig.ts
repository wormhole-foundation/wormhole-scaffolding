import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
} from "@solana/web3.js";
import { createHelloTokenProgramInterface } from "../program";

export function deriveSenderConfigKey(programId: PublicKeyInitData) {
  return deriveAddress([Buffer.from("sender")], programId);
}

export interface OutboundTokenBridgeAddresses {
  config: PublicKey;
  authoritySigner: PublicKey;
  custodySigner: PublicKey;
  emitter: PublicKey;
  sequence: PublicKey;
  wormholeBridge: PublicKey;
  wormholeFeeCollector: PublicKey;
}

export interface SenderConfigData {
  owner: PublicKey;
  bump: number;
  tokenBridge: OutboundTokenBridgeAddresses;
  finality: number;
  relayerFee: number;
}

export async function getSenderConfigData(
  connection: Connection,
  programId: PublicKeyInitData,
  commitment?: Commitment
): Promise<SenderConfigData> {
  return createHelloTokenProgramInterface(
    connection,
    programId
  ).account.senderConfig.fetch(deriveSenderConfigKey(programId), commitment);
}
