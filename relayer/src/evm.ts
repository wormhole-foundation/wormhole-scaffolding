// Make sure eth has access to its env vars
require("dotenv").config({
  path: `${__dirname}/../../evm/testing.env`,
  debug: true,
});
import * as ethhw from "../../evm/ts-test/helpers/utils";
import { HelloWorldContract } from "./hello-world-contract";
import * as wh from "@certusone/wormhole-sdk";

async function initProgram(): Promise<string> {
  return "";
}

async function registerEmitter(
  emitterChain: wh.ChainId,
  emitterAddress: string
) {
  return;
}

async function sendMessage(msg: Buffer): Promise<string> {
  return "";
}

async function receiveMessage(vaa: Buffer): Promise<Buffer> {
  return vaa;
}

export const EVMContract: HelloWorldContract = {
  deploy: initProgram,
  registerEmitter,
  send: sendMessage,
  receive: receiveMessage,
};
