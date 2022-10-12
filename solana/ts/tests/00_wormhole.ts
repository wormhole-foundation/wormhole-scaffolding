import { web3 } from "@project-serum/anchor";
import { expect } from "chai";
import { Wallet } from "ethers";
import { tryNativeToHexString } from "@certusone/wormhole-sdk";
import {
  createInitializeInstruction,
  getGuardianSet,
  getWormholeInfo,
} from "@certusone/wormhole-sdk/solana/wormhole";
import {
  GUARDIAN_PRIVATE_KEY,
  LOCALHOST,
  PAYER_PRIVATE_KEY,
  WORMHOLE_ADDRESS,
} from "./helpers/consts";

describe(" 0: Wormhole", () => {
  const connection = new web3.Connection(LOCALHOST, "confirmed");
  const payer = web3.Keypair.fromSecretKey(PAYER_PRIVATE_KEY);

  before("Airdrop", async () => {
    await connection
      .requestAirdrop(payer.publicKey, 1000 * web3.LAMPORTS_PER_SOL)
      .then((tx) => connection.confirmTransaction(tx));
  });

  describe("Verify Local Validator", () => {
    it("Balance", async () => {
      const balance = await connection.getBalance(payer.publicKey);
      expect(balance).to.equal(1000 * web3.LAMPORTS_PER_SOL);
    });
  });

  describe("Verify Wormhole Program", () => {
    it("Guardian Set", async () => {
      // initialize
      const guardianSetExpirationTime = 86400;
      const fee = 100n;

      const devnetGuardian = Buffer.from(
        new Wallet(GUARDIAN_PRIVATE_KEY).address.substring(2),
        "hex"
      );
      const initialGuardians = [devnetGuardian];

      const initializeTx = await web3.sendAndConfirmTransaction(
        connection,
        new web3.Transaction().add(
          createInitializeInstruction(
            WORMHOLE_ADDRESS,
            payer.publicKey,
            guardianSetExpirationTime,
            fee,
            initialGuardians
          )
        ),
        [payer]
      );
      // console.log(`initializeTx: ${initializeTx}`);

      const accounts = await connection.getProgramAccounts(WORMHOLE_ADDRESS);
      expect(accounts).has.length(2);

      const info = await getWormholeInfo(connection, WORMHOLE_ADDRESS);
      expect(info.guardianSetIndex).to.equal(0);
      expect(info.config.guardianSetExpirationTime).to.equal(
        guardianSetExpirationTime
      );
      expect(info.config.fee).to.equal(fee);

      const guardianSet = await getGuardianSet(
        connection,
        WORMHOLE_ADDRESS,
        info.guardianSetIndex
      );
      expect(guardianSet.index).to.equal(0);
      expect(guardianSet.keys).has.length(1);
      expect(Buffer.compare(guardianSet.keys[0], devnetGuardian)).to.equal(0);
    });
  });

  describe("Check wormhole-sdk", () => {
    it("tryNativeToHexString", async () => {
      expect(
        tryNativeToHexString(payer.publicKey.toString(), "solana")
      ).to.equal(
        "c291b257b963a479bbc5a56aa6525494a6d708e628ff2ad61c8679c99d2afca5"
      );
    });
  });
});
