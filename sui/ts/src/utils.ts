import {JsonRpcProvider} from "@mysten/sui.js";
import {WORMHOLE_STATE_ID} from "./consts";

export async function getWormholeFee(provider: JsonRpcProvider) {
  // Fetch the wormhole state fields.
  const fields = await getObjectFields(provider, WORMHOLE_STATE_ID);

  if (fields === null) {
    Promise.reject("State object not found.");
  }

  // Cache wormhole fee.
  return fields!.fee_collector.fields.fee_amount;
}

interface HelloTokenMessage {
  payloadType: number;
  recipient: string;
}

export function parseHelloTokenPayload(payload: Buffer): HelloTokenMessage {
  let relay: HelloTokenMessage = {} as HelloTokenMessage;

  // Parse the additional payload.
  relay.payloadType = payload.readUint8(133);
  relay.recipient = "0x" + payload.subarray(134, 166).toString("hex");
  return relay;
}

export function calculateRelayerFee(
  transferAmount: number,
  state: any
): number {
  const fee = state!.relayer_fee.fields;
  const value = Number(fee.value);
  const precision = Number(fee.precision);

  return Math.floor((value * transferAmount) / precision);
}

export function createHelloTokenPayload(recipient: string): string {
  const payloadType = "0x01";

  if (recipient.substring(0, 2) != "0x" || recipient.length != 66) {
    throw Error("Invalid recipient parameter");
  }

  return payloadType + recipient.substring(2);
}

export function getWormholeEvents(result: any) {
  if ("events" in result) {
    let wormholeEvents = [];
    for (const event of result.events!) {
      if (event.type.includes("WormholeMessage")) {
        wormholeEvents.push(event);
      }
    }
    return wormholeEvents;
  } else {
    return null;
  }
}

export async function getObjectFields(
  provider: JsonRpcProvider,
  objectId: string
) {
  // Fetch object.
  const result = await provider.getObject({
    id: objectId,
    options: {showContent: true},
  });

  if (
    typeof result.data!.content !== "string" &&
    "fields" in result.data!.content!
  ) {
    return result.data!.content.fields;
  } else {
    return null;
  }
}

export async function getDynamicObjectFields(
  provider: JsonRpcProvider,
  parentId: string,
  childName: any
) {
  const dynamicObjectFieldInfo = await provider
    .getDynamicFieldObject({
      parentId: parentId,
      name: childName,
    })
    .then((result) => {
      if (
        typeof result.data!.content !== "string" &&
        "content" in result.data! &&
        "fields" in result.data!.content!
      ) {
        return result.data?.content;
      } else {
        return null;
      }
    });

  if (dynamicObjectFieldInfo === null) {
    return Promise.reject("invalid dynamic object field");
  }

  return dynamicObjectFieldInfo;
}

export async function getTableFromDynamicObjectField(
  provider: JsonRpcProvider,
  parentId: string,
  childName: any
) {
  const dynamicObjectInfo = await getDynamicObjectFields(
    provider,
    parentId,
    childName
  );

  // Fetch the table's keys
  const keys = await provider
    .getDynamicFields({parentId: dynamicObjectInfo!.fields.id.id})
    .then((result) => result.data);

  if (keys.length == 0) {
    return Promise.reject("dynamic field not found");
  }

  // Create array of key value pairs
  const tableTuples = await Promise.all(
    keys.map(async (key) => {
      // Fetch the value
      const valueObject = await getObjectFields(provider, key.objectId);
      return [key.name.value, valueObject!.value];
    })
  );

  return tableTuples;
}

export async function getCoinWithHighestBalance(
  provider: JsonRpcProvider,
  walletAddress: string,
  coinType: string
) {
  const coins = await provider
    .getCoins({
      owner: walletAddress,
      coinType: coinType,
    })
    .then((result) => result.data);

  if (coins.length == 0) {
    return Promise.reject("no coins with balance found");
  }

  let balanceMax = 0;
  let index = 0;

  // Find the coin with the highest balance.
  for (let i = 0; i < coins.length; i++) {
    let balance = parseInt(coins[i].balance);
    if (balance > balanceMax) {
      balanceMax = balance;
      index = i;
    }
  }

  return coins[index];
}

export async function getTableByName(
  provider: JsonRpcProvider,
  stateId: string,
  fieldName: string
) {
  // Fetch relayer state dynamic fields.
  const dynamicField = await provider
    .getDynamicFields({parentId: stateId})
    .then((result) =>
      result.data.filter((name) =>
        Buffer.from(name.name.value).toString().includes(fieldName)
      )
    );

  if (dynamicField.length === null) {
    return Promise.reject("table not found");
  }

  // Fetch the `relayer_fee` dynamic field.
  const relayerFees = await getTableFromDynamicObjectField(
    provider,
    stateId,
    dynamicField[0].name!
  );

  return relayerFees;
}

export function tokenBridgeNormalizeAmount(
  amount: number,
  decimals: number
): number {
  if (decimals > 8) {
    amount = amount / 10 ** (decimals - 8);
  }
  return Math.floor(amount);
}

export function getBalanceChangeFromTransaction(
  wallet: string,
  coinType: string,
  balanceChanges: any
): number {
  const result = balanceChanges.filter(
    (result: any) =>
      result.owner.AddressOwner == wallet &&
      (result.coinType == coinType ||
        result.coinType.includes(coinType.substring(3)))
  );

  if (result.length != 1) {
    throw Error("could not find balance");
  }

  return Math.abs(parseInt(result[0].amount));
}
