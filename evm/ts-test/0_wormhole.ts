import { expect } from "chai";
import { ethers } from "ethers";
import { tryNativeToHexString } from "@certusone/wormhole-sdk";
import {
  FORK_CHAIN_ID,
  GUARDIAN_PRIVATE_KEY,
  LOCALHOST,
  WORMHOLE_ADDRESS,
  WORMHOLE_CHAIN_ID,
  WORMHOLE_GUARDIAN_SET_INDEX,
  WORMHOLE_MESSAGE_FEE,
} from "./helpers/consts";
import { makeContract } from "./helpers/io";

describe("Fork Test", () => {
  const provider = new ethers.providers.StaticJsonRpcProvider(LOCALHOST);

  const wormholeAbiPath = `${__dirname}/../out/IWormhole.sol/IWormhole.json`;
  const wormhole = makeContract(provider, WORMHOLE_ADDRESS, wormholeAbiPath);

  describe("Verify AVAX Mainnet Fork", () => {
    it("Chain ID", async () => {
      const network = await provider.getNetwork();
      expect(network.chainId).to.equal(FORK_CHAIN_ID);
    });
  });

  describe("Verify Wormhole Contract", () => {
    it("Chain ID", async () => {
      const chainId = await wormhole.chainId();
      expect(chainId).to.equal(WORMHOLE_CHAIN_ID);
    });

    it("Message Fee", async () => {
      const messageFee: ethers.BigNumber = await wormhole.messageFee();
      expect(messageFee.eq(WORMHOLE_MESSAGE_FEE)).to.be.true;
    });

    it("Guardian Set", async () => {
      // Check guardian set index
      const guardianSetIndex = await wormhole.getCurrentGuardianSetIndex();
      expect(guardianSetIndex).to.equal(WORMHOLE_GUARDIAN_SET_INDEX);

      // Override guardian set
      const abiCoder = ethers.utils.defaultAbiCoder;

      // Get slot for Guardian Set at the current index
      const guardianSetSlot = ethers.utils.keccak256(
        abiCoder.encode(["uint32", "uint256"], [guardianSetIndex, 2])
      );

      // Overwrite all but first guardian set to zero address. This isn't
      // necessary, but just in case we inadvertently access these slots
      // for any reason.
      const numGuardians = await provider
        .getStorageAt(WORMHOLE_ADDRESS, guardianSetSlot)
        .then((value) => ethers.BigNumber.from(value).toBigInt());
      for (let i = 1; i < numGuardians; ++i) {
        await provider.send("anvil_setStorageAt", [
          WORMHOLE_ADDRESS,
          abiCoder.encode(
            ["uint256"],
            [
              ethers.BigNumber.from(
                ethers.utils.keccak256(guardianSetSlot)
              ).add(i),
            ]
          ),
          ethers.utils.hexZeroPad("0x0", 32),
        ]);
      }

      // Now overwrite the first guardian key with the devnet key specified
      // in the function argument.
      const devnetGuardian = new ethers.Wallet(GUARDIAN_PRIVATE_KEY).address;
      await provider.send("anvil_setStorageAt", [
        WORMHOLE_ADDRESS,
        abiCoder.encode(
          ["uint256"],
          [
            ethers.BigNumber.from(ethers.utils.keccak256(guardianSetSlot)).add(
              0 // just explicit w/ index 0
            ),
          ]
        ),
        ethers.utils.hexZeroPad(devnetGuardian, 32),
      ]);

      // Change the length to 1 guardian
      await provider.send("anvil_setStorageAt", [
        WORMHOLE_ADDRESS,
        guardianSetSlot,
        ethers.utils.hexZeroPad("0x1", 32),
      ]);

      // Confirm guardian set override
      const guardians = await wormhole.getGuardianSet(guardianSetIndex).then(
        (guardianSet: any) => guardianSet[0] // first element is array of keys
      );
      expect(guardians.length).to.equal(1);
      expect(guardians[0]).to.equal(devnetGuardian);
    });
  });

  describe("Check wormhole-sdk", () => {
    it("tryNativeToHexString", async () => {
      const accounts = await provider.listAccounts();
      expect(tryNativeToHexString(accounts[0], "ethereum")).to.equal(
        "00000000000000000000000090f8bf6a479f320ead074411a4b0e7944ea8c9c1"
      );
    });
  });
});
