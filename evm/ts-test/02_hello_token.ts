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
  AVAX_BRIDGE_ADDRESS,
  AVAX_WORMHOLE_GUARDIAN_SET_INDEX,
  FORK_AVAX_CHAIN_ID,
  ETH_HOST,
  ETH_WORMHOLE_ADDRESS,
  ETH_BRIDGE_ADDRESS,
  FORK_ETH_CHAIN_ID,
  WALLET_PRIVATE_KEY,
  WALLET_PRIVATE_KEY_TWO,
  GUARDIAN_PRIVATE_KEY,
} from "./helpers/consts";
import {
  formatWormholeMessageFromReceipt,
  readWormUSDContractAddress,
  readHelloTokenContractAddress,
  tokenBridgeDenormalizeAmount,
  tokenBridgeNormalizeAmount,
} from "./helpers/utils";
import {
  HelloToken__factory,
  ITokenBridge__factory,
  IWormhole__factory,
} from "./src/ethers-contracts";
import {makeContract} from "./helpers/io";
import {IWETH__factory} from "@certusone/wormhole-sdk/lib/cjs/ethers-contracts";

describe("Hello Token Test", () => {
  // avax wallet
  const avaxProvider = new ethers.providers.StaticJsonRpcProvider(AVAX_HOST);
  const avaxWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, avaxProvider);
  const avaxRelayerWallet = new ethers.Wallet(
    WALLET_PRIVATE_KEY_TWO,
    avaxProvider
  );

  // eth wallet
  const ethProvider = new ethers.providers.StaticJsonRpcProvider(ETH_HOST);
  const ethWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, ethProvider);
  const ethRelayerWallet = new ethers.Wallet(
    WALLET_PRIVATE_KEY_TWO,
    ethProvider
  );

  // wormhole contract
  const avaxWormhole = IWormhole__factory.connect(
    AVAX_WORMHOLE_ADDRESS,
    avaxWallet
  );
  const ethWormhole = IWormhole__factory.connect(
    ETH_WORMHOLE_ADDRESS,
    ethWallet
  );

  // token bridge contract
  const avaxBridge = ITokenBridge__factory.connect(
    AVAX_BRIDGE_ADDRESS,
    avaxWallet
  );
  const ethBridge = ITokenBridge__factory.connect(
    ETH_BRIDGE_ADDRESS,
    ethWallet
  );

  // WormUSD ERC20 contract
  const wormUsdAbi = `${__dirname}/../out/WormUSD.sol/WormUSD.json`;
  const avaxWormUsd = makeContract(
    avaxWallet,
    readWormUSDContractAddress(FORK_AVAX_CHAIN_ID),
    wormUsdAbi
  );
  const ethWormUsd = makeContract(
    ethWallet,
    readWormUSDContractAddress(FORK_ETH_CHAIN_ID),
    wormUsdAbi
  );

  // HelloToken contract
  const avaxHelloToken = HelloToken__factory.connect(
    readHelloTokenContractAddress(FORK_AVAX_CHAIN_ID),
    avaxWallet
  );
  const ethHelloToken = HelloToken__factory.connect(
    readHelloTokenContractAddress(FORK_ETH_CHAIN_ID),
    ethWallet
  );

  describe("Test Contract Deployment and Emitter Registration", () => {
    it("Verify AVAX Contract Deployment", async () => {
      // confirm chainId
      const deployedChainId = await avaxHelloToken.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_AVAX);
    });

    it("Verify ETH Contract Deployment", async () => {
      // confirm chainId
      const deployedChainId = await ethHelloToken.chainId();
      expect(deployedChainId).to.equal(CHAIN_ID_ETH);
    });

    it("Should Register HelloToken Contract Emitter on AVAX", async () => {
      // Convert the target contract address to bytes32, since other
      // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
      const targetContractAddressHex =
        "0x" + tryNativeToHexString(ethHelloToken.address, CHAIN_ID_ETH);

      // register the emitter
      const receipt = await avaxHelloToken
        .registerEmitter(CHAIN_ID_ETH, targetContractAddressHex)
        .then((tx: ethers.ContractTransaction) => tx.wait())
        .catch((msg: any) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // query the contract and confirm that the emitter is set in storage
      const emitterInContractState = await avaxHelloToken.getRegisteredEmitter(
        CHAIN_ID_ETH
      );
      expect(emitterInContractState).to.equal(targetContractAddressHex);
    });

    it("Should Register HelloToken Contract Emitter on ETH", async () => {
      // Convert the target contract address to bytes32, since other
      // non-evm blockchains (e.g. Solana) have 32 byte wallet addresses.
      const targetContractAddressHex =
        "0x" + tryNativeToHexString(avaxHelloToken.address, CHAIN_ID_AVAX);

      // register the emitter
      const receipt = await ethHelloToken
        .registerEmitter(CHAIN_ID_AVAX, targetContractAddressHex)
        .then((tx: ethers.ContractTransaction) => tx.wait())
        .catch((msg: any) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // query the contract and confirm that the emitter is set in storage
      const emitterInContractState = await ethHelloToken.getRegisteredEmitter(
        CHAIN_ID_AVAX
      );
      expect(emitterInContractState).to.equal(targetContractAddressHex);
    });
  });

  describe("Test HelloToken Interface", () => {
    // simulated guardian that signs wormhole messages
    const guardians = new MockGuardians(AVAX_WORMHOLE_GUARDIAN_SET_INDEX, [
      GUARDIAN_PRIVATE_KEY,
    ]);

    let localVariables: any = {};

    it("Should Transfer wormUSD Tokens From ETH to AVAX", async () => {
      // define the transfer amount
      localVariables.transferAmountFromEth = ethers.utils.parseUnits(
        "42069",
        await ethWormUsd.decimals()
      );

      // increase allowance
      {
        const receipt = await ethWormUsd
          .approve(ethHelloToken.address, localVariables.transferAmountFromEth)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;
      }

      // grab token balance before performing the transfer
      const balanceBefore = await ethWormUsd.balanceOf(ethWallet.address);

      // call sendTokensWithPayload
      const receipt = await ethHelloToken
        .sendTokensWithPayload(
          ethWormUsd.address,
          localVariables.transferAmountFromEth,
          CHAIN_ID_AVAX, // targetChainId
          0, // batchId=0 to opt out of batching
          "0x" + tryNativeToHexString(avaxWallet.address, CHAIN_ID_AVAX)
        )
        .then(async (tx: ethers.ContractTransaction) => {
          const receipt = await tx.wait();
          return receipt;
        })
        .catch((msg) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // check token balance after to confirm the transfer worked
      const balanceAfter = await ethWormUsd.balanceOf(ethWallet.address);
      expect(
        balanceBefore.sub(balanceAfter).eq(localVariables.transferAmountFromEth)
      ).is.true;

      // now grab the Wormhole message
      const unsignedMessages = await formatWormholeMessageFromReceipt(
        receipt!,
        CHAIN_ID_ETH
      );
      expect(unsignedMessages.length).to.equal(1);

      // sign the TransferWithPayload message
      localVariables.signedTransferMessage = Uint8Array.from(
        guardians.addSignatures(unsignedMessages[0], [0])
      );
      expect(localVariables.signedTransferMessage).is.not.null;
    });

    it("Should Redeem Wrapped wormUSD tokens on AVAX", async () => {
      // fetch the token bridge wrapper for the transferred token
      const wrappedTokenOnAvax = await avaxBridge.wrappedAsset(
        CHAIN_ID_ETH,
        "0x" + tryNativeToHexString(ethWormUsd.address, CHAIN_ID_ETH)
      );

      // create token contract for the wrapped asset
      const wrappedTokenContract = makeContract(
        avaxWallet,
        wrappedTokenOnAvax,
        wormUsdAbi
      );

      // Check the balance of the recipient and relayer wallet before
      // redeeming the token transfer.
      const relayerBalanceBefore = await wrappedTokenContract.balanceOf(
        avaxRelayerWallet.address
      );
      const recipientBalanceBefore = await wrappedTokenContract.balanceOf(
        avaxWallet.address
      );

      // Invoke the HelloToken contract to redeem the transfer, passing the
      // encoded Wormhole message. Invoke this method using the avaxRelayerWallet
      // to confirm that the contract handles relayer payouts correctly.
      const receipt = await avaxHelloToken
        .connect(avaxRelayerWallet) // change signer
        .redeemTransferWithPayload(localVariables.signedTransferMessage)
        .then(async (tx: ethers.ContractTransaction) => {
          const receipt = await tx.wait();
          return receipt;
        })
        .catch((msg) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // fetch the balances after redeeming the token transfer
      const relayerBalanceAfter = await wrappedTokenContract.balanceOf(
        avaxRelayerWallet.address
      );
      const recipientBalanceAfter = await wrappedTokenContract.balanceOf(
        avaxWallet.address
      );

      // compute the relayer fee using the denormalized transfer amount
      let relayerFee: ethers.BigNumber;
      let denormalizedTransferAmount: ethers.BigNumber;
      {
        const wrappedTokenDecimals = await wrappedTokenContract.decimals();
        denormalizedTransferAmount = tokenBridgeDenormalizeAmount(
          tokenBridgeNormalizeAmount(
            localVariables.transferAmountFromEth,
            wrappedTokenDecimals
          ),
          wrappedTokenDecimals
        );

        // calculate the relayer fee
        relayerFee = await avaxHelloToken.calculateRelayerFee(
          denormalizedTransferAmount
        );
      }

      // validate the balance transfers
      expect(relayerBalanceAfter.sub(relayerBalanceBefore).eq(relayerFee)).is
        .true;
      expect(
        recipientBalanceAfter
          .sub(recipientBalanceBefore)
          .eq(denormalizedTransferAmount.sub(relayerFee))
      ).is.true;

      // clear localVariables
      localVariables = {};

      // Save the recipient balance change and wrapped token contract for the
      // next test.
      localVariables.avaxWalletWrappedTokenBalance = recipientBalanceAfter.sub(
        recipientBalanceBefore
      );
      localVariables.wrappedTokenContract = wrappedTokenContract;
    });

    it("Should Transfer Wrapped wormUSD Tokens From AVAX to ETH", async () => {
      // increase allowance of the wrapped wormUsd token for the avax wallet
      {
        const receipt = await localVariables.wrappedTokenContract
          .approve(
            avaxHelloToken.address,
            localVariables.avaxWalletWrappedTokenBalance
          )
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;
      }

      // grab token balance before performing the transfer
      const balanceBefore = await localVariables.wrappedTokenContract.balanceOf(
        avaxWallet.address
      );

      // call sendTokensWithPayload
      const receipt = await avaxHelloToken
        .sendTokensWithPayload(
          localVariables.wrappedTokenContract.address,
          localVariables.avaxWalletWrappedTokenBalance,
          CHAIN_ID_ETH, // targetChainId
          0, // batchId=0 to opt out of batching
          "0x" + tryNativeToHexString(ethWallet.address, CHAIN_ID_ETH)
        )
        .then(async (tx: ethers.ContractTransaction) => {
          const receipt = await tx.wait();
          return receipt;
        })
        .catch((msg) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // check token balance after to confirm the transfer worked
      const balanceAfter = await localVariables.wrappedTokenContract.balanceOf(
        avaxWallet.address
      );
      expect(
        balanceBefore
          .sub(balanceAfter)
          .eq(localVariables.avaxWalletWrappedTokenBalance)
      ).is.true;

      // now grab the Wormhole message
      const unsignedMessages = await formatWormholeMessageFromReceipt(
        receipt!,
        CHAIN_ID_AVAX
      );
      expect(unsignedMessages.length).to.equal(1);

      // clear localVariables
      localVariables = {};

      // sign the TransferWithPayload message
      localVariables.signedTransferMessage = Uint8Array.from(
        guardians.addSignatures(unsignedMessages[0], [0])
      );
      expect(localVariables.signedTransferMessage).is.not.null;

      // save the balance change
      localVariables.transferAmountFromAvax = balanceBefore.sub(balanceAfter);
    });

    it("Should Redeem Unwrapped wormUSD tokens on ETH", async () => {
      // Check the balance of the recipient and relayer wallet before
      // redeeming the token transfer.
      const relayerBalanceBefore = await ethWormUsd.balanceOf(
        ethRelayerWallet.address
      );
      const recipientBalanceBefore = await ethWormUsd.balanceOf(
        ethWallet.address
      );

      // Invoke the HelloToken contract to redeem the transfer, passing the
      // encoded Wormhole message. Invoke this method using the avaxRelayerWallet
      // to confirm that the contract handles relayer payouts correctly.
      const receipt = await ethHelloToken
        .connect(ethRelayerWallet) // change signer
        .redeemTransferWithPayload(localVariables.signedTransferMessage)
        .then(async (tx: ethers.ContractTransaction) => {
          const receipt = await tx.wait();
          return receipt;
        })
        .catch((msg) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // fetch the balances after redeeming the token transfer
      const relayerBalanceAfter = await ethWormUsd.balanceOf(
        ethRelayerWallet.address
      );
      const recipientBalanceAfter = await ethWormUsd.balanceOf(
        ethWallet.address
      );

      // compute the relayer fee using the denormalized transfer amount
      let relayerFee: ethers.BigNumber;
      let denormalizedTransferAmount: ethers.BigNumber;
      {
        const tokenDecimals = await ethWormUsd.decimals();
        denormalizedTransferAmount = tokenBridgeDenormalizeAmount(
          tokenBridgeNormalizeAmount(
            localVariables.transferAmountFromAvax,
            tokenDecimals
          ),
          tokenDecimals
        );

        // calculate the relayer fee
        relayerFee = await ethHelloToken.calculateRelayerFee(
          denormalizedTransferAmount
        );
      }

      // validate the balance transfers
      expect(relayerBalanceAfter.sub(relayerBalanceBefore).eq(relayerFee)).is
        .true;
      expect(
        recipientBalanceAfter
          .sub(recipientBalanceBefore)
          .eq(denormalizedTransferAmount.sub(relayerFee))
      ).is.true;

      // clear localVariables
      localVariables = {};
    });

    it("Should Wrap and Transfer ETH From ETH to AVAX", async () => {
      // define the transfer amount
      localVariables.transferAmountFromEth = ethers.utils.parseEther("69.420");

      // instantiate WETH contract factory
      localVariables.wethAddress = await ethBridge.WETH();
      const weth = IWETH__factory.connect(
        localVariables.wethAddress,
        ethWallet
      );

      // wrap ETH using the wormhole SDK's WETH factory
      {
        const receipt = await weth
          .deposit({value: localVariables.transferAmountFromEth})
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;
      }

      // increase allowance
      {
        const receipt = await weth
          .approve(ethHelloToken.address, localVariables.transferAmountFromEth)
          .then((tx: ethers.ContractTransaction) => tx.wait())
          .catch((msg: any) => {
            // should not happen
            console.log(msg);
            return null;
          });
        expect(receipt).is.not.null;
      }

      // grab token balance before performing the transfer
      const balanceBefore = await weth.balanceOf(ethWallet.address);

      // call sendTokensWithPayload
      const receipt = await ethHelloToken
        .sendTokensWithPayload(
          weth.address,
          localVariables.transferAmountFromEth,
          CHAIN_ID_AVAX, // targetChainId
          0, // batchId=0 to opt out of batching
          "0x" + tryNativeToHexString(avaxWallet.address, CHAIN_ID_AVAX)
        )
        .then(async (tx: ethers.ContractTransaction) => {
          const receipt = await tx.wait();
          return receipt;
        })
        .catch((msg) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // check token balance after to confirm the transfer worked
      const balanceAfter = await weth.balanceOf(ethWallet.address);
      expect(
        balanceBefore.sub(balanceAfter).eq(localVariables.transferAmountFromEth)
      ).is.true;

      // now grab the Wormhole message
      const unsignedMessages = await formatWormholeMessageFromReceipt(
        receipt!,
        CHAIN_ID_ETH
      );
      expect(unsignedMessages.length).to.equal(1);

      // sign the TransferWithPayload message
      localVariables.signedTransferMessage = Uint8Array.from(
        guardians.addSignatures(unsignedMessages[0], [0])
      );
      expect(localVariables.signedTransferMessage).is.not.null;
    });

    it("Should Redeem Wrapped WETH tokens on AVAX", async () => {
      // fetch the token bridge wrapper for WETH
      const wethOnAvax = await avaxBridge.wrappedAsset(
        CHAIN_ID_ETH,
        "0x" + tryNativeToHexString(localVariables.wethAddress, CHAIN_ID_ETH)
      );

      // Create a token contract for the wrapped WETH. We can reuse the wormUsdAbi
      // since don't need any of the WETH-specific functionality to use the
      // wrapped version.
      const wrappedWethContract = makeContract(
        avaxWallet,
        wethOnAvax,
        wormUsdAbi
      );

      // Check the balance of the recipient and relayer wallet before
      // redeeming the token transfer.
      const relayerBalanceBefore = await wrappedWethContract.balanceOf(
        avaxRelayerWallet.address
      );
      const recipientBalanceBefore = await wrappedWethContract.balanceOf(
        avaxWallet.address
      );

      // Invoke the HelloToken contract to redeem the transfer, passing the
      // encoded Wormhole message. Invoke this method using the avaxRelayerWallet
      // to confirm that the contract handles relayer payouts correctly.
      const receipt = await avaxHelloToken
        .connect(avaxRelayerWallet)
        .redeemTransferWithPayload(localVariables.signedTransferMessage)
        .then(async (tx: ethers.ContractTransaction) => {
          const receipt = await tx.wait();
          return receipt;
        })
        .catch((msg) => {
          // should not happen
          console.log(msg);
          return null;
        });
      expect(receipt).is.not.null;

      // fetch the balances after redeeming the token transfer
      const relayerBalanceAfter = await wrappedWethContract.balanceOf(
        avaxRelayerWallet.address
      );
      const recipientBalanceAfter = await wrappedWethContract.balanceOf(
        avaxWallet.address
      );

      // compute the relayer fee using the denormalized transfer amount
      let relayerFee: ethers.BigNumber;
      let denormalizedTransferAmount: ethers.BigNumber;
      {
        const wrappedWethDecimals = await wrappedWethContract.decimals();
        denormalizedTransferAmount = tokenBridgeDenormalizeAmount(
          tokenBridgeNormalizeAmount(
            localVariables.transferAmountFromEth,
            wrappedWethDecimals
          ),
          wrappedWethDecimals
        );

        // calculate the relayer fee
        relayerFee = await avaxHelloToken.calculateRelayerFee(
          denormalizedTransferAmount
        );
      }

      // validate the balance transfers
      expect(relayerBalanceAfter.sub(relayerBalanceBefore).eq(relayerFee)).is
        .true;
      expect(
        recipientBalanceAfter
          .sub(recipientBalanceBefore)
          .eq(denormalizedTransferAmount.sub(relayerFee))
      ).is.true;

      // clear localVariables
      localVariables = {};
    });
  });
});
