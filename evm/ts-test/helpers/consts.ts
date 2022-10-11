import { ethers } from "ethers";

// rpc
export const LOCALHOST = "http://localhost:8545";

// fork
export const FORK_CHAIN_ID = Number(process.env.TESTING_FORK_CHAINID!);

// wormhole
export const WORMHOLE_ADDRESS = process.env.TESTING_WORMHOLE_ADDRESS!;
export const WORMHOLE_CHAIN_ID = Number(process.env.TESTING_WORMHOLE_CHAINID!);
export const WORMHOLE_MESSAGE_FEE = ethers.BigNumber.from(
  process.env.TESTING_WORMHOLE_MESSAGE_FEE!
);
export const WORMHOLE_GUARDIAN_SET_INDEX = Number(
  process.env.TESTING_WORMHOLE_GUARDIAN_SET_INDEX!
);

// signer
export const GUARDIAN_PRIVATE_KEY = process.env.TESTING_DEVNET_GUARDIAN!;
