import { expect, use as chaiUse } from "chai";
import chaiAsPromised from 'chai-as-promised';
chaiUse(chaiAsPromised);
import {
  LAMPORTS_PER_SOL,
  Connection,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
  Signer,
  PublicKey,
} from "@solana/web3.js";
import {
  NodeWallet,
  postVaaSolana,
  signSendAndConfirmTransaction,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import { CORE_BRIDGE_PID, MOCK_GUARDIANS } from "./consts";

export const range = (size: number) => [...Array(size).keys()];

export function programIdFromEnvVar(envVar: string) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable not set`);
  }
  try {
    return new PublicKey(process.env[envVar]!);
  } catch (e) {
    throw new Error(
      `${envVar} environment variable is not a valid program id - value: ${process.env[envVar]}`
    );
  }
}

export function boilerPlateReduction(connection: Connection, defaultSigner: Signer) {
  // for signing wormhole messages
  const defaultNodeWallet = NodeWallet.fromSecretKey(defaultSigner.secretKey);

  const payerToWallet = (payer?: Signer) =>
    !payer || payer === defaultSigner
    ? defaultNodeWallet
    : NodeWallet.fromSecretKey(payer.secretKey);
  
  const requestAirdrop = async (account: PublicKey) =>
    connection.confirmTransaction(
      await connection.requestAirdrop(account, 1000 * LAMPORTS_PER_SOL)
    );
  
  const guardianSign = (message: Buffer) =>
    MOCK_GUARDIANS.addSignatures(message, [0])

  const postSignedMsgAsVaaOnSolana = async (signedMsg: Buffer, payer?: Signer) => {
    const wallet = payerToWallet(payer);
    await postVaaSolana(
      connection,
      wallet.signTransaction,
      CORE_BRIDGE_PID,
      wallet.key(),
      signedMsg
    );
  }

  const sendAndConfirmIx = async (
    ix: TransactionInstruction | Promise<TransactionInstruction>,
    signers?: Signer[]
  ) =>
    sendAndConfirmTransaction(
      connection,
      new Transaction().add(await ix),
      signers ?? [defaultSigner]
    );
  
  const expectIxToSucceed = async (
    ix: TransactionInstruction | Promise<TransactionInstruction>,
    signers?: Signer[]
  ) =>
    expect(sendAndConfirmIx(ix, signers)).to.be.fulfilled;
    // {try {await sendAndConfirmIx(ix, signers); expect(true);}
    //  catch (error: any) {console.log(`expectIxToSucceed failed: ${error}`); expect(false);}}
    
  
  const expectIxToFailWithError = async (
    ix: TransactionInstruction | Promise<TransactionInstruction>,
    errorMessage: string,
    signers?: Signer[],
  ) => {
    try {
      await sendAndConfirmIx(ix, signers);
    } catch (error: any) {
      if (!error.logs || !Array.isArray(error.logs)) {
        throw new Error(`Logs unexpectedly not found in error: ${error}`);
      }

      const logs = (error.logs as string[]).join("\n");
      // if (!logs.includes(errorMessage))
      //   console.log(`Couldn't find error '${errorMessage}' in logs: ${logs}`);
      expect(logs).includes(errorMessage);
      return;
    }
    expect.fail("Expected transaction to fail");
  }

  const expectTxToSucceed = async (
    tx: Transaction | Promise<Transaction>,
    payer?: Signer,
  ) => {
    const wallet = payerToWallet(payer);
    return expect(
      signSendAndConfirmTransaction(
      connection,
      wallet.key(),
      wallet.signTransaction,
      await tx,
    )).to.be.fulfilled;
  }

  return {
    requestAirdrop,
    guardianSign,
    postSignedMsgAsVaaOnSolana,
    expectIxToSucceed,
    expectIxToFailWithError,
    expectTxToSucceed,
  };
}
