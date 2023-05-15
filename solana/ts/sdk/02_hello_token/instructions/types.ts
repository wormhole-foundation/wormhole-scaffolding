import {ChainId } from "@certusone/wormhole-sdk";

export interface SendTokensParams {
  batchId: number;
  amount: bigint;
  recipientAddress: Buffer;
  recipientChain: ChainId;
}
