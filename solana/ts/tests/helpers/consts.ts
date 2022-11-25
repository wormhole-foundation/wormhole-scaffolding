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

// mints
export const MINT_PRIVATE_KEY = Uint8Array.from([
  98, 139, 243, 120, 236, 152, 36, 219, 202, 42, 72, 178, 107, 155, 181, 134,
  120, 36, 55, 108, 253, 218, 96, 139, 80, 99, 85, 54, 116, 145, 94, 40, 227,
  10, 159, 48, 118, 75, 67, 84, 239, 36, 177, 138, 6, 214, 73, 149, 26, 100,
  255, 28, 218, 167, 251, 229, 93, 236, 25, 225, 152, 104, 223, 54,
]);
export const MINT = new PublicKey(
  "GHGwbrTCsynp7yJ9keowy2Roe5DzxFbayAaAwLyAvRKj"
);
