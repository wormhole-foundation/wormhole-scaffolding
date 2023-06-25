import * as wh from "@certusone/wormhole-sdk";

const RPC_HOSTS: string[] = [
  /* ...*/
];

export async function getVAA(
  emitter: string,
  sequence: string,
  chainId: wh.ChainId
): Promise<Buffer> {
  // Wait for the VAA to be ready and fetch it from
  // the guardian network
  const { vaaBytes } = await wh.getSignedVAAWithRetry(
    RPC_HOSTS,
    chainId,
    emitter,
    sequence
  );
  // return the raw bytes, may be parsed later
  return Buffer.from(vaaBytes);
}
