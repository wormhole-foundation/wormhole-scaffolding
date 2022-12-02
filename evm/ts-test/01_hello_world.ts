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
  readHelloWorldContractAddress,
} from "./helpers/utils";
import {HelloWorld__factory, IWormhole__factory} from "./src/ethers-contracts";

describe("Hello World Test", () => {
  // create signer
  const provider = new ethers.providers.StaticJsonRpcProvider(AVAX_HOST);
  const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

  // HelloWorld contract address
  const helloWorldAddress = readHelloWorldContractAddress(FORK_AVAX_CHAIN_ID);

  // contracts
  const wormhole = IWormhole__factory.connect(AVAX_WORMHOLE_ADDRESS, wallet);
  const helloWorld = HelloWorld__factory.connect(helloWorldAddress, wallet);

  // Create dummy variables for target contract info. This is to show that
  // the HelloWorld contracts should be registered with contracts on a different chain.
  const targetContractAddress = helloWorld.address;
  const targetContractChainId = CHAIN_ID_ETH;

  describe("Test Contract Deployment and Emitter Registeration", () => {
    it("Verify Contract Deployment", async () => {
      expect(helloWorld.address).to.equal(helloWorldAddress);

      // confirm chainId
      const deployedChainId = await helloWorld.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_AVAX);
    });

    it("Should Register HelloWorld Contract Emitter", async () => {
      // Convert the target contract address to bytes32, since other
      // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
      const targetContractAddressHex =
        "0x" +
        tryNativeToHexString(targetContractAddress, targetContractChainId);

      // register the emitter
      await helloWorld
        .registerEmitter(targetContractChainId, targetContractAddressHex)
        .then((tx: ethers.ContractTransaction) => tx.wait());

      // query the contract and confirm that the emitter is set in contract storage
      const emitterInContractState = await helloWorld.getRegisteredEmitter(
        targetContractChainId
      );
      expect(emitterInContractState).to.equal(targetContractAddressHex);
    });
  });

  describe("Test HelloWorld Interface", () => {
    // HelloWorld message to send and receive
    const helloWorldMessage = "HelloSolana";

    // simulated guardian that signs wormhole messages
    const guardians = new MockGuardians(AVAX_WORMHOLE_GUARDIAN_SET_INDEX, [
      GUARDIAN_PRIVATE_KEY,
    ]);

    // placeholder for signed HelloWorld message
    let signedHelloWorldMessage: ethers.BytesLike;

    it("Should Send HelloWorld Message", async () => {
      // invoke the HelloWorld contract to emit the HelloWorld wormhole message
      const receipt: ethers.ContractReceipt = await helloWorld
        .sendMessage(helloWorldMessage)
        .then((tx: ethers.ContractTransaction) => tx.wait());

      // Simulate signing the VAA with the mock guardian. The emitterChainId needs to be
      // the target chainId to simulate receiving a message from a registered emitter on
      // a different chain.
      const unsignedMessages = await formatWormholeMessageFromReceipt(
        receipt,
        targetContractChainId
      );
      expect(unsignedMessages.length).to.equal(1);

      signedHelloWorldMessage = guardians.addSignatures(unsignedMessages[0], [
        0,
      ]);
    });

    it("Should Receive HelloWorld Message", async () => {
      // invoke the receiveMessage on the "target contract"
      await helloWorld
        .receiveMessage(signedHelloWorldMessage)
        .then((tx: ethers.ContractTransaction) => tx.wait());

      // parse the verified message by calling the wormhole core endpoint `parseVM`.
      const parsedVerifiedMessage = await wormhole.parseVM(
        signedHelloWorldMessage
      );

      // Query the contract using the verified message's hash to confirm that the correct payload
      // was saved in storage.
      const storedMessage = await helloWorld.getReceivedMessage(
        parsedVerifiedMessage.hash
      );
      expect(storedMessage).to.equal(helloWorldMessage);

      // confirm that the contract marked the message as "consumed"
      const isMessageConsumed = await helloWorld.isMessageConsumed(
        parsedVerifiedMessage.hash
      );
      expect(isMessageConsumed).to.be.true;
    });

    it("Should Only Receive Signed Message Once", async () => {
      try {
        // invoke the receiveMessage again and confirm that it fails
        await helloWorld
          .receiveMessage(signedHelloWorldMessage)
          .then((tx: ethers.ContractTransaction) => tx.wait());
      } catch (error: any) {
        expect(error.error.reason).to.equal(
          "execution reverted: message already consumed"
        );
      }
    });
  });
});
