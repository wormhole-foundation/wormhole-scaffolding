// wallets
export const WALLET_PRIVATE_KEY = Buffer.from(
  "AAVVILgsWlDxuSAi2m/8vA9qIsH4MSeAbX2FxzfT/ak9",
  "base64"
).subarray(1);
export const RELAYER_PRIVATE_KEY = Buffer.from(
  "ADqqCLztTLs2jpl/Akh0Vw3ISkCLZ2oN0TFhSTAbqM8E",
  "base64"
).subarray(1);
export const CREATOR_PRIVATE_KEY = Buffer.from(
  "ABbk8FH9fDBUt4XxqfzA2RlRQp1HuiQGmw4J3k7wN172",
  "base64"
).subarray(1);

// wormhole
export const WORMHOLE_ID = process.env.TESTING_WORMHOLE_ID!;
export const WORMHOLE_CREATOR_CAPABILITY_ID =
  process.env.TESTING_WORMHOLE_CREATOR_CAPABILITY_ID!;
export const WORMHOLE_STATE_ID = process.env.TESTING_WORMHOLE_STATE_ID!;
export const WORMHOLE_FEE = "0";

// token bridge
export const TOKEN_BRIDGE_ID = process.env.TESTING_TOKEN_BRIDGE_ID!;
export const TOKEN_BRIDGE_CREATOR_CAPABILITY_ID =
  process.env.TESTING_TOKEN_BRIDGE_CREATOR_CAPABILITY_ID!;
export const TOKEN_BRIDGE_EMITTER_ID =
  process.env.TESTING_TOKEN_BRIDGE_EMITTER_ID!;
export const TOKEN_BRIDGE_STATE_ID = process.env.TESTING_TOKEN_BRIDGE_STATE_ID!;

// guardian signer
export const GUARDIAN_PRIVATE_KEY =
  "cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0";

// example coins
export const EXAMPLE_COINS_ID = process.env.TESTING_EXAMPLE_COINS_ID!;
// 8-decimal coin (COIN_8)
export const COIN_8_TREASURY_ID = process.env.TESTING_COIN_8_TREASURY_ID!;
export const COIN_8_TYPE = `${EXAMPLE_COINS_ID}::coin_8::COIN_8`;
// 9-decimal coin (COIN_9)
export const COIN_9_TREASURY_ID = process.env.TESTING_COIN_9_TREASURY_ID!;
export const COIN_9_TYPE = `${EXAMPLE_COINS_ID}::coin_9::COIN_9`;

// wrapped weth
export const WRAPPED_WETH_COIN_TYPE =
  process.env.TESTING_WRAPPED_WETH_COIN_TYPE!;
export const WRAPPED_WETH_ID = process.env.TESTING_WRAPPED_WETH_ID!;
// testing
export const FUZZ_TEST_ITERATIONS = 64;

// mints
// export const MINT_9_PRIVATE_KEY = Uint8Array.from([
//   98, 139, 243, 120, 236, 152, 36, 219, 202, 42, 72, 178, 107, 155, 181, 134,
//   120, 36, 55, 108, 253, 218, 96, 139, 80, 99, 85, 54, 116, 145, 94, 40, 227,
//   10, 159, 48, 118, 75, 67, 84, 239, 36, 177, 138, 6, 214, 73, 149, 26, 100,
//   255, 28, 218, 167, 251, 229, 93, 236, 25, 225, 152, 104, 223, 54,
// ]);
// export const MINT_WITH_DECIMALS_9 = new PublicKey(
//   "GHGwbrTCsynp7yJ9keowy2Roe5DzxFbayAaAwLyAvRKj"
// );

// export const MINT_8_PRIVATE_KEY = Uint8Array.from([
//   129, 227, 235, 186, 104, 13, 185, 244, 16, 185, 108, 95, 83, 214, 115, 244,
//   194, 207, 250, 150, 180, 86, 70, 198, 97, 40, 71, 3, 26, 185, 48, 222, 226,
//   136, 99, 75, 72, 182, 148, 76, 211, 140, 155, 55, 62, 44, 71, 127, 72, 42,
//   114, 4, 86, 16, 64, 54, 37, 143, 66, 162, 104, 70, 220, 47,
// ]);
// export const MINT_WITH_DECIMALS_8 = new PublicKey(
//   "GFHmBkLYsPSiWbqGD54VmmVKDs9shYVdFnHuNRu1QhTL"
// );

// foreign
export const ETHEREUM_TOKEN_BRIDGE_ADDRESS =
  "0x3ee18B2214AFF97000D974cf647E7C347E8fa585";
export const WETH_ID = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// governance
export const GOVERNANCE_CHAIN = "1";
export const GOVERNANCE_EMITTER_ID =
  "0000000000000000000000000000000000000000000000000000000000000004";
