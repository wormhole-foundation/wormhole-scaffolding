import { JsonRpcProvider, SuiExecuteTransactionResponse } from "@mysten/sui.js";
import { getMoveEventsFromTransaction } from "./utils";

export interface WormholeMessage {
  emitter: string;
  finality: number;
  batchId: string;
  payload: Buffer;
  emitterId: string;
  sequence: string;
}

export async function getWormholeMessagesFromTransaction(
  provider: JsonRpcProvider,
  wormholeId: string,
  txResponse: SuiExecuteTransactionResponse
) {
  const eventType = `${wormholeId}::state::WormholeMessage`;

  // Event type is contract::module::event_name, but the contract address
  // drops the first zero in the return value. For example:
  //
  // If the contract address is:
  //   "0x08b2feda11e87a94ba96ae86b910828eeeedae04"
  // the type will be:
  //   "0x8b2feda11e87a94ba96ae86b910828eeeedae04::state::WormholeMessage".
  //
  // We need to hack this until Sui pushes a fix for it.
  const badEventType = (() => {
    const check = wormholeId.substring(2);
    let i = 0;
    for (; i < check.length; ++i) {
      if (check[i] != "0") {
        break;
      }
    }
    return `0x${check.substring(i)}::state::WormholeMessage`;
  })();
  const moveEvents = await getMoveEventsFromTransaction(provider, txResponse);

  const messages: WormholeMessage[] = [];
  for (const event of moveEvents) {
    // Lovely unions.
    if (event.type == eventType || event.type == badEventType) {
      const fields = event.fields;
      const message: WormholeMessage = {
        emitter: event.packageId,
        finality: fields.consistency_level,
        batchId: fields.nonce,
        payload: Buffer.from(fields.payload),
        emitterId: fields.sender,
        sequence: fields.sequence,
      };
      messages.push(message);
    }
  }
  return messages;
}
