import { Connection, PublicKeyInitData, PublicKey } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";

import { HelloWorld } from "../../../target/types/hello_world";

import IDL from "../../../target/idl/hello_world.json";

export function createHelloWorldProgramInterface(
  connection: Connection,
  programId: PublicKeyInitData,
  payer?: PublicKeyInitData
): Program<HelloWorld> {
  const provider: Provider = {
    connection,
    publicKey: payer == undefined ? undefined : new PublicKey(payer),
  };
  return new Program<HelloWorld>(
    IDL as any,
    new PublicKey(programId),
    provider
  );
}
