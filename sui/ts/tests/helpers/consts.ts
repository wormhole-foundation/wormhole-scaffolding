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

// hello token
export const HELLO_TOKEN_ID = process.env.TESTING_HELLO_TOKEN_ID!;
export const HELLO_TOKEN_OWNER_CAP_ID =
  process.env.TESTING_HELLO_TOKEN_CREATOR_CAPABILITY_ID!;

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

// foreign
export const ETHEREUM_TOKEN_BRIDGE_ADDRESS =
  "0x3ee18B2214AFF97000D974cf647E7C347E8fa585";
export const WETH_ID = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// governance
export const GOVERNANCE_CHAIN = "1";
export const GOVERNANCE_EMITTER_ID =
  "0000000000000000000000000000000000000000000000000000000000000004";
