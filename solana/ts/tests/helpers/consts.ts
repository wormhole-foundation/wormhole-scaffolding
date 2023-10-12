import { PublicKey, Keypair } from "@solana/web3.js";
import { CONTRACTS } from "@certusone/wormhole-sdk";
import { MockGuardians } from "@certusone/wormhole-sdk/lib/cjs/mock";

export const NETWORK = "MAINNET";

export const WORMHOLE_CONTRACTS = CONTRACTS[NETWORK];
export const CORE_BRIDGE_PID = new PublicKey(WORMHOLE_CONTRACTS.solana.core);
export const TOKEN_BRIDGE_PID = new PublicKey(WORMHOLE_CONTRACTS.solana.token_bridge);

export const LOCALHOST = "http://localhost:8899";

export const PAYER_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from([
  232, 33, 124, 16, 208, 115, 111, 65, 155, 7, 36, 225, 29, 33, 239, 179, 255,
  29, 24, 173, 5, 59, 132, 255, 248, 85, 146, 109, 119, 235, 135, 96, 194, 145,
  178, 87, 185, 99, 164, 121, 187, 197, 165, 106, 166, 82, 84, 148, 166, 215, 8,
  230, 40, 255, 42, 214, 28, 134, 121, 201, 157, 42, 252, 165,
]));
export const RELAYER_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from([
  209, 193, 148, 98, 190, 29, 112, 141, 167, 133, 181, 253, 103, 0, 148, 205,
  111, 214, 146, 194, 94, 126, 194, 28, 188, 221, 72, 105, 190, 41, 91, 39, 237,
  124, 31, 221, 91, 218, 22, 33, 230, 41, 14, 203, 176, 164, 200, 245, 31, 19,
  161, 61, 30, 188, 11, 120, 155, 236, 178, 241, 114, 240, 67, 3,
]));

//this is the WETH mainnet address - but any address will do for local testing
export const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

export const GOVERNANCE_EMITTER_ADDRESS = new PublicKey("11111111111111111111111111111115");

export const MOCK_GUARDIANS =
  new MockGuardians(0, ["cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0"]);

export const MINTS_WITH_DECIMALS =
  new Map<number, {privateKey: Uint8Array; publicKey: PublicKey}>([
  [
    8,
    {
      privateKey: Uint8Array.from([
        129, 227, 235, 186, 104, 13, 185, 244, 16, 185, 108, 95, 83, 214, 115, 244,
        194, 207, 250, 150, 180, 86, 70, 198, 97, 40, 71, 3, 26, 185, 48, 222, 226,
        136, 99, 75, 72, 182, 148, 76, 211, 140, 155, 55, 62, 44, 71, 127, 72, 42,
        114, 4, 86, 16, 64, 54, 37, 143, 66, 162, 104, 70, 220, 47,
      ]),
      publicKey: new PublicKey("GFHmBkLYsPSiWbqGD54VmmVKDs9shYVdFnHuNRu1QhTL"),
    },
  ],
  [
    9,
    {
      privateKey: Uint8Array.from([
        98, 139, 243, 120, 236, 152, 36, 219, 202, 42, 72, 178, 107, 155, 181, 134,
        120, 36, 55, 108, 253, 218, 96, 139, 80, 99, 85, 54, 116, 145, 94, 40, 227,
        10, 159, 48, 118, 75, 67, 84, 239, 36, 177, 138, 6, 214, 73, 149, 26, 100,
        255, 28, 218, 167, 251, 229, 93, 236, 25, 225, 152, 104, 223, 54,
      ]),
      publicKey: new PublicKey("GHGwbrTCsynp7yJ9keowy2Roe5DzxFbayAaAwLyAvRKj"),
    }
  ]
]);
