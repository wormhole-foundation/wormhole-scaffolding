import {JsonRpcProvider, SuiExecuteTransactionResponse} from "@mysten/sui.js";
import {execSync} from "child_process";
import * as fs from "fs";

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
      return [key.name, valueObject.value.fields.data];
    })
  );

  return tableTuples;
}

export async function getCreatedFromTransaction(
  txResponse: SuiExecuteTransactionResponse
) {
  if ("EffectsCert" in txResponse) {
    const created = txResponse.EffectsCert.effects.effects.created;
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
  if ("EffectsCert" in txResponse && "certificate" in txResponse.EffectsCert) {
    return provider
      .getEvents(
        {
          Transaction: txResponse.EffectsCert.certificate.transactionDigest,
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

    use token_bridge::wrapped::create_wrapped_coin;

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
rev = "2d709054a08d904b9229a2472af679f210af3827"

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
  const jsonOutput = JSON.parse(output.split("\n")[2])[0];

  // Finally purge the tmp directory
  fs.rmSync(tmpDir, {recursive: true, force: true});

  return {
    id: jsonOutput.id,
    owner: jsonOutput.owner,
    type: jsonOutput.type,
  };
}
