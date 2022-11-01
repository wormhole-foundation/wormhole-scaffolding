import { ethers } from "ethers";
import fs from "fs";

export function makeContract(
  signerOrProvider: ethers.Signer | ethers.providers.Provider,
  contractAddress: string,
  abiPath: string
): ethers.Contract {
  return new ethers.Contract(contractAddress, readAbi(abiPath), signerOrProvider);
}

function readAbi(abiPath: string): any {
  const compiled = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  if (compiled.abi === undefined) {
    throw new Error("compiled.abi === undefined");
  }
  return compiled.abi;
}
