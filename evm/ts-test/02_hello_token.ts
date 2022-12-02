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
  AVAX_WORMHOLE_GUARDIAN_SET_INDEX,
  FORK_AVAX_CHAIN_ID,
  ETH_HOST,
  ETH_WORMHOLE_ADDRESS,
  FORK_ETH_CHAIN_ID,
  WALLET_PRIVATE_KEY,
  GUARDIAN_PRIVATE_KEY,
} from "./helpers/consts";
import {
  formatWormholeMessageFromReceipt,
  readHelloTokenContractAddress,
} from "./helpers/utils";
import {HelloToken__factory, IWormhole__factory} from "./src/ethers-contracts";

describe("Hello Token Test", () => {
  // create avax signer
  const avaxProvider = new ethers.providers.StaticJsonRpcProvider(AVAX_HOST);
  const avaxWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, avaxProvider);

  // avax contracts
  const avaxHelloTokenAddress =
    readHelloTokenContractAddress(FORK_AVAX_CHAIN_ID);

  const avaxWormhole = IWormhole__factory.connect(
    AVAX_WORMHOLE_ADDRESS,
    avaxWallet
  );
  const avaxHelloToken = HelloToken__factory.connect(
    avaxHelloTokenAddress,
    avaxWallet
  );

  // create eth signer
  const ethProvider = new ethers.providers.StaticJsonRpcProvider(ETH_HOST);
  const ethWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, ethProvider);

  // eth contracts
  const ethHelloTokenAddress = readHelloTokenContractAddress(FORK_ETH_CHAIN_ID);

  const ethWormhole = IWormhole__factory.connect(
    ETH_WORMHOLE_ADDRESS,
    ethWallet
  );
  const ethHelloToken = HelloToken__factory.connect(
    ethHelloTokenAddress,
    ethWallet
  );

  describe("Test Contract Deployment and Emitter Registration", () => {
    it("Verify AVAX Contract Deployment", async () => {
      expect(avaxHelloToken.address).to.equal(avaxHelloTokenAddress);

      // confirm chainId
      const deployedChainId = await avaxHelloToken.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_AVAX);
    });

    it("Verify ETH Contract Deployment", async () => {
      expect(ethHelloToken.address).to.equal(ethHelloTokenAddress);

      // confirm chainId
      const deployedChainId = await ethHelloToken.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_ETH);
    });

    it("Should Register HelloToken Contract Emitter on AVAX", async () => {
      // Convert the target contract address to bytes32, since other
      // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
      const targetContractAddressHex =
        "0x" + tryNativeToHexString(ethHelloTokenAddress, CHAIN_ID_ETH);

      // register the emitter
      await avaxHelloToken
        .registerEmitter(CHAIN_ID_ETH, targetContractAddressHex)
        .then((tx: ethers.ContractTransaction) => tx.wait());

      // query the contract and confirm that the emitter is set in contract storage
      const emitterInContractState = await avaxHelloToken.getRegisteredEmitter(
        CHAIN_ID_ETH
      );
      expect(emitterInContractState).to.equal(targetContractAddressHex);
    });

    it("Should Register HelloToken Contract Emitter on ETH", async () => {
      // Convert the target contract address to bytes32, since other
      // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
      const targetContractAddressHex =
        "0x" + tryNativeToHexString(avaxHelloTokenAddress, CHAIN_ID_AVAX);

      // register the emitter
      await ethHelloToken
        .registerEmitter(CHAIN_ID_AVAX, targetContractAddressHex)
        .then((tx: ethers.ContractTransaction) => tx.wait());

      // query the contract and confirm that the emitter is set in contract storage
      const emitterInContractState = await ethHelloToken.getRegisteredEmitter(
        CHAIN_ID_AVAX
      );
      expect(emitterInContractState).to.equal(targetContractAddressHex);
    });
  });

  describe("Test HelloToken Interface", () => {
    // simulated guardian that signs wormhole messages
    const guardians = new MockGuardians(AVAX_WORMHOLE_GUARDIAN_SET_INDEX, [
      GUARDIAN_PRIVATE_KEY,
    ]);
  });
});
