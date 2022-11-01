import { Connection, PublicKeyInitData, PublicKey } from "@solana/web3.js";
import { Program, Provider } from "@project-serum/anchor";

import { HelloToken } from "../../../target/types/hello_token";

import IDL from "../../../target/idl/hello_token.json";

export function createHelloTokenProgramInterface(
  connection: Connection,
  programId: PublicKeyInitData,
  payer?: PublicKeyInitData
): Program<HelloToken> {
  const provider: Provider = {
    connection,
    publicKey: payer == undefined ? undefined : new PublicKey(payer),
  };
  return new Program<HelloToken>(
    IDL as any,
    new PublicKey(programId),
    provider
  );
}
