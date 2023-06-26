import * as mock from '@certusone/wormhole-sdk/lib/cjs/mock'

import * as wh from "@certusone/wormhole-sdk";


const RPC_HOSTS: string[] = [
    "http://localhost:7070"
];


export const MOCK_GUARDIANS =
  new mock.MockGuardians(0, ["cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0"]);

const guardianSign = (message: Buffer) =>
  MOCK_GUARDIANS.addSignatures(message, [0])

export async function getVAA(
  chainId: wh.ChainId,
  emitter: string,
  sequence: string,
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


export async function fakeVAA(chainId: wh.ChainId, emitter: string, message: Buffer): Promise<Buffer> {
    const mockEmitter = new mock.MockEmitter(emitter, chainId);

    const createPayload = () => {
      const length = message.length;
      const buf = Buffer.alloc(3 + length);
      buf.writeUint8(1, 0);
      buf.writeUint16BE(length, 1);
      message.copy(buf, 3);
      return buf;
    };

    const finality = 1;
    const batchId = 0;

    return guardianSign(mockEmitter.publishMessage(batchId, createPayload(), finality));
}