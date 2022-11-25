import { web3 } from "@project-serum/anchor";
import { expect } from "chai";
import { Wallet } from "ethers";
import {
  transferFromSolana,
  transferNativeSol,
  tryNativeToHexString,
} from "@certusone/wormhole-sdk";
import * as wormhole from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import * as tokenBridge from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";
import {
  GUARDIAN_PRIVATE_KEY,
  LOCALHOST,
  MINT,
  MINT_PRIVATE_KEY,
  PAYER_PRIVATE_KEY,
  TOKEN_BRIDGE_ADDRESS,
  WORMHOLE_ADDRESS,
} from "./helpers/consts";
import {
  NodeWallet,
  signSendAndConfirmTransaction,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

describe(" 0: Wormhole", () => {
  const connection = new web3.Connection(LOCALHOST, "confirmed");
  const wallet = NodeWallet.fromSecretKey(PAYER_PRIVATE_KEY);

  before("Airdrop", async () => {
    await connection
      .requestAirdrop(wallet.key(), 1000 * web3.LAMPORTS_PER_SOL)
      .then((tx) => connection.confirmTransaction(tx));
  });

  describe("Environment", () => {
    it("Variables", () => {
      expect(process.env.TESTING_WORMHOLE_ADDRESS).is.not.undefined;
      expect(process.env.TESTING_TOKEN_BRIDGE_ADDRESS).is.not.undefined;
      expect(process.env.TESTING_HELLO_WORLD_ADDRESS).is.not.undefined;
      expect(process.env.TESTING_HELLO_TOKEN_ADDRESS).is.not.undefined;
    });
  });

  describe("Verify Local Validator", () => {
    it("Balance", async () => {
      const balance = await connection.getBalance(wallet.key());
      expect(balance).to.equal(1000 * web3.LAMPORTS_PER_SOL);
    });

    it("Create SPL", async () => {
      const decimals = 9;
      const mint = await createMint(
        connection,
        wallet.signer(),
        wallet.key(),
        null, // freezeAuthority
        decimals,
        web3.Keypair.fromSecretKey(MINT_PRIVATE_KEY)
      );
      expect(mint.equals(MINT)).is.true;
    });

    it("Mint to Wallet's ATA", async () => {
      {
        const amount = await getOrCreateAssociatedTokenAccount(
          connection,
          wallet.signer(),
          MINT,
          wallet.key()
        ).then((account) => {
          return account.amount;
        });
        expect(amount).equals(0n);
      }

      const mintAmount = 69420000n * 1000000000n;
      const destination = getAssociatedTokenAddressSync(MINT, wallet.key());

      const mintTx = await mintTo(
        connection,
        wallet.signer(),
        MINT,
        destination,
        wallet.signer(),
        mintAmount
      ).catch((reason) => {
        // should not happen
        console.log(reason);
        return null;
      });
      expect(mintTx).is.not.null;

      const amount = await getAccount(connection, destination).then(
        (account) => account.amount
      );
      expect(amount).equals(mintAmount);
    });
  });

  describe("Verify Wormhole Program", () => {
    it("Initialize", async () => {
      // initialize
      const guardianSetExpirationTime = 86400;
      const fee = 100n;

      const devnetGuardian = Buffer.from(
        new Wallet(GUARDIAN_PRIVATE_KEY).address.substring(2),
        "hex"
      );
      const initialGuardians = [devnetGuardian];

      const initializeTx = await web3
        .sendAndConfirmTransaction(
          connection,
          new web3.Transaction().add(
            wormhole.createInitializeInstruction(
              WORMHOLE_ADDRESS,
              wallet.key(),
              guardianSetExpirationTime,
              fee,
              initialGuardians
            )
          ),
          [wallet.signer()]
        )
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(initializeTx).is.not.null;

      const accounts = await connection.getProgramAccounts(WORMHOLE_ADDRESS);
      expect(accounts).has.length(2);

      const info = await wormhole.getWormholeBridgeData(
        connection,
        WORMHOLE_ADDRESS
      );
      expect(info.guardianSetIndex).to.equal(0);
      expect(info.config.guardianSetExpirationTime).to.equal(
        guardianSetExpirationTime
      );
      expect(info.config.fee).to.equal(fee);

      const guardianSet = await wormhole.getGuardianSet(
        connection,
        WORMHOLE_ADDRESS,
        info.guardianSetIndex
      );
      expect(guardianSet.index).to.equal(0);
      expect(guardianSet.keys).has.length(1);
      expect(Buffer.compare(guardianSet.keys[0], devnetGuardian)).to.equal(0);
    });
  });

  describe("Verify Token Bridge Program", () => {
    it("Initialize", async () => {
      // initialize
      const initializeTx = await web3
        .sendAndConfirmTransaction(
          connection,
          new web3.Transaction().add(
            tokenBridge.createInitializeInstruction(
              TOKEN_BRIDGE_ADDRESS,
              wallet.key(),
              WORMHOLE_ADDRESS
            )
          ),
          [wallet.signer()]
        )
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(initializeTx).is.not.null;

      const accounts = await connection.getProgramAccounts(WORMHOLE_ADDRESS);
      expect(accounts).has.length(2);
    });

    it("Outbound Transfer Native", async () => {
      const amount = BigInt(1 * LAMPORTS_PER_SOL); // explicitly sending 1 SOL
      const targetAddress = Buffer.alloc(32, "deadbeef", "hex");
      const transferResponse = transferNativeSol(
        connection,
        WORMHOLE_ADDRESS,
        TOKEN_BRIDGE_ADDRESS,
        wallet.key(),
        amount,
        targetAddress,
        "ethereum"
      )
        .then((transaction) =>
          signSendAndConfirmTransaction(
            connection,
            wallet.key(),
            wallet.signTransaction,
            transaction
          )
        )
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(transferResponse).is.not.null;
    });
  });

  describe("Check wormhole-sdk", () => {
    it("tryNativeToHexString", async () => {
      expect(tryNativeToHexString(wallet.key().toString(), "solana")).to.equal(
        "c291b257b963a479bbc5a56aa6525494a6d708e628ff2ad61c8679c99d2afca5"
      );
    });
  });
});
