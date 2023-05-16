import {
  Connection,
  PublicKeyInitData,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {Program} from "@coral-xyz/anchor";
import {Metaplex, Cluster, NftWithToken} from "@metaplex-foundation/js";
import {PROGRAM_ID as METADATA_ID, TokenStandard} from "@metaplex-foundation/mpl-token-metadata";
import {getPostMessageCpiAccounts } from "@certusone/wormhole-sdk/lib/cjs/solana";
import {deriveEmitterSequenceKey} from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole/accounts/sequence";
import {CONTRACTS} from "@certusone/wormhole-sdk";
import {ethers} from "ethers";

import {NftBurnBridging as NftBurnBridgingTypes} from "../../../target/types/nft_burn_bridging";
import IDL from "../../../target/idl/nft_burn_bridging.json";

const SEED_PREFIX_INSTANCE = Buffer.from("instance", "utf-8");
const SEED_PREFIX_MESSAGE = Buffer.from("message", "utf-8");

export class NftBurnBridging {
  readonly programId: PublicKey;
  readonly collectionMint: PublicKey;
  readonly wormholeId: PublicKey;
  private readonly program: Program<NftBurnBridgingTypes>;
  private readonly metaplex: Metaplex;
  
  static tokenIdFromURI(uri: string): number {
    return parseInt(uri.slice(uri.lastIndexOf("/") + 1, -".json".length));
  }
  
  constructor(
    connection: Connection,
    collectionMint: PublicKeyInitData,
    programId: PublicKeyInitData,
    wormholeId?: PublicKeyInitData,
  ) {
    this.programId = new PublicKey(programId);
    this.collectionMint = new PublicKey(collectionMint);
    if (this.collectionMint.equals(PublicKey.default))
      throw Error("Collection mint can't be zero address");
    //we don't pass a cluster argument but let metaplex figure it out from the connection
    this.metaplex = new Metaplex(connection);
    this.program = new Program<NftBurnBridgingTypes>(IDL as any, this.programId, {connection});

    const metaplexClusterToWormholeNetwork = (cluster: Cluster) => {
      if (cluster === 'mainnet-beta')
        return 'MAINNET';
      if (cluster === 'devnet')
        return 'TESTNET';
      if (cluster === 'localnet')
        return 'DEVNET';
      throw Error(`Unsupported cluster ${cluster}, please specify wormhole program id manually`);
    }
    this.wormholeId = new PublicKey(
      wormholeId ?? CONTRACTS[metaplexClusterToWormholeNetwork(this.metaplex.cluster)].solana.core
    );
  }

  getInstanceAddress(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIX_INSTANCE, this.collectionMint.toBuffer()],
      this.programId,
    )[0];
  }

  async getInstance(mustBeInitialized = true) {
    const address = this.getInstanceAddress();
    const data = await this.program.account.instance.fetchNullable(address);
    const isInitialized = !!data && data.collectionMint.equals(this.collectionMint);
    if (mustBeInitialized && !isInitialized)
      throw Error("NftBurnBridging not initialized for this collection");
    return {address, isInitialized,...data};
  }

  getMessageAccountAddress(
    nftMint: PublicKeyInitData,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [SEED_PREFIX_MESSAGE, new PublicKey(nftMint).toBuffer()],
      this.programId,
    )[0];
  }

  async isInitialized(): Promise<boolean> {
    const instance = await this.getInstance(false);
    return instance.isInitialized;
  }

  async isWhitelistEnabled(): Promise<boolean> {
    const instance = await this.getInstance();
    return instance.whitelistSize! > 0;
  }

  async isPaused(): Promise<boolean> {
    const instance = await this.getInstance();
    return instance.isPaused!;
  }

  async isNftWhitelisted(nftTokenOrTokenId: PublicKey | number): Promise<boolean> {
    const instance = await this.getInstance();
    if (instance.whitelistSize === 0)
      return true;
    const tokenId = (typeof nftTokenOrTokenId === "number"
      ? nftTokenOrTokenId
      : await this.getNftTokenId(nftTokenOrTokenId)
    );
    return NftBurnBridging.isWhitelisted(instance.whitelist!, tokenId);
  }

  async getNftTokenId(nftToken: PublicKey): Promise<number> {
    const nft = await this.getAndCheckNft(nftToken);
    return NftBurnBridging.tokenIdFromURI(nft.uri);
  }

  //must also be signed by the collection's update authority
  async createInitializeInstruction(
    payer: PublicKey, //must be a signer of the transaction
    whitelistSize = 0,
  ) : Promise<TransactionInstruction> {
    const instance = await this.getInstance(false);
    if (instance.isInitialized)
      throw Error("NftBurnBridging already initialized for this collection");

    const collectionNft = await this.metaplex.nfts().findByMint({mintAddress: this.collectionMint});

    return this.program.methods.initialize(whitelistSize).accounts({
      instance: instance.address,
      payer,
      updateAuthority: collectionNft.updateAuthorityAddress,
      collectionMint: this.collectionMint,
      collectionMeta: collectionNft.metadataAddress,
      systemProgram: SystemProgram.programId,
    }).instruction();
  }

  //must be signed by the update authority (i.e. admin)
  async createSetDelegateInstruction(
    delegate: PublicKey | null,
  ): Promise<TransactionInstruction> {
    const instance = await this.getInstance();
    return this.program.methods.setDelegate(delegate).accounts({
      instance: instance.address,
      updateAuthority: instance.updateAuthority!,
    }).instruction();
  }

  async createSetPausedInstruction(
    authority: PublicKey, //either update_authority or delegate (must sign tx)
    pause: boolean,
  ): Promise<TransactionInstruction> {
    const instance = await this.getInstance();
    if (instance.isPaused === pause)
      throw Error(`NftBurnBridging already ${pause ? "paused" : "unpaused"}`);
    
    return this.program.methods.setPaused(pause).accounts({
      instance: instance.address,
      authority,
    }).instruction();
  }

  //must be signed by the update authority or the delegate
  async createWhitelistBulkInstructions(
    authority: PublicKey,
    whitelist: readonly boolean[]
  ): Promise<readonly TransactionInstruction[]> {
    const instance = await this.getInstance();
    if (instance.whitelistSize !== whitelist.length)
      throw Error(
        `whitelist.length (=${whitelist.length}) does not equal` +
        `instance.whitelistSize (=${instance.whitelistSize})`
      );
    
    //Our transaction size overhead is roughly:
    //  32 bytes for the recent blockhash
    //  32 bytes for the programId
    //  32 bytes for the instance address
    //  32 bytes for the authority
    //  64 bytes for the signature
    //  + a couple of bytes for all the compact arrays etc.
    //So give or take we have ~1000 bytes give or take for the whitelist argument.
    // ... and as it turned out after some testing about 990 bytes is the most we can squeeze in
    const whitelistBytes = 990;
    const range = (size: number) => [...Array(size).keys()];
    const chunkSize = whitelistBytes * 8;
    const chunks = Math.ceil(whitelist.length / chunkSize);
    return Promise.all(range(chunks).map(chunk => {
      const whitelistSlice = whitelist.slice(chunk * chunkSize, (chunk + 1) * chunkSize);
      const bytes = range(Math.ceil(whitelistSlice.length/8)).map(byte => {
        let byteValue = 0;
        for (let bit = 0; bit < 8 && byte * 8 + bit < whitelistSlice.length; ++bit)
          byteValue += whitelistSlice[byte * 8 + bit] ? 1 << bit : 0;
        return byteValue;
      });

      return this.program.methods.whitelistBulk(chunk*whitelistBytes, Buffer.from(bytes)).accounts({
        instance: instance.address,
        authority,
      }).instruction();
    }));
  }

  async createWhitelistInstruction(
    authority: PublicKey, //either update_authority or delegate (must sign tx)
    tokenIds: number | readonly number[]
  ) : Promise<TransactionInstruction> {
    const instance = await this.getInstance();
    const tokenIdsArray = Array.isArray(tokenIds) ? tokenIds : [tokenIds];
    if (tokenIdsArray.some(id => id < 0 || id >= instance.whitelistSize!))
      throw Error("Invalid token ID");
    return this.program.methods.whitelist(tokenIdsArray).accounts({
      instance: instance.address,
      authority,
    }).instruction();
  }

  //must also be signed by the nft's owner
  async createSendAndBurnInstruction(
    payer: PublicKey, //must be a signer of the transaction
    nftToken: PublicKey,
    evmRecipient: string
  ) : Promise<TransactionInstruction> {
    if (!ethers.utils.isAddress(evmRecipient))
      throw Error("Invalid EVM recipient address");
    
    const instance = await this.getInstance();
    if (instance.isPaused)
      throw Error("NftBurnBridging is paused");
    
    const nft = await this.getAndCheckNft(nftToken) as NftWithToken;

    if (instance.whitelistSize! > 0) {
      const tokenId = NftBurnBridging.tokenIdFromURI(nft.uri);
      if (!NftBurnBridging.isWhitelisted(instance.whitelist!, tokenId))
        throw Error(`NFT with tokenId ${tokenId} not yet whitelisted`);
    }
    
    const evmRecipientArrayified = ethers.utils.zeroPad(evmRecipient, 20);
    //For normal NFTs, we can pass in an arbitrary mutable account for the token record account
    // since it will be ignored by the NftBurnBridging program anyway and it will substitute it with
    // the metadata program id which is the canonical solution according to the documentation - see
    // https://github.com/metaplex-foundation/metaplex-program-library/blob/master/token-metadata/program/ProgrammableNFTGuide.md#%EF%B8%8F--positional-optional-accounts
    //So for our purposes we simply reuse the nftToken account.
    const tokenRecord = 
      nft.tokenStandard === TokenStandard.ProgrammableNonFungible
      ? this.metaplex.nfts().pdas().tokenRecord({mint: nft.mint.address, token: nftToken})
      : nftToken; //will be ignored, but must be writeable because of Anchor checks
    
    const wormholeCpiAccounts = () => {
      const unused = PublicKey.default;
      const {wormholeBridge, wormholeFeeCollector, rent, clock, systemProgram} =
        getPostMessageCpiAccounts(this.programId, this.wormholeId, unused, unused);
      
      //The Wormhole SDK provides a default emitter that's derived from the programId alone.
      //Since our instance account doubles as our emitter for each collection however, we also
      // have to manually derive our sequence account (since the default sequence account assumes
      // the use of the default emitter in its account address derivation).
      return {
        wormholeBridge,
        wormholeFeeCollector,
        wormholeSequence: deriveEmitterSequenceKey(instance.address, this.wormholeId),
        wormholeMessage: this.getMessageAccountAddress(nft.mint.address),
        wormholeProgram: this.wormholeId,
        rent,
        clock,
        systemProgram,
      };
    };
      
    return this.program.methods.burnAndSend(evmRecipientArrayified).accounts({
      instance: instance.address,
      payer,
      nftOwner: nft.token.ownerAddress,
      nftToken,
      nftMint: nft.mint.address,
      nftMeta: nft.metadataAddress,
      nftMasterEdition: nft.edition.address,
      collectionMeta: this.metaplex.nfts().pdas().metadata({mint: this.collectionMint}),
      tokenRecord,
      metadataProgram: METADATA_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      ...wormholeCpiAccounts(),
    }).instruction();
  }

  // ----------------------------------------- private -----------------------------------------

  private static isWhitelisted(whitelist: Uint8Array, tokenId: number): boolean {
    return (whitelist[Math.floor(tokenId/8)] & (1 << (tokenId % 8))) > 0;
  }

  private async getAndCheckNft(nftToken: PublicKey, loadJsonMetadata = false) {
    const nft = await this.metaplex.nfts().findByToken({token: nftToken, loadJsonMetadata});

    if (
      !nft.collection ||
      !nft.collection.verified ||
      !nft.collection.address.equals(this.collectionMint)
    )
      throw Error("NFT is not part of this collection");
    
    return nft;
  }
}
