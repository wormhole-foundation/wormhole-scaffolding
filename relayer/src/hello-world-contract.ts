import * as wh from "@certusone/wormhole-sdk";

// Abstraction of basic functions for the Hello World demo programs
export interface HelloWorldContract {
  // deploy the contract on chain and return the emitter address
  deploy(): Promise<string>;
  // register an emitter for a foreign chain
  registerEmitter(chainId: wh.ChainId, address: string): Promise<void>;
  // sends a message through wormhole, returns a sequence id as a string
  send(msg: Buffer): Promise<string>;
  // redeem a VAA through a transaction invoking this contract
  receive(vaa: Buffer): Promise<Buffer>;
}
