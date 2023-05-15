import {
  ChainId,
  parseTokenBridgeRegisterChainVaa,
  SignedVaa,
  tryNativeToUint8Array,
} from "@certusone/wormhole-sdk";
import { deriveAddress } from "@certusone/wormhole-sdk/lib/cjs/solana";
import {
  createReadOnlyTokenBridgeProgramInterface,
  deriveTokenBridgeConfigKey,
  RegisterChainAccounts,
} from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";
import {
  deriveClaimKey,
  derivePostedVaaKey,
} from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import {
  PublicKey,
  PublicKeyInitData,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";

export function createMaliciousRegisterChainInstruction(
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  vaa: SignedVaa
): TransactionInstruction {
  const methods =
    createReadOnlyTokenBridgeProgramInterface(
      tokenBridgeProgramId
    ).methods.registerChain();

  // @ts-ignore
  return methods._ixFn(...methods._args, {
    accounts: getRegisterChainAccounts(
      tokenBridgeProgramId,
      wormholeProgramId,
      payer,
      vaa
    ) as any,
    signers: undefined,
    remainingAccounts: undefined,
    preInstructions: undefined,
    postInstructions: undefined,
  });
}

export function getRegisterChainAccounts(
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  vaa: SignedVaa
): RegisterChainAccounts {
  const parsed = parseTokenBridgeRegisterChainVaa(vaa);
  return {
    payer: new PublicKey(payer),
    config: deriveTokenBridgeConfigKey(tokenBridgeProgramId),
    endpoint: deriveMaliciousTokenBridgeEndpointKey(
      tokenBridgeProgramId,
      parsed.foreignChain as ChainId,
      parsed.foreignAddress
    ),
    vaa: derivePostedVaaKey(wormholeProgramId, parsed.hash),
    claim: deriveClaimKey(
      tokenBridgeProgramId,
      parsed.emitterAddress,
      parsed.emitterChain,
      parsed.sequence
    ),
    rent: SYSVAR_RENT_PUBKEY,
    systemProgram: SystemProgram.programId,
    wormholeProgram: new PublicKey(wormholeProgramId),
  };
}

export function deriveMaliciousTokenBridgeEndpointKey(
  tokenBridgeProgramId: PublicKeyInitData,
  emitterChain: ChainId,
  emitterAddress: Buffer
): PublicKey {
  if (typeof emitterAddress == "string")
    emitterAddress = Buffer.from(tryNativeToUint8Array(emitterAddress, emitterChain));
  
  return deriveAddress(
    [
      (() => {
        const buf = Buffer.alloc(2);
        buf.writeUInt16BE(emitterChain);
        return buf;
      })(),
      emitterAddress,
    ],
    tokenBridgeProgramId
  );
}
