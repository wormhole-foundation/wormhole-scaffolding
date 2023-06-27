// Make sure eth has access to its env vars
require("dotenv").config({
  path: `${__dirname}/../../evm/testing.env`,
  debug: true,
});
import {
  ETH_HOST,
  WALLET_PRIVATE_KEY,
  ETH_WORMHOLE_ADDRESS,
  FORK_ETH_CHAIN_ID,
  ETH_WORMHOLE_CHAIN_ID,
} from "../../evm/ts-test/helpers/consts";
import {
  IWormhole__factory,
  HelloWorld__factory,
} from "../../evm/ts-test/src/ethers-contracts";
import { readHelloWorldContractAddress } from "../../evm/ts-test/helpers/utils";

import { ethers } from "ethers";
import { HelloWorldContract } from "./hello-world-contract";
import * as wh from "@certusone/wormhole-sdk";

const overrides = { gasLimit: ethers.BigNumber.from(10000000), maxFeePerGas: ethers.BigNumber.from(40000000000), maxPriorityFeePerGas: ethers.BigNumber.from(40000000000) };

// eth wallet
const ethProvider = new ethers.providers.StaticJsonRpcProvider(
  "http://localhost:8545"
);
const ethWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, ethProvider);

// wormhole contract
const ETH_WH_ADDR = "0xC89Ce4735882C9F0f0FE26686c53074E09B0D550";
const ethWormhole = IWormhole__factory.connect(ETH_WH_ADDR, ethWallet);

// Our hello world implementation
let ethHelloWorld = HelloWorld__factory.connect(
  readHelloWorldContractAddress(FORK_ETH_CHAIN_ID),
  ethWallet
);

async function deployContract(): Promise<string> {
  //try {
  //  await ethHelloWorld.deployed();
  //  return wh.getEmitterAddressEth(ethHelloWorld.address);
  //} catch (e) {
  //  /*noop*/
  //}

  const hwf = new HelloWorld__factory(ethWallet);
  ethHelloWorld = await hwf.deploy(
    ETH_WH_ADDR,
    wh.CHAIN_ID_ETH,
    200
  );
  console.log(ethHelloWorld.address)
  return wh.getEmitterAddressEth(ethHelloWorld.address);
}

async function registerEmitter(
  emitterChain: wh.ChainId,
  emitterAddress: string
) {
  if (emitterAddress.length < 64) {
    throw new Error(
      `Emitter address should be 64 char (32 bytes as hex), got: ${emitterAddress.length}`
    );
  }

  console.log(emitterChain, emitterAddress)

  // register the emitter
  const receipt = await ethHelloWorld
    .registerEmitter(emitterChain, Buffer.from(emitterAddress, 'hex'), overrides)
    .then((tx: ethers.ContractTransaction) => tx.wait())
    .catch((msg: any) => {
      console.error(msg);
      return null;
    });

  if (receipt === null)
    throw new Error("Registering Emitter failed, null receipt returned");
}

async function sendMessage(msg: Buffer): Promise<string> {

  console.log(ethHelloWorld.address);

  // invoke the HelloWorld contract to emit the HelloWorld wormhole message
  const receipt = await ethHelloWorld
    .sendMessage(msg.toString(), overrides)
    .then((tx: ethers.ContractTransaction) => tx.wait())
    .catch((msg: any) => {
      // should not happen
      console.log(msg);
      return null;
    });

  if (receipt === null)
    throw new Error("Send message failed, null receipt returned");

  return wh.parseSequenceFromLogEth(receipt, ETH_WH_ADDR);
}

async function receiveMessage(vaa: Buffer): Promise<Buffer> {
  // invoke the receiveMessage on the ETH contract
  const receipt = await ethHelloWorld
    .receiveMessage(vaa, overrides)
    .then((tx: ethers.ContractTransaction) => tx.wait())
    .catch((msg: any) => {
      // should not happen
      console.log(msg);
      return null;
    });

  if (receipt === null)
    throw new Error("Receive message failed, null receipt returned");

  // parse the verified message by calling the wormhole core endpoint `parseVM`.
  const parsedVerifiedMessage = await ethWormhole.parseVM(vaa);

  // Query the contract using the verified message's hash to confirm
  // that the correct payload was saved in storage.
  const storedMessage = await ethHelloWorld.getReceivedMessage(
    parsedVerifiedMessage.hash
  );

  return Buffer.from(storedMessage);
}

export const EVMContract: HelloWorldContract = {
  deploy: deployContract,
  registerEmitter,
  send: sendMessage,
  receive: receiveMessage,
};
