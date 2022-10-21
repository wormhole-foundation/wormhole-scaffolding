import { PublicKey } from "@solana/web3.js";

// rpc
export const LOCALHOST = "http://localhost:8899";

// wallet
export const PAYER_PRIVATE_KEY = Uint8Array.from([
  232, 33, 124, 16, 208, 115, 111, 65, 155, 7, 36, 225, 29, 33, 239, 179, 255,
  29, 24, 173, 5, 59, 132, 255, 248, 85, 146, 109, 119, 235, 135, 96, 194, 145,
  178, 87, 185, 99, 164, 121, 187, 197, 165, 106, 166, 82, 84, 148, 166, 215, 8,
  230, 40, 255, 42, 214, 28, 134, 121, 201, 157, 42, 252, 165,
]);

// wormhole
export const WORMHOLE_ADDRESS = new PublicKey(
  process.env.TESTING_WORMHOLE_ADDRESS!
);
export const TOKEN_BRIDGE_ADDRESS = new PublicKey(
  process.env.TESTING_TOKEN_BRIDGE_ADDRESS!
);

// guardian signer
export const GUARDIAN_PRIVATE_KEY = process.env.TESTING_DEVNET_GUARDIAN!;

// testing
export const FUZZ_TEST_ITERATIONS = 64;

// programs
export const HELLO_WORLD_ADDRESS = new PublicKey(
  process.env.TESTING_HELLO_WORLD_ADDRESS!
);
export const HELLO_TOKEN_ADDRESS = new PublicKey(
  process.env.TESTING_HELLO_TOKEN_ADDRESS!
);
