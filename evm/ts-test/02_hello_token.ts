import {expect} from "chai";
import {ethers} from "ethers";
import {MockGuardians} from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  CHAIN_ID_ETH,
  CHAIN_ID_AVAX,
  tryNativeToHexString,
} from "@certusone/wormhole-sdk";
import {
  AVAX_HOST,
  AVAX_WORMHOLE_ADDRESS,
  WALLET_PRIVATE_KEY,
  AVAX_WORMHOLE_GUARDIAN_SET_INDEX,
  GUARDIAN_PRIVATE_KEY,
  FORK_AVAX_CHAIN_ID,
} from "./helpers/consts";
import {
  formatWormholeMessageFromReceipt,
  readHelloTokenContractAddress,
} from "./helpers/utils";
import {HelloToken__factory, IWormhole__factory} from "./src/ethers-contracts";

describe("Hello Token Test", () => {
  // create signer
  const provider = new ethers.providers.StaticJsonRpcProvider(AVAX_HOST);
  const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

  // HelloToken contract address
  const helloTokenAddress = readHelloTokenContractAddress(FORK_AVAX_CHAIN_ID);

  // contracts
  const wormhole = IWormhole__factory.connect(AVAX_WORMHOLE_ADDRESS, wallet);
  const helloToken = HelloToken__factory.connect(helloTokenAddress, wallet);

  describe("Test Hello Token Interface", () => {
    // simulated guardian that signs wormhole messages
    const guardians = new MockGuardians(AVAX_WORMHOLE_GUARDIAN_SET_INDEX, [
      GUARDIAN_PRIVATE_KEY,
    ]);

    it("Verify Contract Deployment", async () => {
      expect(helloToken.address).to.equal(helloTokenAddress);

      // confirm chainId
      const deployedChainId = await helloToken.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_AVAX);
    });
  });
});
