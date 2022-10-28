import {ethers} from "ethers";
import {ChainId, tryNativeToHexString} from "@certusone/wormhole-sdk";
import {WORMHOLE_MESSAGE_EVENT_ABI} from "./consts";

export async function parseWormholeEventsFromReceipt(
  receipt: ethers.ContractReceipt
): Promise<ethers.utils.LogDescription[]> {
  // create the wormhole message interface
  const wormholeMessageInterface = new ethers.utils.Interface(WORMHOLE_MESSAGE_EVENT_ABI);

  // loop through the logs and parse the events that were emitted
  const logDescriptions: ethers.utils.LogDescription[] = await Promise.all(
    receipt.logs.map(async (log) => {
      return wormholeMessageInterface.parseLog(log);
    })
  );

  return logDescriptions;
}

export async function formatWormholeMessageFromReceipt(
  receipt: ethers.ContractReceipt,
  emitterChainId: ChainId
): Promise<Buffer[]> {
  // parse the wormhole message logs
  const messageEvents = await parseWormholeEventsFromReceipt(receipt);

  // find VAA events
  if (messageEvents.length == 0) {
    throw new Error("No Wormhole messages found!");
  }

  let results: Buffer[] = [];

  // loop through each event and format the wormhole Observation (message body)
  for (const event of messageEvents) {
    // create a timestamp and find the emitter address
    const timestamp = Math.floor(+new Date() / 1000);
    const emitterAddress: ethers.utils.BytesLike = ethers.utils.hexlify(
      "0x" + tryNativeToHexString(event.args.sender, emitterChainId)
    );

    // encode the observation
    const encodedObservation = ethers.utils.solidityPack(
      ["uint32", "uint32", "uint16", "bytes32", "uint64", "uint8", "bytes"],
      [
        timestamp,
        event.args.nonce,
        emitterChainId,
        emitterAddress,
        event.args.sequence,
        event.args.consistencyLevel,
        event.args.payload,
      ]
    );

    // append the observation to the results buffer array
    results.push(Buffer.from(encodedObservation.substring(2), "hex"));
  }

  return results;
}
