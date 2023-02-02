import {
  Ed25519Keypair,
  getObjectFields,
  JsonRpcProvider,
  Network,
  RawSigner,
} from "@mysten/sui.js";
import { execSync } from "child_process";
import yargs from "yargs";
import YAML from "yaml";
import * as fs from "fs";
import { getCreatedFromTransaction } from "../src";

const VERSION = "0.1.0";

async function main() {
  const { provider, signer, packagePath, buildMoveToml, jsonOutput } =
    await setUp();

  const existingMoveToml = `${packagePath}/Move.toml`;

  // Do we need to swap the toml files?
  let tmpMoveToml;
  if (existingMoveToml !== buildMoveToml) {
    // Generate temporary filename for `existingMoveToml`
    tmpMoveToml = `.tmp.${Number(new Date())}.Move.toml`;

    // In the off-chance this file already exists, bail out.
    if (fs.existsSync(tmpMoveToml)) {
      throw new Error(
        "Generated tmp Move.toml exists already (weird). Try again."
      );
    }

    // Copy `existingMoveToml` as temporary one
    fs.copyFileSync(existingMoveToml, tmpMoveToml);

    // Now copy `buildMoveToml` to where `existingMoveToml` lives.
    fs.copyFileSync(buildMoveToml, existingMoveToml);
  } else {
    tmpMoveToml = null;
  }

  // Try to build contract. If it fails, revert `existingMoveToml`.
  let compiledModules;
  let buildError;
  try {
    compiledModules = JSON.parse(
      execSync(
        `sui move build --dump-bytecode-as-base64 --path ${packagePath}`,
        {
          encoding: "utf8",
        }
      )
    );
    buildError = null;
  } catch (e: any) {
    buildError = e;
    compiledModules = null;
  }

  if (tmpMoveToml !== null) {
    fs.renameSync(tmpMoveToml, existingMoveToml);
  }

  if (buildError !== null) {
    throw new Error(buildError.stdout);
  }

  // Deploy (publish) contract.
  const publishTx = await signer.publish({
    compiledModules: compiledModules,
    gasBudget: 10000,
  });

  const createdObjects = await getCreatedFromTransaction(publishTx);

  let contractAddress = undefined;
  const createdInfos: CreatedInfo[] = [];
  for (const createdObject of createdObjects) {
    let owner: string;
    let objectId: string;
    if (createdObject.owner === "Immutable") {
      owner = "Immutable";
      objectId = createdObject.reference.objectId;
    } else if ("AddressOwner" in createdObject.owner) {
      owner = createdObject.owner.AddressOwner;
      objectId = createdObject.reference.objectId;
    } else {
      continue;
    }

    const created = await provider.getObject(objectId);
    if (typeof created.details !== "string" && "data" in created.details) {
      if ("dataType" in created.details.data) {
        if (created.details.data.dataType === "package") {
          contractAddress = created.details.reference.objectId;
        } else if ("type" in created.details.data) {
          createdInfos.push({
            owner,
            id: objectId,
            type: created.details.data.type,
          });
        }
      }
    }
  }

  if (createdInfos.length > 0 && contractAddress !== undefined) {
    if (jsonOutput) {
      console.log(JSON.stringify(createdInfos));
    } else {
      console.log(
        "--------------------------------------------------------------------------------"
      );
      console.log(
        `Deployed \x1b[33m\`${packagePath}\`\x1b[0m to\x1b[36m\ ${contractAddress}\x1b[0m`
      );
      console.log();
      let count = 0;
      for (const { id, owner, type } of createdInfos) {
        console.log(`  \x1b[33m\Created\x1b[0m  ${type}`);
        console.log(`    \x1b[33m\Owner\x1b[0m  ${owner}`);
        console.log(`       \x1b[33m\ID\x1b[0m \x1b[36m\ ${id}\x1b[0m`);
        if (count < createdInfos.length - 1) {
          console.log();
        }
        ++count;
      }
      console.log(
        "--------------------------------------------------------------------------------"
      );
    }
  }
}

main();

// helpers

interface DeploySetup {
  provider: JsonRpcProvider;
  signer: RawSigner;
  packagePath: string;
  buildMoveToml: string;
  jsonOutput: boolean;
}

async function setUp(): Promise<DeploySetup> {
  const args = await yargs
    .strict()
    .version(VERSION)
    .help()
    .option("h", { alias: "help" })
    .option("c", {
      alias: "client-config",
      describe: "Sui Client Config (YAML)",
      default: `${process.env.HOME}/.sui/sui_config/client.yaml`,
      string: true,
    })
    .option("m", {
      alias: "move-toml",
      describe: "Move.toml for building",
      default: "Move.toml",
      string: true,
    })
    .option("n", {
      alias: "network",
      describe: "Network (active_env | localnet | devnet)",
      default: "active_env",
      string: true,
    })
    .option("p", {
      alias: "package-path",
      describe: "path/to/move/package",
      string: true,
      demandOption: true,
    })
    .option("json", {
      describe: "JSON output of deploy details",
      boolean: true,
      default: false,
    })
    .parse();

  // Is packagePath okay?
  const packagePath = args.p;
  if (!fs.existsSync(packagePath)) {
    throw new Error("Invalid package path.");
  }

  // Is Move.toml okay?
  const buildMoveToml = args.m === "Move.toml" ? `${args.p}/${args.m}` : args.m;
  if (!buildMoveToml.endsWith(".toml")) {
    throw new Error("Invalid TOML file.");
  } else if (!fs.existsSync(buildMoveToml)) {
    throw new Error("TOML file does not exist.");
  }

  // We need this config to determine which seed to use to sign for
  // transactions.
  const config = YAML.parse(fs.readFileSync(args.c, { encoding: "utf8" }));

  // Make provider from specified network.
  const provider = (() => {
    const network = args.n == "active_env" ? config["active_env"] : args.n;
    if (network === "localnet") {
      return new JsonRpcProvider(Network.LOCAL);
    } else if (network === "devnet") {
      return new JsonRpcProvider(Network.DEVNET);
    } else {
      throw new Error("Unknown network.");
    }
  })();

  // Create signer using active address.
  const signer = (() => {
    const activeAddress: string = config["active_address"];
    const keypair: Ed25519Keypair = JSON.parse(
      fs.readFileSync(config["keystore"]["File"], { encoding: "utf8" })
    )
      .map((seed: string) =>
        Ed25519Keypair.fromSeed(Buffer.from(seed, "base64").subarray(1))
      )
      .find(
        (keypair: Ed25519Keypair) =>
          // Fun intermixing of addresses with and without 0x.
          keypair.getPublicKey().toSuiAddress() == activeAddress.substring(2)
      );
    return new RawSigner(keypair, provider);
  })();

  // Should we swap out Move.toml before the build?

  return {
    provider,
    signer,
    packagePath,
    buildMoveToml,
    jsonOutput: args.json,
  };
}

interface CreatedInfo {
  id: string;
  owner: string;
  type: string;
}
