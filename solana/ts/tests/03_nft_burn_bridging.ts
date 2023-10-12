import {expect, use as chaiUse} from "chai";
import chaiAsPromised from 'chai-as-promised';
chaiUse(chaiAsPromised);
import {
  Connection,
  PublicKey,
  Keypair,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {getPostedMessage} from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import {Metaplex, keypairIdentity, CreateNftOutput} from "@metaplex-foundation/js";
import {
  TokenStandard,
  createVerifyInstruction,
  VerificationArgs
} from '@metaplex-foundation/mpl-token-metadata';
import {NftBurnBridging} from "../sdk/03_nft_burn_bridging";
import {
  LOCALHOST,
  PAYER_KEYPAIR,
  CORE_BRIDGE_PID,
  programIdFromEnvVar,
  boilerPlateReduction,
  range,
} from "./helpers";

const NFT_BURN_BRIDGING_PID = new PublicKey("Scaffo1dingNftBurnBridging11111111111111111");

describe(" 3: Nft Burn Bridging", function() {
  const connection = new Connection(LOCALHOST, "processed");
  const admin = PAYER_KEYPAIR;
  const metaplex = Metaplex.make(connection).use(keypairIdentity(admin));

  const nftCount = (owner: Keypair) =>
    metaplex.nfts().findAllByOwner({owner: owner.publicKey}).then(arr => arr.length);

  const { requestAirdrop, sendAndConfirmIx } = boilerPlateReduction(connection, admin);

  async function instantiate(tokenStandard: TokenStandard = TokenStandard.NonFungible) {
    const collectionNft = await metaplex.nfts().create({
      name: "Collection NFT",
      symbol: "COLLECTION",
      uri: "https://our.metadata.url/collection.json",
      tokenStandard,
      sellerFeeBasisPoints: 0,
      //for NFTs with the "old", non-programmable standard, we also don't set isCollection
      isCollection: tokenStandard === TokenStandard.ProgrammableNonFungible,
    });

    const program = new NftBurnBridging(
      connection,
      collectionNft.mintAddress,
      NFT_BURN_BRIDGING_PID,
      CORE_BRIDGE_PID,
    );
    return {collectionNft, program};
  }

  const initialize = async (
    program: NftBurnBridging,
    deployer: Keypair,
    whitelistSize: number,
  ) => sendAndConfirmIx(
    await program.createInitializeInstruction(deployer.publicKey, whitelistSize),
    [deployer]
  );

  const setPause = async (
    program: NftBurnBridging,
    sender: Keypair,
    paused: boolean
  ) => sendAndConfirmIx(
    await program.createSetPausedInstruction(sender.publicKey, paused),
    [sender]
  );

  describe("Admin/Delegate Operations", function() {
    let program: NftBurnBridging;
    const delegate = Keypair.generate();
    const whitelistSize = 10000;

    before("Create a collection NFT and instantiate NftBurnBridging", async function() {
      await requestAirdrop(delegate.publicKey);
      program = (await instantiate()).program;
    });

    describe("Initialize Ix", function() {
      const initializeTest = (deployer: Keypair) => async function() {
        expect(await program.isInitialized()).equals(false);
        const expectedOutcome = (deployer === admin) ? "fulfilled" : "rejected";
        await expect(initialize(program, deployer, whitelistSize)).to.be[expectedOutcome];
        expect(await program.isInitialized()).equals(deployer === admin);
      };

      it("as a rando", initializeTest(delegate));
      it("as the admin (i.e. the update authority of the collection)", initializeTest(admin));
    });

    const tokenIdsToWhitelist = [0, 1, 8, whitelistSize-9, whitelistSize-2, whitelistSize-1];
    const notWhitelisted = [2, 7, 9, whitelistSize-10, whitelistSize-8, whitelistSize-3];

    describe("whitelistBulk Ix", function() {
      it("test", async function() {
        for (const tokenId of tokenIdsToWhitelist.concat(notWhitelisted))
          expect(await program.isNftWhitelisted(tokenId)).to.be.false;

        const bulkWhitelistIxs = await program.createWhitelistBulkInstructions(
          admin.publicKey,
          range(whitelistSize).map(index => tokenIdsToWhitelist.includes(index))
        );

        for (const ix of bulkWhitelistIxs)
          await expect(sendAndConfirmIx(ix, [admin])).to.be.fulfilled;
        
        for (const tokenId of tokenIdsToWhitelist)
          expect(await program.isNftWhitelisted(tokenId)).to.be.true;
        
        for (const tokenId of notWhitelisted)
          expect(await program.isNftWhitelisted(tokenId)).to.be.false;
      })
    });

    describe("delegation", function() {
      const setDelegate = async (newDelegate: PublicKey | null) => sendAndConfirmIx(
        program.createSetDelegateInstruction(newDelegate),
        [admin]
      );

      const delegateWhitelist = async (tokenId: number) => sendAndConfirmIx(
        program.createWhitelistInstruction(delegate.publicKey, tokenId),
        [delegate]
      );

      it("unauthorized delegate can't whitelist", async function() {
        await expect(delegateWhitelist(0)).to.be.rejected;
      });

      it("unauthorized delegate can't pause", async function() {
        await expect(setPause(program, delegate, true)).to.be.rejected;
      });

      it("admin authorizes delegate", async function() {
        await expect(setDelegate(delegate.publicKey)).to.be.fulfilled;
      });

      it("authorized delegate pauses", async function() {
        await expect(setPause(program, delegate, true)).to.be.fulfilled;
      });

      it("admin unpauses", async function() {
        await expect(setPause(program, admin, false)).to.be.fulfilled;
      });

      it("delegate whitelists", async function() {
        const tokenId = notWhitelisted[0];
        expect(await program.isNftWhitelisted(tokenId)).to.be.false;
        await expect(delegateWhitelist(tokenId)).to.be.fulfilled;
        expect(await program.isNftWhitelisted(tokenId)).to.be.true;
      });

      it("delegate whitelists out of bounds", async function() {
        await expect(delegateWhitelist(whitelistSize)).to.be.rejected;
      });

      it("admin revokes authorization", async function() {
        await expect(setDelegate(null)).to.be.fulfilled;
      });

      it("delegate can't pause anymore", async function() {
        await expect(setPause(program, delegate, true)).to.be.rejected;
      });

      it("delegate can't whitelist anymore", async function() {
        await expect(delegateWhitelist(0)).to.be.rejected;
      });
    });
  });

  (["NonFungible", "ProgrammableNonFungible"].flatMap(tokenStandardName =>
    [true, false].flatMap(useWhitelist => ({ tokenStandardName, useWhitelist }))
  ) as ({tokenStandardName: keyof typeof TokenStandard, useWhitelist: boolean})[])
  .forEach(({tokenStandardName, useWhitelist}) =>
    describe(`BurnAndSend Ix for NFT with token standard ${String(tokenStandardName)} ` +
        `with${useWhitelist ? "" : "out"} using a whitelist`, function() {
      const user = Keypair.generate();
      let collectionNft: CreateNftOutput;
      let program: NftBurnBridging;
      let userNft: CreateNftOutput;
      const tokenId = 3250;
      const whitelistSize = useWhitelist ? 10000 : 0;
      const tokenStandard = TokenStandard[tokenStandardName];

      const evmRecipient = "0x" + "00123456".repeat(5);
      const burnAndSend = async (sender: Keypair) => sendAndConfirmIx(
        await program.createSendAndBurnInstruction(
          sender.publicKey,
          userNft.tokenAddress,
          evmRecipient,
        ),
        [sender]
      );

      before("Mint NFTs, instantiate/initialize program, fund the user", async function() {
        await requestAirdrop(user.publicKey);
        const res = await instantiate(tokenStandard);
        collectionNft = res.collectionNft;
        program = res.program;
        await initialize(program, admin, whitelistSize);

        expect(await nftCount(user)).equals(0);

        //does not verify that the NFT belongs to the collection
        userNft = await metaplex.nfts().create({
          name: "NFT #" + tokenId,
          symbol: "COLLECTION",
          uri: "https://our.metadata.url/" + tokenId + ".json",
          sellerFeeBasisPoints: 333,
          collection: collectionNft.mintAddress,
          tokenOwner: user.publicKey,
          tokenStandard,
        });

        expect(await nftCount(user)).equals(1);
      });

      describe("without verifying that the NFT belongs to the collection", function() {
        it("when not the owner of the NFT", async function() {
          await expect(burnAndSend(admin)).to.be.rejected;
        });

        it("as the owner of the NFT", async function() {
          await expect(burnAndSend(user)).to.be.rejected;
        });
      });

      describe("after verifying the NFT", function() {
        before("verify the NFT as part of the collection", async function() {
          await sendAndConfirmIx(
            createVerifyInstruction({
                authority: admin.publicKey,
                metadata: userNft.metadataAddress,
                collectionMint: collectionNft.mintAddress,
                collectionMetadata: collectionNft.metadataAddress,
                collectionMasterEdition: collectionNft.masterEditionAddress,
                sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
              },
              {verificationArgs: VerificationArgs.CollectionV1},
            ),
            [admin]
          );
        });

        it("when not the owner of the NFT", async function() {
          await expect(burnAndSend(admin)).to.be.rejected;
        });
      });
      
      if (useWhitelist) {
        describe("without whitelisting the NFT", function() {
          it("as the owner of the NFT ", async function() {
            expect (await program.isNftWhitelisted(tokenId)).to.be.false;
            await expect(burnAndSend(user)).to.be.rejected;
          });
        });

        describe("after whitelisting the NFT", function() {
          before("whitelist the NFT via whitelist instruction", async function() {
            expect (await program.isNftWhitelisted(tokenId)).to.be.false;
            await expect(sendAndConfirmIx(
              await program.createWhitelistInstruction(admin.publicKey, tokenId), [admin]
            )).to.be.fulfilled;
            expect (await program.isNftWhitelisted(tokenId)).to.be.true;
          });

          it("when not the owner of the NFT", async function() {
            await expect(burnAndSend(admin)).to.be.rejected;
          });
        });
      }

      describe("not while paused", function() {
        before("pause", async function() {
          await expect(setPause(program, admin, true)).to.be.fulfilled;
        });

        it("as the owner of the NFT", async function() {
          await expect(burnAndSend(user)).to.be.rejected;
        });

        after("unpause", async function() {
          await expect(setPause(program, admin, false)).to.be.fulfilled;
        });
      });

      describe("and finally successfully", function() {
        it("as the owner of the NFT", async function() {
          await expect(burnAndSend(user)).to.be.fulfilled;
        });

        it("... and verify that the NFT was burned", async function() {
          expect(await nftCount(user)).equals(0);
        });

        it("... and that the correct Wormhole message was emitted", async function() {
          const {payload} = (
            await getPostedMessage(
              connection,
              program.getMessageAccountAddress(userNft.mintAddress)
            )
          ).message;

          expect(payload.readUint16BE(0)).equals(tokenId);
          expect(Buffer.compare(
            payload.subarray(2),
            Buffer.from(evmRecipient.substring(2), "hex")
          )).equals(0);
        });
      });
    })
  );
});
