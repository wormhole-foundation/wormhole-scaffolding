import { expect, use as chaiUse } from "chai";
import chaiAsPromised from 'chai-as-promised';
chaiUse(chaiAsPromised)
import {
  Connection,
  PublicKey
} from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  CHAINS,
  ChainId,
  parseTokenTransferPayload,
  parseTokenTransferVaa,
  tryNativeToHexString,
} from "@certusone/wormhole-sdk";
import * as mock from "@certusone/wormhole-sdk/lib/cjs/mock";
import { getTokenBridgeDerivedAccounts } from "@certusone/wormhole-sdk/lib/cjs/solana";
import * as wormhole from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import { deriveWrappedMintKey } from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";
import * as helloToken from "../sdk/02_hello_token";
import {
  LOCALHOST,
  PAYER_KEYPAIR,
  RELAYER_KEYPAIR,
  WORMHOLE_CONTRACTS,
  CORE_BRIDGE_PID,
  TOKEN_BRIDGE_PID,
  WETH_ADDRESS,
  MINTS_WITH_DECIMALS,
  deriveMaliciousTokenBridgeEndpointKey,
  programIdFromEnvVar,
  boilerPlateReduction,
} from "./helpers";

const HELLO_TOKEN_PID = new PublicKey("Scaffo1dingHe11oToken1111111111111111111111");
const ETHEREUM_TOKEN_BRIDGE_ADDRESS = WORMHOLE_CONTRACTS.ethereum.token_bridge;

describe(" 2: Hello Token", function() {
  const connection = new Connection(LOCALHOST, "processed");
  // payer is also the recipient in all tests
  const payer = PAYER_KEYPAIR;
  const relayer = RELAYER_KEYPAIR;

  const { guardianSign, postSignedMsgAsVaaOnSolana, expectIxToSucceed, expectIxToFailWithError } =
    boilerPlateReduction(connection, payer);

  const foreignChain = CHAINS.ethereum;
  const invalidChain = foreignChain + 1 as ChainId;
  const foreignContractAddress = Buffer.alloc(32, "deadbeef", "hex");
  const unregisteredContractAddress = Buffer.alloc(32, "deafbeef", "hex");
  const foreignTokenBridge = new mock.MockEthereumTokenBridge(ETHEREUM_TOKEN_BRIDGE_ADDRESS, 200);
  const program = helloToken.createHelloTokenProgramInterface(connection, HELLO_TOKEN_PID);

  describe("Initialize Program", function() {
    // Set a relayer fee of 1%
    // Note: This will be overwritten later when update_relayer_fee instruction is called.
    const relayerFee = 1_000_000;
    const relayerFeePrecision = 100_000_000;

    const createInitializeIx = (opts?: {relayerFee?: number, relayerFeePrecision?: number}) =>
      helloToken.createInitializeInstruction(
        connection,
        HELLO_TOKEN_PID,
        payer.publicKey,
        TOKEN_BRIDGE_PID,
        CORE_BRIDGE_PID,
        opts?.relayerFee ?? relayerFee,
        opts?.relayerFeePrecision ?? relayerFeePrecision
      );
    
    it("Cannot Initialize With relayer_fee_precision == 0", async function() {
      await expectIxToFailWithError(
        await createInitializeIx({relayerFee: 0, relayerFeePrecision: 0}),
        "InvalidRelayerFee"
      );
    });

    it("Cannot Initialize With relayer_fee > relayer_fee_precision", async function() {
      await expectIxToFailWithError(
        await createInitializeIx(
          {relayerFee: relayerFeePrecision, relayerFeePrecision: relayerFee}
        ),
        "InvalidRelayerFee"
      );
    });
    
    it("Finally Initialize Program", async function() {
      await expectIxToSucceed(createInitializeIx());

      const senderConfigData =
        await helloToken.getSenderConfigData(connection, HELLO_TOKEN_PID);
      expect(senderConfigData.owner).deep.equals(payer.publicKey);
      expect(senderConfigData.finality).equals(0);

      const tokenBridgeAccounts =
        getTokenBridgeDerivedAccounts(HELLO_TOKEN_PID, TOKEN_BRIDGE_PID, CORE_BRIDGE_PID);
      
      ([
        ["config", "tokenBridgeConfig"],
        ["authoritySigner", "tokenBridgeAuthoritySigner"],
        ["custodySigner", "tokenBridgeCustodySigner"],
        ["wormholeBridge", "wormholeBridge"],
        ["emitter", "tokenBridgeEmitter"],
        ["wormholeFeeCollector", "wormholeFeeCollector"],
        ["sequence", "tokenBridgeSequence"]
      ] as [
        keyof typeof senderConfigData.tokenBridge,
        keyof typeof tokenBridgeAccounts,
      ][]).forEach(([lhs, rhs]) =>
        expect(senderConfigData.tokenBridge[lhs]).deep.equals(tokenBridgeAccounts[rhs]));

      const redeemerConfigData =
        await helloToken.getRedeemerConfigData(connection, HELLO_TOKEN_PID);
      expect(redeemerConfigData.owner).deep.equals(payer.publicKey);
      expect(redeemerConfigData.relayerFee).equals(relayerFee);
      expect(redeemerConfigData.relayerFeePrecision).equals(relayerFeePrecision);
      
      ([
        ["config", "tokenBridgeConfig"],
        ["custodySigner", "tokenBridgeCustodySigner"],
        ["mintAuthority", "tokenBridgeMintAuthority"],
      ] as [
        keyof typeof redeemerConfigData.tokenBridge,
        keyof typeof tokenBridgeAccounts,
      ][])
      .forEach(([lhs, rhs]) =>
        expect(redeemerConfigData.tokenBridge[lhs]).deep.equals(tokenBridgeAccounts[rhs]));
    });

    it("Cannot Call Instruction Again: initialize", async function() {
      await expectIxToFailWithError(
        await createInitializeIx({relayerFee: 0, relayerFeePrecision: 1}),
        "already in use"
      );
    });
  });

  describe("Update Relayer Fee", function() {
    // Set a relayer fee of 0.1%
    const relayerFee = 100_000;
    const relayerFeePrecision = 100_000_000;
    const createUpdateRelayerFeeIx = (opts?: {
      sender?: PublicKey,
      relayerFee?: number,
      relayerFeePrecision?: number
    }) => helloToken.createUpdateRelayerFeeInstruction(
      connection,
      HELLO_TOKEN_PID,
      opts?.sender ?? payer.publicKey,
      opts?.relayerFee ?? relayerFee,
      opts?.relayerFeePrecision ?? relayerFeePrecision
    );
    
    it("Cannot Update as Non-Owner", async function() {
      await expectIxToFailWithError(
        await createUpdateRelayerFeeIx({sender: relayer.publicKey, relayerFee: relayerFee - 1}),
        "OwnerOnly",
        relayer
      );
    });

    it("Cannot Update With relayer_fee_precision == 0", async function() {
      await expectIxToFailWithError(
        await createUpdateRelayerFeeIx({relayerFee: 0, relayerFeePrecision: 0}),
        "InvalidRelayerFee",
      );
    });

    it("Cannot Update With relayer_fee > relayer_fee_precision", async function() {
      await expectIxToFailWithError(
        await createUpdateRelayerFeeIx(
          {relayerFee: relayerFeePrecision, relayerFeePrecision: relayerFee}
        ),
        "InvalidRelayerFee",
      );
    });
    
    it("Finally Update Relayer Fee", async function() {
      await expectIxToSucceed(createUpdateRelayerFeeIx());

      const redeemerConfigData =
        await helloToken.getRedeemerConfigData(connection, HELLO_TOKEN_PID);
      expect(redeemerConfigData.relayerFee).equals(relayerFee);
      expect(redeemerConfigData.relayerFeePrecision).equals(relayerFeePrecision);
    });
  });

  describe("Register Foreign Emitter", function() {
    const createRegisterForeignContractIx = (opts?: {
      sender?: PublicKey,
      contractAddress?: Buffer,
    }) => helloToken.createRegisterForeignContractInstruction(
      connection,
      HELLO_TOKEN_PID,
      opts?.sender ?? payer.publicKey,
      TOKEN_BRIDGE_PID,
      foreignChain,
      opts?.contractAddress ?? foreignContractAddress,
      ETHEREUM_TOKEN_BRIDGE_ADDRESS
    );

    it("Cannot Update as Non-Owner", async function() {
      const contractAddress = Buffer.alloc(32, "fbadc0de", "hex");
      await expectIxToFailWithError(
        await createRegisterForeignContractIx({sender: relayer.publicKey, contractAddress}),
        "OwnerOnly",
        relayer
      );
    });

    [CHAINS.unset, CHAINS.solana].forEach((chain) =>
      it(`Cannot Register Chain ID == ${chain}`, async function() {
        await expectIxToFailWithError(
          await program.methods.registerForeignContract(chain, [...foreignContractAddress])
            .accounts({
              owner: payer.publicKey,
              config: helloToken.deriveSenderConfigKey(HELLO_TOKEN_PID),
              foreignContract: helloToken.deriveForeignContractKey(HELLO_TOKEN_PID, chain),
              tokenBridgeForeignEndpoint:
                deriveMaliciousTokenBridgeEndpointKey(TOKEN_BRIDGE_PID, chain, Buffer.alloc(32)),
              tokenBridgeProgram: new PublicKey(TOKEN_BRIDGE_PID),
            })
            .instruction(),
          "InvalidForeignContract"
        );
      })
    );

    it("Cannot Register Zero Address", async function() {
      await expectIxToFailWithError(
        await createRegisterForeignContractIx({contractAddress: Buffer.alloc(32)}),
        "InvalidForeignContract"
      );
    });

    it("Cannot Register Contract Address Length != 32", async function() {
      await expectIxToFailWithError(
        await createRegisterForeignContractIx(
          {contractAddress: foreignContractAddress.subarray(0,31)}
        ),
        "InstructionDidNotDeserialize"
      );
    });

    [
      Buffer.alloc(32, "fbadc0de", "hex"),
      foreignContractAddress,
    ]
    .forEach((contractAddress) => 
      it(`Register ${contractAddress === foreignContractAddress ? "Final" : "Random"} Address`,
      async function() {
        await expectIxToSucceed(createRegisterForeignContractIx({contractAddress}));

        const {chain, address} =
          await helloToken.getForeignContractData(connection, HELLO_TOKEN_PID, foreignChain);
        expect(chain).equals(foreignChain);
        expect(address).deep.equals(contractAddress);
      })
    );
  });

  const batchId = 0;
  const sendAmount = 31337n; //we are sending once
  const recipientAddress = Buffer.alloc(32, "1337beef", "hex");

  const getWormholeSequence = async () => (
      await wormhole.getProgramSequenceTracker(connection, TOKEN_BRIDGE_PID, CORE_BRIDGE_PID)
    ).value() + 1n;

  const verifyWormholeMessage = async (sequence: bigint) => {
    const payload =
      parseTokenTransferPayload(
        (await wormhole.getPostedMessage(
          connection,
          helloToken.deriveTokenTransferMessageKey(HELLO_TOKEN_PID, sequence)
        )).message.payload
      ).tokenTransferPayload;
    
    expect(payload.readUint8(0)).equals(1); // payload ID
    expect(recipientAddress).deep.equals(payload.subarray(1, 33));
  }

  const verifyTmpTokenAccountDoesNotExist = async (mint: PublicKey) => {
    const tmpTokenAccountKey = helloToken.deriveTmpTokenAccountKey(HELLO_TOKEN_PID, mint);
    await expect(getAccount(connection, tmpTokenAccountKey)).to.be.rejected;
  }

  const getTokenBalance = async (tokenAccount: PublicKey) =>
    (await getAccount(connection, tokenAccount)).amount;

  ([
    [
      false,
      18,
      tryNativeToHexString(WETH_ADDRESS, foreignChain),
      deriveWrappedMintKey(TOKEN_BRIDGE_PID, foreignChain, WETH_ADDRESS)
    ],
    ...(Array.from(MINTS_WITH_DECIMALS.entries())
      .map(([decimals, {publicKey}]): [boolean, number, string, PublicKey] =>
        [
          true,
          decimals,
          publicKey.toBuffer().toString("hex"),
          publicKey
      ])
    )
  ] as [boolean, number, string, PublicKey][])
  .forEach(([isNative, decimals, tokenAddress, mint]) => {
    describe(`For ${isNative ? "Native" : "Wrapped"} With ${decimals} Decimals`, function() {
      const recipientTokenAccount = getAssociatedTokenAddressSync(mint, payer.publicKey);
      // We treat amount as if it was specified with a precision of 8 decimals
      const truncation = (isNative ? 10n ** BigInt(decimals - 8) : 1n);
      //we send once, but we receive twice, hence /2, and w also have to adjust for truncation
      const receiveAmount = ((sendAmount / 2n) / truncation) * truncation;

      describe(`Send Tokens With Payload`, function() {
        const createSendTokensWithPayloadIx = (opts?: {
          sender?: PublicKey,
          amount?: bigint,
          recipientAddress?: Buffer,
          recipientChain?: ChainId,
        }) => 
          ( isNative
          ? helloToken.createSendNativeTokensWithPayloadInstruction
          : helloToken.createSendWrappedTokensWithPayloadInstruction
          )(
          connection,
          HELLO_TOKEN_PID,
          opts?.sender ?? payer.publicKey,
          TOKEN_BRIDGE_PID,
          CORE_BRIDGE_PID,
          mint,
          {
            batchId,
            amount: opts?.amount ?? sendAmount,
            recipientAddress: opts?.recipientAddress ?? recipientAddress,
            recipientChain: opts?.recipientChain ?? foreignChain,
          }
        );

        if (isNative && decimals > 8)
          it("Cannot Send Amount Less Than Bridgeable", async function() {
            await expectIxToFailWithError(
              await createSendTokensWithPayloadIx({amount: 9n}),
              "ZeroBridgeAmount"
            );
          });

        it("Cannot Send To Unregistered Foreign Contract", async function() {
          await expectIxToFailWithError(
            await createSendTokensWithPayloadIx({recipientChain: invalidChain}),
            "AccountNotInitialized"
          );
        });

        [CHAINS.unset, CHAINS.solana].forEach((recipientChain) =>
          it(`Cannot Send To Chain ID == ${recipientChain}`, async function() {
            await expectIxToFailWithError(
              await createSendTokensWithPayloadIx({recipientChain}),
              "AnchorError caused by account: foreign_contract. Error Code: AccountNotInitialized"
            );
          })
        );

        it("Cannot Send To Zero Address", async function() {
          await expectIxToFailWithError(
            await createSendTokensWithPayloadIx({recipientAddress: Buffer.alloc(32)}),
            "InvalidRecipient"
          );
        });

        it("Finally Send Tokens With Payload", async function() {
          const sequence = await getWormholeSequence();

          const balanceBefore = await getTokenBalance(recipientTokenAccount);
          //depending on pda derivations, we can exceed our 200k compute units budget
          const computeUnits = 250_000;
          await expectIxToSucceed(createSendTokensWithPayloadIx(), computeUnits);
          const balanceChange = balanceBefore - await getTokenBalance(recipientTokenAccount);
          expect(balanceChange).equals((sendAmount / truncation) * truncation);

          await verifyWormholeMessage(sequence);
          await verifyTmpTokenAccountDoesNotExist(mint);
        });
      });

      const publishAndSign = (opts?: {foreignContractAddress?: Buffer}) => {
        const tokenTransferPayload = (() => {
          const buf = Buffer.alloc(33);
          buf.writeUInt8(1, 0); // payload ID
          payer.publicKey.toBuffer().copy(buf, 1); // payer is always recipient
          return buf;
        })();

        const published = foreignTokenBridge.publishTransferTokensWithPayload(
          tokenAddress,
          isNative ? CHAINS.solana : foreignChain, // tokenChain
          receiveAmount / truncation, //adjust for decimals
          CHAINS.solana, // recipientChain
          HELLO_TOKEN_PID.toBuffer().toString("hex"),
          opts?.foreignContractAddress ?? foreignContractAddress,
          tokenTransferPayload,
          batchId
        );
        published[51] = 3;
    
        return guardianSign(published);
      };
      
      const createRedeemTransferWithPayloadIx = (sender: PublicKey, signedMsg: Buffer) =>
        ( isNative
        ? helloToken.createRedeemNativeTransferWithPayloadInstruction
        : helloToken.createRedeemWrappedTransferWithPayloadInstruction
        )(
          connection,
          HELLO_TOKEN_PID,
          sender,
          TOKEN_BRIDGE_PID,
          CORE_BRIDGE_PID,
          signedMsg
        );

      [
        payer,
        relayer
      ]
      .forEach(sender => {
        const isSelfRelay = sender === payer;
        
        describe(
        `Receive Tokens With Payload (via ${isSelfRelay ? "self-relay" : "relayer"})`,
        function() {
          //got call it here so the nonce increases (signedMsg is different between tests)
          const signedMsg = publishAndSign();

          it("Cannot Redeem From Unregistered Foreign Contract", async function() {
            const bogusMsg = publishAndSign(
              {foreignContractAddress: unregisteredContractAddress}
            );
            await postSignedMsgAsVaaOnSolana(bogusMsg);
            await expectIxToFailWithError(
              await createRedeemTransferWithPayloadIx(sender.publicKey, bogusMsg),
              "InvalidForeignContract",
              sender
            );
          });

          it("Post Wormhole Message", async function() {
            await expect(postSignedMsgAsVaaOnSolana(signedMsg, sender)).to.be.fulfilled;
          })

          it("Cannot Redeem With Bogus Token Account", async function() {
            const bogusTokenAccount = getAssociatedTokenAddressSync(mint, relayer.publicKey);

            const maliciousIx = await (async () => {
              const parsed = parseTokenTransferVaa(signedMsg);
              const parsedMint = isNative
                ? new PublicKey(parsed.tokenAddress)
                : deriveWrappedMintKey(TOKEN_BRIDGE_PID,  parsed.tokenChain, parsed.tokenAddress);

              const tmpTokenAccount =
                helloToken.deriveTmpTokenAccountKey(HELLO_TOKEN_PID, parsedMint);
              const tokenBridgeAccounts = (isNative
                ? helloToken.getCompleteTransferNativeWithPayloadCpiAccounts
                : helloToken.getCompleteTransferWrappedWithPayloadCpiAccounts)(
                  TOKEN_BRIDGE_PID,
                  CORE_BRIDGE_PID,
                  relayer.publicKey,
                  parsed,
                  tmpTokenAccount
                );

              const method = isNative
                ? program.methods.redeemNativeTransferWithPayload
                : program.methods.redeemWrappedTransferWithPayload;
              
              return method([...parsed.hash])
                .accounts({
                  config: helloToken.deriveRedeemerConfigKey(HELLO_TOKEN_PID),
                  foreignContract:
                    helloToken.deriveForeignContractKey(HELLO_TOKEN_PID, parsed.emitterChain as ChainId),
                  tmpTokenAccount,
                  recipientTokenAccount: bogusTokenAccount,
                  recipient: relayer.publicKey,
                  payerTokenAccount: getAssociatedTokenAddressSync(parsedMint, relayer.publicKey),
                  tokenBridgeProgram: TOKEN_BRIDGE_PID,
                  ...tokenBridgeAccounts,
                })
                .instruction();
            })();

            await expectIxToFailWithError(
              maliciousIx,
              "Error Code: InvalidRecipient. Error Number: 6015",
              relayer
            );
          });

          it("Finally Receive Tokens With Payload", async function() {
            const tokenAccounts = ((isSelfRelay) ? [payer] : [payer, relayer]).map(
              kp => getAssociatedTokenAddressSync(mint, kp.publicKey)
            );
            
            const balancesBefore = await Promise.all(tokenAccounts.map(getTokenBalance));
            await expectIxToSucceed(
              createRedeemTransferWithPayloadIx(sender.publicKey, signedMsg),
              sender
            );
            const balancesChange = await Promise.all(
              tokenAccounts.map(async (acc, i) => (await getTokenBalance(acc)) - balancesBefore[i])
            );

            if (isSelfRelay) {
              expect(balancesChange[0]).equals(receiveAmount);
            }
            else {
              const { relayerFee, relayerFeePrecision } =
                await helloToken.getRedeemerConfigData(connection, HELLO_TOKEN_PID);
              const relayerAmount =
                (BigInt(relayerFee) * receiveAmount) / BigInt(relayerFeePrecision);
              expect(balancesChange[0]).equals(receiveAmount - relayerAmount);
              expect(balancesChange[1]).equals(relayerAmount);
            }

            await verifyTmpTokenAccountDoesNotExist(mint);
          });

          it("Cannot Redeem Transfer Again", async function() {
            await expectIxToFailWithError(
              await createRedeemTransferWithPayloadIx(sender.publicKey, signedMsg),
              "AlreadyRedeemed",
              sender
            );
          });
        });
      });
    });
  });
});
