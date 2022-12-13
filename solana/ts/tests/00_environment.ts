import { expect } from "chai";
import { web3 } from "@project-serum/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { ethers } from "ethers";
import {
  createWrappedOnSolana,
  redeemOnSolana,
  transferNativeSol,
  tryNativeToHexString,
  tryNativeToUint8Array,
} from "@certusone/wormhole-sdk";
import * as wormhole from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import * as tokenBridge from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import {
  NodeWallet,
  postVaaSolana,
  signSendAndConfirmTransaction,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  ETHEREUM_TOKEN_BRIDGE_ADDRESS,
  GOVERNANCE_EMITTER_ADDRESS,
  GUARDIAN_PRIVATE_KEY,
  LOCALHOST,
  MINT_WITH_DECIMALS_9,
  MINT_9_PRIVATE_KEY,
  PAYER_PRIVATE_KEY,
  TOKEN_BRIDGE_ADDRESS,
  WORMHOLE_ADDRESS,
  createMaliciousRegisterChainInstruction,
  RELAYER_PRIVATE_KEY,
  WETH_ADDRESS,
  MINT_8_PRIVATE_KEY,
  MINT_WITH_DECIMALS_8,
} from "./helpers";
import { deriveWrappedMintKey } from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";

describe(" 0: Wormhole", () => {
  const connection = new web3.Connection(LOCALHOST, "processed");
  const wallet = NodeWallet.fromSecretKey(PAYER_PRIVATE_KEY);
  const relayer = NodeWallet.fromSecretKey(RELAYER_PRIVATE_KEY);

  // for signing wormhole messages
  const guardians = new mock.MockGuardians(0, [GUARDIAN_PRIVATE_KEY]);

  // for governance actions to modify programs
  const governance = new mock.GovernanceEmitter(
    GOVERNANCE_EMITTER_ADDRESS.toBuffer().toString("hex"),
    20
  );

  before("Airdrop", async () => {
    await connection
      .requestAirdrop(wallet.key(), 1000 * web3.LAMPORTS_PER_SOL)
      .then((tx) => connection.confirmTransaction(tx));

    await connection
      .requestAirdrop(relayer.key(), 1000 * web3.LAMPORTS_PER_SOL)
      .then((tx) => connection.confirmTransaction(tx));
  });

  describe("Environment", () => {
    it("Variables", () => {
      expect(process.env.TESTING_HELLO_WORLD_ADDRESS).is.not.undefined;
      expect(process.env.TESTING_HELLO_TOKEN_ADDRESS).is.not.undefined;
    });
  });

  describe("Verify Local Validator", () => {
    it("Balance", async () => {
      const balance = await connection.getBalance(wallet.key());
      expect(balance).to.equal(1000 * web3.LAMPORTS_PER_SOL);
    });

    it("Create SPL Tokens", async () => {
      {
        const decimals = 9;
        const mint = await createMint(
          connection,
          wallet.signer(),
          wallet.key(),
          null, // freezeAuthority
          decimals,
          web3.Keypair.fromSecretKey(MINT_9_PRIVATE_KEY)
        );
        expect(mint.equals(MINT_WITH_DECIMALS_9)).is.true;

        const mintDecimals = await getMint(connection, mint).then(
          (mintInfo) => mintInfo.decimals
        );
        expect(mintDecimals).to.equal(9);
      }

      {
        const decimals = 8;
        const mint = await createMint(
          connection,
          wallet.signer(),
          wallet.key(),
          null, // freezeAuthority
          decimals,
          web3.Keypair.fromSecretKey(MINT_8_PRIVATE_KEY)
        );
        expect(mint.equals(MINT_WITH_DECIMALS_8)).is.true;

        const mintDecimals = await getMint(connection, mint).then(
          (mintInfo) => mintInfo.decimals
        );
        expect(mintDecimals).to.equal(8);
      }
    });

    it("Create ATAs", async () => {
      for (const mint of [MINT_WITH_DECIMALS_8, MINT_WITH_DECIMALS_9]) {
        const walletAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          wallet.signer(),
          mint,
          wallet.key()
        ).catch((reason) => null);
        expect(walletAccount).is.not.null;

        const relayerAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          relayer.signer(),
          mint,
          relayer.key()
        ).catch((reason) => null);
        expect(relayerAccount).is.not.null;
      }
    });

    it("Mint to Wallet's ATAs", async () => {
      for (const mint of [MINT_WITH_DECIMALS_8, MINT_WITH_DECIMALS_9]) {
        const mintAmount = 69420000n * 1000000000n;
        const destination = getAssociatedTokenAddressSync(mint, wallet.key());

        const mintTx = await mintTo(
          connection,
          wallet.signer(),
          mint,
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
      }
    });
  });

  describe("Verify Wormhole Program", () => {
    it("Initialize", async () => {
      // initialize
      const guardianSetExpirationTime = 86400;
      const fee = 100n;

      const devnetGuardian = Buffer.from(
        new ethers.Wallet(GUARDIAN_PRIVATE_KEY).address.substring(2),
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
    // foreign token bridge
    const ethereumTokenBridge = new mock.MockEthereumTokenBridge(
      ETHEREUM_TOKEN_BRIDGE_ADDRESS
    );

    const tokenBridgeWethMint = deriveWrappedMintKey(
      TOKEN_BRIDGE_ADDRESS,
      2,
      WETH_ADDRESS
    );

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

      const accounts = await connection.getProgramAccounts(
        TOKEN_BRIDGE_ADDRESS
      );
      expect(accounts).has.length(1);
    });

    it("Register Foreign Endpoint (Ethereum)", async () => {
      const message = governance.publishTokenBridgeRegisterChain(
        0, // timestamp
        2,
        ETHEREUM_TOKEN_BRIDGE_ADDRESS
      );
      const signedWormholeMessage = guardians.addSignatures(message, [0]);

      const response = await postVaaSolana(
        connection,
        wallet.signTransaction,
        WORMHOLE_ADDRESS,
        wallet.key(),
        signedWormholeMessage
      ).catch((reason) => null);
      expect(response).is.not.null;

      const registerChainTx = await web3
        .sendAndConfirmTransaction(
          connection,
          new web3.Transaction().add(
            tokenBridge.createRegisterChainInstruction(
              TOKEN_BRIDGE_ADDRESS,
              WORMHOLE_ADDRESS,
              wallet.key(),
              signedWormholeMessage
            )
          ),
          [wallet.signer()]
        )
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(registerChainTx).is.not.null;

      const accounts = await connection.getProgramAccounts(
        TOKEN_BRIDGE_ADDRESS
      );
      expect(accounts).has.length(3);
    });

    // This shouldn't be allowed, but we're doing it just to prove the safety
    // of the scaffold programs.
    it("Register Bogus Foreign Endpoint (Chain ID == 0)", async () => {
      const message = governance.publishTokenBridgeRegisterChain(
        0, // timestamp
        1,
        web3.PublicKey.default.toString()
      );
      message.writeUInt16BE(0, 86);
      const signedWormholeMessage = guardians.addSignatures(message, [0]);

      const response = await postVaaSolana(
        connection,
        wallet.signTransaction,
        WORMHOLE_ADDRESS,
        wallet.key(),
        signedWormholeMessage
      ).catch((reason) => null);
      expect(response).is.not.null;

      const registerChainTx = await web3
        .sendAndConfirmTransaction(
          connection,
          new web3.Transaction().add(
            createMaliciousRegisterChainInstruction(
              TOKEN_BRIDGE_ADDRESS,
              WORMHOLE_ADDRESS,
              wallet.key(),
              signedWormholeMessage
            )
          ),
          [wallet.signer()]
        )
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(registerChainTx).is.not.null;

      const accounts = await connection.getProgramAccounts(
        TOKEN_BRIDGE_ADDRESS
      );
      expect(accounts).has.length(5);
    });

    // This shouldn't be allowed, but we're doing it just to prove the safety
    // of the scaffold programs.
    it("Register Bogus Foreign Endpoint (Chain ID == 1)", async () => {
      const message = governance.publishTokenBridgeRegisterChain(
        0, // timestamp
        1,
        web3.PublicKey.default.toString()
      );
      const signedWormholeMessage = guardians.addSignatures(message, [0]);

      const response = await postVaaSolana(
        connection,
        wallet.signTransaction,
        WORMHOLE_ADDRESS,
        wallet.key(),
        signedWormholeMessage
      ).catch((reason) => null);
      expect(response).is.not.null;

      const registerChainTx = await web3
        .sendAndConfirmTransaction(
          connection,
          new web3.Transaction().add(
            createMaliciousRegisterChainInstruction(
              TOKEN_BRIDGE_ADDRESS,
              WORMHOLE_ADDRESS,
              wallet.key(),
              signedWormholeMessage
            )
          ),
          [wallet.signer()]
        )
        .catch((reason) => {
          // should not happen
          console.log(reason);
          return null;
        });
      expect(registerChainTx).is.not.null;

      const accounts = await connection.getProgramAccounts(
        TOKEN_BRIDGE_ADDRESS
      );
      expect(accounts).has.length(7);
    });

    it("Outbound Transfer Native", async () => {
      const amount = BigInt(1 * LAMPORTS_PER_SOL); // explicitly sending 1 SOL
      const targetAddress = Buffer.alloc(32, "deadbeef", "hex");
      const transferResponse = await transferNativeSol(
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

      const sequence = await wormhole
        .getProgramSequenceTracker(
          connection,
          TOKEN_BRIDGE_ADDRESS,
          WORMHOLE_ADDRESS
        )
        .then((account) => account.sequence);
      expect(sequence).to.equal(1n);
    });

    it("Attest WETH from Ethereum", async () => {
      const published = ethereumTokenBridge.publishAttestMeta(
        WETH_ADDRESS,
        18,
        "WETH",
        "Wrapped Ether"
      );

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      const createWrappedTx = await postVaaSolana(
        connection,
        wallet.signTransaction,
        WORMHOLE_ADDRESS,
        wallet.key(),
        signedWormholeMessage
      )
        .then((_) =>
          createWrappedOnSolana(
            connection,
            WORMHOLE_ADDRESS,
            TOKEN_BRIDGE_ADDRESS,
            wallet.key(),
            signedWormholeMessage
          )
        )
        .then((transaction) =>
          signSendAndConfirmTransaction(
            connection,
            wallet.key(),
            wallet.signTransaction,
            transaction
          )
        )
        .catch((reason) => null);
      expect(createWrappedTx).is.not.null;
    });

    it("Create WETH ATAs", async () => {
      const walletAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        wallet.signer(),
        tokenBridgeWethMint,
        wallet.key()
      ).catch((reason) => null);
      expect(walletAccount).is.not.null;

      const relayerAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        relayer.signer(),
        tokenBridgeWethMint,
        relayer.key()
      ).catch((reason) => null);
      expect(relayerAccount).is.not.null;
    });

    it("Mint WETH to Wallet ATA", async () => {
      const rawAmount = ethers.utils.parseEther("110000");
      const mintAmount = BigInt(rawAmount.toString()) / 10n ** (18n - 8n);

      const destination = getAssociatedTokenAddressSync(
        tokenBridgeWethMint,
        wallet.key()
      );

      const published = ethereumTokenBridge.publishTransferTokens(
        tryNativeToHexString(WETH_ADDRESS, "ethereum"),
        2, // tokenChain
        mintAmount,
        1, // recipientChain
        destination.toBuffer().toString("hex"),
        0n
      );

      const signedWormholeMessage = guardians.addSignatures(published, [0]);

      const mintTx = await postVaaSolana(
        connection,
        wallet.signTransaction,
        WORMHOLE_ADDRESS,
        wallet.key(),
        signedWormholeMessage
      )
        .then((_) =>
          redeemOnSolana(
            connection,
            WORMHOLE_ADDRESS,
            TOKEN_BRIDGE_ADDRESS,
            wallet.key(),
            signedWormholeMessage
          )
        )
        .then((transaction) =>
          signSendAndConfirmTransaction(
            connection,
            wallet.key(),
            wallet.signTransaction,
            transaction
          )
        )
        .catch((reason) => null);
      expect(mintTx).is.not.null;

      const amount = await getAccount(connection, destination).then(
        (account) => account.amount
      );
      expect(amount).equals(mintAmount);
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
