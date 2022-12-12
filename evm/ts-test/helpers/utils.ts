import {ethers} from "ethers";
import {ChainId, tryNativeToHexString} from "@certusone/wormhole-sdk";
import {WORMHOLE_MESSAGE_EVENT_ABI, WORMHOLE_TOPIC} from "./consts";
import * as fs from "fs";

export function readHelloWorldContractAddress(chain: number): string {
  return JSON.parse(
    fs.readFileSync(
      `${__dirname}/../../broadcast/deploy_01_hello_world.sol/${chain}/run-latest.json`,
      "utf-8"
    )
  ).transactions[0].contractAddress;
}

export function readHelloTokenContractAddress(chain: number): string {
  return JSON.parse(
    fs.readFileSync(
      `${__dirname}/../../broadcast/deploy_02_hello_token.sol/${chain}/run-latest.json`,
      "utf-8"
    )
  ).transactions[0].contractAddress;
}

export function readWormUSDContractAddress(chain: number): string {
  return JSON.parse(
    fs.readFileSync(
      `${__dirname}/../../broadcast/deploy_wormUSD.sol/${chain}/run-latest.json`,
      "utf-8"
    )
  ).transactions[0].contractAddress;
}

export async function parseWormholeEventsFromReceipt(
  receipt: ethers.ContractReceipt
): Promise<ethers.utils.LogDescription[]> {
  // create the wormhole message interface
  const wormholeMessageInterface = new ethers.utils.Interface(
    WORMHOLE_MESSAGE_EVENT_ABI
  );

  // loop through the logs and parse the events that were emitted
  let logDescriptions: ethers.utils.LogDescription[] = [];
  for (const log of receipt.logs) {
    if (log.topics.includes(WORMHOLE_TOPIC)) {
      logDescriptions.push(wormholeMessageInterface.parseLog(log));
    }
  }
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

export function tokenBridgeNormalizeAmount(
  amount: ethers.BigNumber,
  decimals: number
): ethers.BigNumber {
  if (decimals > 8) {
    amount = amount.div(10 ** (decimals - 8));
  }
  return amount;
}

export function tokenBridgeDenormalizeAmount(
  amount: ethers.BigNumber,
  decimals: number
): ethers.BigNumber {
  if (decimals > 8) {
    amount = amount.mul(10 ** (decimals - 8));
  }
  return amount;
}
