const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("../utils");
const {
	swapInterface,
	synthInterface,
	hardhatChainID,
	stableBridgingFee,
	burnInterface,
	deployTokensMetaRouterTest,
	deployContractsMetaRouterTest,
} = require("../utils");
const stableSwapInterface = new ethers.utils.Interface([
	"function multicall(uint256,bytes[],address[],address[],uint256[],address)",
]);

let firstToken,
	secondToken,
	thirdToken,
	bridge1,
	bridge2,
	bridge3,
	symbDex,
	stableDex,
	uniDex,
	weth,
	metaRouter,
	sTestTokenAddr,
	portal1,
	portal2,
	synthesis,
	sTestToken,
	sweth,
	owner,
	recipient,
	sender;

async function getContractFactory(name) {
	return await ethers.getContractFactory(name);
}

describe("MetaRouter synth V2 tests (2 tokens in first, final paths)", function () {
	beforeEach(async () => {
		[owner, recipient, sender, provider] = await ethers.getSigners();

		console.log("Owner account:", owner.address);

		[firstToken, secondToken, thirdToken, weth] =
			await deployTokensMetaRouterTest();

		[
			bridge1,
			bridge2,
			bridge3,
			portal1,
			portal2,
			synthesis,
			metaRouter,
			sTestTokenAddr,
			sTestToken,
			sWethAddr,
			sweth,
			symbFactory,
			symbDex,
			stableDex,
			uniFactory,
			uniDex,
		] = await deployContractsMetaRouterTest(owner, secondToken, weth);

		// approves for metaRouter
		await thirdToken
			.connect(sender)
			.approve(
				await metaRouter.metaRouterGateway(),
				ethers.constants.MaxUint256
			);

		await thirdToken.mint(sender.address, 10000);

		await library.mintTokens(
			provider,
			[firstToken, secondToken, thirdToken],
			[10000, 20000 + stableBridgingFee, 10000],
			weth,
			20000 + stableBridgingFee
		);
		await library.synthesize(
			provider,
			portal1,
			10000 + stableBridgingFee,
			secondToken,
			synthesis,
			bridge2
		);

		await library.synthesize(
			provider,
			portal2,
			10000 + stableBridgingFee,
			weth,
			synthesis,
			bridge2
		);
		expect(await sTestToken.balanceOf(provider.address)).to.eq(
			String(10000)
		);

		expect(await thirdToken.balanceOf(sender.address)).to.eq(String(10000));

		console.log("All required tokens minted");

		// add liquidity to symb dex and stable dex
		firstTokenAmount = 10000;
		syntTokenAmount = 10000;
		WETHTokenAmount = 10000;
		sWETHTokenAmount = 10000;
		thirdTokenAmount = 10000;
		secondTokenAmount = 10000;

		await library.addLiquidity(
			owner,
			provider,
			symbDex,
			symbFactory,
			[[firstToken, weth]],
			[[firstTokenAmount, WETHTokenAmount]],
			[sweth, sTestToken],
			[sWETHTokenAmount, syntTokenAmount],
			uniDex,
			uniFactory,
			[[secondToken, thirdToken]],
			[[secondTokenAmount, thirdTokenAmount]]
		);
	});

	it("Should check first slippage triggering", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokensSupportingFeeOnTransferTokens",
			[
				amountIn,
				5000,
				[thirdToken.address, secondToken.address],
				metaRouter.address,
				ethers.constants.MaxUint256,
			]
		);

		let secondSwapCalldata = swapInterface.encodeFunctionData("swap", [
			0,
			1,
			0,
			0,
			ethers.constants.MaxUint256,
		]);

		let secondSwapRouterCalldata = stableSwapInterface.encodeFunctionData(
			"multicall",
			[
				100,
				[secondSwapCalldata],
				[stableDex.address],
				[sTestTokenAddr, sweth.address],
				[100],
				metaRouter.address,
			]
		);

		let finalSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokensSupportingFeeOnTransferTokens",
			[
				0,
				0,
				[weth.address, firstToken.address],
				recipient.address,
				ethers.constants.MaxUint256,
			]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");

		let finalCalldata = burnInterface.encodeFunctionData(
			"metaBurnSyntheticToken",
			[
				[
					stableBridgingFee,
					50,
					sender.address,
					symbDex.address,
					sweth.address,
					finalSwapCalldata,
					36,
					recipient.address,
					portal2.address,
					bridge3.address,
					recipient.address,
					hardhatChainID,
					clientId,
				],
			]
		);

		let otherSideCalldata = synthInterface.encodeFunctionData(
			"metaSynthesize",
			[
				[
					stableBridgingFee,
					0,
					secondToken.address,
					recipient.address,
					synthesis.address,
					bridge2.address,
					sender.address,
					hardhatChainID,
					[sTestTokenAddr, sweth.address],
					stableRouter.address,
					secondSwapRouterCalldata,
					synthesis.address,
					finalCalldata,
					100,
					recipient.address,
					clientId,
				],
			]
		);

		await expect(
			metaRouter.connect(sender).metaRoute({
				firstDexRouter: uniDex.address,
				secondDexRouter: stableDex.address,
				amount: amountIn,
				nativeIn: false,
				firstSwapCalldata: firstSwapCalldata,
				approvedTokens: [thirdToken.address, secondToken.address],
				secondSwapCalldata: ethers.utils.hexConcat([]),
				relayRecipient: portal1.address,
				otherSideCalldata: otherSideCalldata,
			})
		).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

		expect(await thirdToken.balanceOf(sender.address)).to.eq(10000);
	});

	afterEach(async () => {
		// TODO: check a;; tokens balances here
		expect(await firstToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await weth.balanceOf(metaRouter.address)).to.eq(0);
		expect(await sTestToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await secondToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await thirdToken.balanceOf(metaRouter.address)).to.eq(0);
	});
});
