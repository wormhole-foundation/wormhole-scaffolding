import {expect} from "chai";
import {ethers} from "ethers";
import {MockGuardians} from "@certusone/wormhole-sdk/lib/cjs/mock";
import {CHAIN_ID_ETH, CHAIN_ID_AVAX, tryNativeToHexString} from "@certusone/wormhole-sdk";
import {
  LOCALHOST,
  WORMHOLE_ADDRESS,
  HELLO_WORLD_ADDRESS,
  WALLET_PRIVATE_KEY,
  GUARDIAN_SET_INDEX,
  GUARDIAN_PRIVATE_KEY,
} from "./helpers/consts";
import {makeContract} from "./helpers/io";
import {formatWormholeMessageFromReceipt} from "./helpers/utils";

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
    const targetContractChainId = CHAIN_ID_ETH;

    // HelloWorld message to send and receive
    const helloWorldMessage = "HelloSolana";

    // simulated guardian that signs wormhole messages
    const guardians = new MockGuardians(GUARDIAN_SET_INDEX, [GUARDIAN_PRIVATE_KEY]);

    // placeholder for signed HelloWorld message
    let signedHelloWorldMessage: ethers.BytesLike;

    it("Verify Contract Deployment", async () => {
      expect(helloWorld.address).to.equal(HELLO_WORLD_ADDRESS);

      // confirm chainId
      const deployedChainId = await helloWorld.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_AVAX);
    });

    it("Should Register HelloWorld Contract Emitter", async () => {
      // Convert the target contract address to bytes32, since other
      // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
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
        .sendMessage(helloWorldMessage)
        .then((tx: ethers.ContractTransaction) => tx.wait());

      // Simulate signing the VAA with the mock guardian. The emitterChainId needs to be
      // the target chainId to simulate receiving a message from a registered emitter on
      // a different chain.
      const unsignedMessages = await formatWormholeMessageFromReceipt(receipt, targetContractChainId);
      expect(unsignedMessages.length).to.equal(1);

      signedHelloWorldMessage = guardians.addSignatures(unsignedMessages[0], [0]);
    });

    it("Should Receive HelloWorld Message", async () => {
      // invoke the receiveMessage on the "target contract"
      await helloWorld.receiveMessage(signedHelloWorldMessage).then((tx: ethers.ContractTransaction) => tx.wait());

      // parse the verified message by calling the wormhole core endpoint `parseVM`.
      const parsedVerifiedMessage = await wormhole.parseVM(signedHelloWorldMessage);

      // Query the contract using the verified message's hash to confirm that the correct payload
      // was saved in storage.
      const storedMessage = await helloWorld.getReceivedMessage(parsedVerifiedMessage.hash);
      expect(storedMessage).to.equal(helloWorldMessage);

      // confirm that the contract marked the message as "consumed"
      const isMessageConsumed = await helloWorld.isMessageConsumed(parsedVerifiedMessage.hash);
      expect(isMessageConsumed).to.be.true;
    });

    it("Should Only Receive Signed Message Once", async () => {
      try {
        // invoke the receiveMessage again and confirm that it fails
        await helloWorld.receiveMessage(signedHelloWorldMessage).then((tx: ethers.ContractTransaction) => tx.wait());
      } catch (error: any) {
        expect(error.error.reason).to.equal("execution reverted: message already consumed");
      }
    });
  });
});
