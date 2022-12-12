export interface SendTokensParams {
  batchId: number;
  amount: bigint;
  recipientAddress: Buffer;
  recipientChain: number;
}
