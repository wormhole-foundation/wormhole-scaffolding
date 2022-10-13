import {expect} from "chai";
import {ethers} from "ethers";
import {MockGuardians} from "@certusone/wormhole-sdk/mock";
import {ChainId, CHAIN_ID_AVAX, tryNativeToHexString} from "@certusone/wormhole-sdk";
import {
  LOCALHOST,
  WORMHOLE_ADDRESS,
  HELLO_WORLD_ADDRESS,
  WALLET_PRIVATE_KEY,
  GUARDIAN_SET_INDEX,
  GUARDIAN_PRIVATE_KEY,
} from "./helpers/consts";
import {makeContract} from "./helpers/io";

describe("Hello World Test", () => {
  // create signer
  const provider = new ethers.providers.StaticJsonRpcProvider(LOCALHOST);
  const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

  // contracts
  const wormholeAbiPath = `${__dirname}/../out/IWormhole.sol/IWormhole.json`;
  const wormhole = makeContract(wallet, WORMHOLE_ADDRESS, wormholeAbiPath);

  const helloWorldAbiPath = `${__dirname}/../out/HelloWorld.sol/HelloWorld.json`;
  const helloWorld = makeContract(wallet, HELLO_WORLD_ADDRESS, helloWorldAbiPath);

  describe("Test Hello World Interface", () => {
    // Create dummy variables for target contract info. This is to show that
    // the HelloWorld contracts should be registered with contracts on a different chain.
    const targetContractAddress = helloWorld.address;
    const targetContractChainId = CHAIN_ID_AVAX as ChainId;

    // for signing wormhole messages
    const guardians = new MockGuardians(GUARDIAN_SET_INDEX, [GUARDIAN_PRIVATE_KEY]);

    it("Verify Contract Deployment", async () => {
      expect(helloWorld.address).to.equal(HELLO_WORLD_ADDRESS);

      // confirm chainId
      const deployedChainId = await helloWorld.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_AVAX);
    });

    it("Should Register HelloWorld Contract Emitter", async () => {
      // convert the target contract address to bytes32
      const targetContractAddressHex = "0x" + tryNativeToHexString(targetContractAddress, targetContractChainId);

      // register the emitter
      await helloWorld
        .registerEmitter(targetContractChainId, targetContractAddressHex)
        .then((tx: ethers.ContractTransaction) => tx.wait());

      // query the contract and confirm that the emitter is set in contract storage
      const emitterInContractState = await helloWorld.getRegisteredEmitter(targetContractChainId);
      expect(emitterInContractState).to.equal(targetContractAddressHex);
    });

    it("Should Send HelloWorld Message", async () => {
      // invoke the HelloWorld contract to emit the HelloWorld wormhole message
      const receipt: ethers.ContractReceipt = await helloWorld
        .sendMessage()
        .then((tx: ethers.ContractTransaction) => tx.wait());
    });
  });
});
