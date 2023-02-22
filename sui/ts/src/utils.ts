import {
  JsonRpcProvider,
  RawSigner,
  SuiExecuteTransactionResponse,
} from "@mysten/sui.js";
import {execSync} from "child_process";
import {ethers} from "ethers";
import {WORMHOLE_STATE_ID} from "../tests/helpers";
import * as fs from "fs";

export function computeRelayerFee(
  amount: number,
  relayerFee: number,
  relayerFeePrecision: number
) {
  return Math.floor((amount * relayerFee) / relayerFeePrecision);
}

export async function getWormholeFeeCoins(
  provider: JsonRpcProvider,
  signer: RawSigner
) {
  // Fetch Sui coin object.
  const [sui] = await provider
    .getCoins(await signer.getAddress(), "0x2::sui::SUI")
    .then((result) => result.data);

  // Fetch the wormhole sate.
  const fields = await getObjectFields(provider, WORMHOLE_STATE_ID);

  // Split the Sui object based on the wormhole fee.
  const splitSuiCoin = await signer
    .splitCoin({
      coinObjectId: sui.coinObjectId,
      splitAmounts: [Number(fields.message_fee)],
      gasBudget: 1000,
    })
    .then(async (tx) => {
      const created = await getCreatedFromTransaction(tx).then(
        (objects) => objects[0]
      );
      return "reference" in created ? created.reference.objectId : null;
    });

  return splitSuiCoin;
}

export async function getRegisteredAssetInfo(
  provider: JsonRpcProvider,
  ownerId: string,
  assetType: string
) {
  // Check registered asset.
  const dynamicTokensData = await provider
    .getDynamicFields(ownerId)
    .then((result) => result.data);

  const dynamicItem = dynamicTokensData.find((item) =>
    item.name.includes(assetType)
  );

  // Throw error if the dynamic object is not found.
  if (dynamicItem == undefined) {
    Promise.reject("Asset info not found.");
  }

  // Fetch the asset info.
  const assetInfo = await provider
    .getDynamicFieldObject(ownerId, dynamicItem!.name)
    .then((result) => {
      if (
        typeof result.details !== "string" &&
        "data" in result.details &&
        "fields" in result.details.data
      ) {
        return result.details.data.fields;
      } else {
        return null;
      }
    });

  return assetInfo;
}

export async function getObjectFields(
  provider: JsonRpcProvider,
  objectId: string
) {
  const objectInfo = await provider.getObject(objectId);
  if (
    typeof objectInfo !== "string" &&
    "details" in objectInfo &&
    typeof objectInfo.details !== "string" &&
    "data" in objectInfo.details &&
    "fields" in objectInfo.details.data
  ) {
    return objectInfo.details.data.fields;
  }

  return Promise.reject("not shared object");
}

export async function getDynamicObjectFields(
  provider: JsonRpcProvider,
  parentId: string,
  childName: string
) {
  const dynamicObjectFieldInfo = await provider
    .getDynamicFieldObject(parentId, childName)
    .then((result) => {
      if (
        typeof result.details !== "string" &&
        "data" in result.details &&
        "fields" in result.details.data
      ) {
        return result.details.data;
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
  childName: string
) {
  const dynamicObjectInfo = await getDynamicObjectFields(
    provider,
    parentId,
    childName
  );

  // Fetch the table's keys
  const keys = await provider
    .getDynamicFields(dynamicObjectInfo!.fields.id.id)
    .then((result) => result.data);

  if (keys.length == 0) {
    return Promise.reject("dynamic field not found");
  }

  // Create array of key value pairs
  const tableTuples = await Promise.all(
    keys.map(async (key) => {
      // Fetch the value
      const valueObject = await getObjectFields(provider, key.objectId);
      return [key.name, valueObject.value.fields];
    })
  );

  return tableTuples;
}

export async function getCreatedFromTransaction(
  txResponse: SuiExecuteTransactionResponse
) {
  if ("effects" in txResponse) {
    const created = txResponse.effects.effects.created;
    if (created !== undefined) {
      return created;
    }
  }

  return Promise.reject("no created objects in transaction response");
}

export async function getEventsFromTransaction(
  provider: JsonRpcProvider,
  txResponse: SuiExecuteTransactionResponse
) {
  if ("certificate" in txResponse) {
    return provider
      .getEvents(
        {
          Transaction: txResponse.certificate!.transactionDigest,
        },
        null,
        null
      )
      .then((result) => result.data);
  }

  return Promise.reject("no effects found in transaction response");
}

export async function getMoveEventsFromTransaction(
  provider: JsonRpcProvider,
  txResponse: SuiExecuteTransactionResponse
) {
  const events = await getEventsFromTransaction(provider, txResponse).then(
    (events) => events.map((evt) => evt.event)
  );

  const moveEvents = [];
  for (const event of events) {
    if ("moveEvent" in event) {
      moveEvents.push(event.moveEvent);
    }
  }
  return moveEvents;
}

export interface DeployedWrappedCoin {
  id: string;
  owner: string;
  type: string;
}

export function buildAndDeployWrappedCoin(
  wormholeId: string,
  tokenBridgeId: string,
  fullPathToTokenBridgeDependency: string,
  vaa: Uint8Array | Buffer,
  deployCommand: string,
  clientConfig?: string
): DeployedWrappedCoin {
  // Create source
  const buf = Buffer.isBuffer(vaa) ? vaa : Buffer.from(vaa);
  const coinMoveSource = `module template::wrapped_coin {
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    use token_bridge::create_wrapped::create_wrapped_coin;

    struct WRAPPED_COIN has drop {}

    fun init(coin_witness: WRAPPED_COIN, ctx: &mut TxContext) {
        let vaa_bytes = x"${buf.toString("hex")}";

        let wrapped = create_wrapped_coin(
          vaa_bytes,
          coin_witness,
          ctx
        );
        transfer::transfer(
            wrapped,
            tx_context::sender(ctx)
        );
    }

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(COIN_WITNESS {}, ctx)
    }
}`;

  // Create Move.toml
  const moveToml = `[package]
name = "Template"
version = "0.69.420"

[dependencies.Sui]
git = "https://github.com/MystenLabs/sui.git"
subdir = "crates/sui-framework"
rev = "0fe3e5c237f2f6410c66617cede5733015a17a36"

[dependencies.TokenBridge]
local = "${fullPathToTokenBridgeDependency}"

[addresses]
wormhole = "${wormholeId}"
token_bridge = "${tokenBridgeId}"
template = "0x0"`;

  // Make tmp directory
  const now = Number(Date.now());
  const homeDir = require("os").homedir();
  const tmpDir = `${homeDir}/.tmp_wrapped_coin.${now}`;
  const tmpSources = `${tmpDir}/sources`;
  fs.mkdirSync(tmpSources, {recursive: true});

  // Write `coinMoveSource` to this sources directory
  fs.writeFileSync(`${tmpSources}/create.move`, coinMoveSource, "utf-8");

  // Write Move.toml
  fs.writeFileSync(`${tmpDir}/Move.toml`, moveToml, "utf-8");

  // Build and deploy
  let fullDeployCommand: string;
  if (clientConfig === undefined) {
    fullDeployCommand = `${deployCommand} ${tmpDir} --json`;
  } else {
    fullDeployCommand = `${deployCommand} ${tmpDir} -c ${clientConfig} --json`;
  }

  // Parse deployment output
  const output = execSync(fullDeployCommand, {
    encoding: "utf8",
  });

  const jsonOutput = JSON.parse(output.split("\n")[3])[0];

  // Finally purge the tmp directory
  fs.rmSync(tmpDir, {recursive: true, force: true});

  return {
    id: jsonOutput.id,
    owner: jsonOutput.owner,
    type: jsonOutput.type,
  };
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

export function tokenBridgeTransform(
  amount: ethers.BigNumber,
  decimals: number
): ethers.BigNumber {
  return tokenBridgeDenormalizeAmount(
    tokenBridgeNormalizeAmount(amount, decimals),
    decimals
  );
}
