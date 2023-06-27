process.env.NETWORK = "devnet";
import * as wh from "@certusone/wormhole-sdk";

import { HelloWorldContract } from "./hello-world-contract";
import { getVAA } from "./wormhole";
import { SolanaContract, HELLO_WORLD_PID } from "./solana";
import { EVMContract } from "./evm";

type DeployedContract = {
  client: HelloWorldContract;
  address: string;
};

type ImplementedChain = keyof Pick<typeof wh.CHAINS, "ethereum" | "solana">;

const CONTRACT_CLIENTS: Record<ImplementedChain, DeployedContract> = {
  solana: {
    client: SolanaContract,
    address: wh.getEmitterAddressSolana(HELLO_WORLD_PID),
  },
  ethereum: { client: EVMContract, address: "" },
};

async function main() {
  // First, lets deploy all the contracts we've setup
  // and wait for the other contracts to be registered as emitters
  await deployContracts();

  // Craft a very important message payload
  const msg = Buffer.from("Hello World");

  // Choose a contract through which to send a message
  const srcName: ImplementedChain = "solana";
  const srcContract = CONTRACT_CLIENTS[srcName];

  // Choose a contract to receive the message
  const dstName: ImplementedChain = "ethereum";
  const destContract = CONTRACT_CLIENTS[dstName];

  // Send the message in a transaction that ultimately calls
  // the core bridge to emit it.
  // Parse out the logs to get the sequence number assigned
  const seq = await srcContract.client.send(msg);
  console.log(`Sent a message, which was assigned the sequence id of: ${seq}`);

  // We have the information we need to fetch the VAA
  // from the guardian network or Wormhole API
  // namely: [chain id, emitter address, sequence]
  const vaa = await getVAA(wh.CHAINS[srcName], srcContract.address, seq, msg);
  console.log("Got VAA: ", wh.parseVaa(vaa));

  // Submit the VAA to the destination and wait for confirmation
  const payload = await destContract.client.receive(vaa);
  console.log(`Received ${payload.toString()} in the destination contract`);
}

async function deployContracts() {
  // Deploy all contracts
  for (const [name, contract] of Object.entries(CONTRACT_CLIENTS)) {
    console.log(`Deploying contract for ${name}`);

    CONTRACT_CLIENTS[name as ImplementedChain].address =
      await contract.client.deploy();
  }

  console.log("All contracts deployed, registering emitters");

  for (const [srcName, srcContract] of Object.entries(CONTRACT_CLIENTS)) {
    for (const [dstName, dstContract] of Object.entries(CONTRACT_CLIENTS)) {
      // Don't register a contract with itself
      if (srcName === dstName) continue;

      console.log(
        `Registering ${srcContract.address} for ${srcName} on ${dstName}`
      );

      await dstContract.client.registerEmitter(
        wh.CHAINS[srcName as ImplementedChain],
        srcContract.address
      );
    }
  }

  console.log("Finished deployment an initialization");
}

(async function () {
  await main();
})();
