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
} = require("../utils");
const stableSwapInterface = new ethers.utils.Interface([
	"function multicall(uint256,bytes[],address[],address[],uint256[],address)",
]);

let firstToken,
	secondToken,
	thirdToken,
	bridge2,
	bridge3,
	symbDex,
	stableDex,
	uniDex,
	weth,
	metaRouter,
	sSecondTokenAddr,
	sThirdTokenAddr,
	portal1,
	portal2,
	synthesis,
	sSecondToken,
	sThirdToken,
	owner,
	recipient,
	sender;

describe("MetaRouter synth V2 Native tests (2 tokens in first, final paths)", function () {
	beforeEach(async () => {
		[owner, recipient, sender, provider] = await ethers.getSigners();

		console.log("Owner account:", owner.address);

		[firstToken, secondToken, thirdToken, weth] =
			await deployTokensMetaRouterTest();

		[
			_,
			bridge1,
			bridge2,
			bridge3,
			portal1,
			portal2,
			synthesis,
			metaRouter,
		] = await library.deploySynthContracts(
			owner,
			thirdToken.address,
			secondToken.address
		);

		[sThirdTokenAddr, sThirdToken, sSecondTokenAddr, sSecondToken] =
			await library.createSyntRepr(
				thirdToken,
				secondToken,
				synthesis,
				synthesis
			);

		const StableRouter = await ethers.getContractFactory("MulticallRouter");
		stableRouter = await StableRouter.deploy();

		[symbFactory, symbDex, stableDex, uniFactory, uniDex] =
			await library.deployDexes(
				owner,
				[sThirdTokenAddr, sSecondTokenAddr],
				weth
			);

		// [bridge1, bridge2, bridge3, portal1, portal2, synthesis, metaRouter, sThirdTokenAddr, sThirdToken, sSecondTokenAddr, sSecondToken, symbFactory, symbDex, stableDex, uniFactory, uniDex] = await deployContractsMetaRouterTest(owner, thirdToken, secondToken);

		await library.mintTokens(
			provider,
			[firstToken, secondToken, thirdToken],
			[10000, 20000 + stableBridgingFee, 20000 + stableBridgingFee],
			weth,
			10000
		);
		await library.synthesize(
			provider,
			portal1,
			10000 + stableBridgingFee,
			thirdToken,
			synthesis,
			bridge2
		);

		await library.synthesize(
			provider,
			portal2,
			10000 + stableBridgingFee,
			secondToken,
			synthesis,
			bridge2
		);
		expect(await sSecondToken.balanceOf(provider.address)).to.eq(
			String(10000)
		);

		expect(await sThirdToken.balanceOf(provider.address)).to.eq(
			String(10000)
		);

		console.log("All required tokens minted");

		// add liquidity to symb dex and stable dex
		firstTokenAmount = 10000;
		syntTokenAmount = 10000;
		WETHTokenAmount = 10000;
		sThirdTokenAmount = 10000;
		thirdTokenAmount = 10000;
		secondTokenAmount = 10000;

		await library.addLiquidity(
			owner,
			provider,
			symbDex,
			symbFactory,
			[[firstToken, secondToken]],
			[[firstTokenAmount, secondTokenAmount]],
			[sThirdToken, sSecondToken],
			[sThirdTokenAmount, syntTokenAmount],
			uniDex,
			uniFactory,
			[[weth, thirdToken]],
			[[WETHTokenAmount, thirdTokenAmount]]
		);
	});

	it("Should check metaRoute synth V2 Native (swapExactTokensForTokens)", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactETHForTokens",
			[
				0,
				[weth.address, thirdToken.address],
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
				[sThirdTokenAddr, sSecondTokenAddr],
				[100],
				metaRouter.address,
			]
		);

		let finalSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				0,
				0,
				[secondToken.address, firstToken.address],
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
					sSecondTokenAddr,
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
					thirdToken.address,
					recipient.address,
					synthesis.address,
					bridge2.address,
					sender.address,
					hardhatChainID,
					[sThirdTokenAddr, sSecondTokenAddr],
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

		let tx = await metaRouter.connect(sender).metaRoute(
			{
				firstDexRouter: uniDex.address,
				secondDexRouter: stableDex.address,
				amount: amountIn,
				nativeIn: true,
				firstSwapCalldata: firstSwapCalldata,
				approvedTokens: [weth.address, thirdToken.address],
				secondSwapCalldata: ethers.utils.hexConcat([]),
				relayRecipient: portal1.address,
				otherSideCalldata: otherSideCalldata,
			},
			{ value: amountIn }
		);

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);
		let tx2 = await bridge2.receiveRequestV2(callData, receiveSide);

		let receiptMetaRoute2 = await tx2.wait();
		let metaRouteOracleRequestArgs2 = await library.catchOracleRequest(
			receiptMetaRoute2
		);
		let callData2 = metaRouteOracleRequestArgs2[1];
		let receiveSide2 = metaRouteOracleRequestArgs2[2];

		expect(receiveSide2).to.eq(portal2.address);

		await bridge3.receiveRequestV2(callData2, receiveSide2);

		let expectedBalance = 2360;

		console.log(
			"Final balance:",
			(await firstToken.balanceOf(recipient.address)).toString()
		);

		expect(await firstToken.balanceOf(recipient.address)).to.eq(
			expectedBalance
		);
	});

	afterEach(async () => {
		expect(await firstToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await weth.balanceOf(metaRouter.address)).to.eq(0);
		expect(await sSecondToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await secondToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await thirdToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await sThirdToken.balanceOf(metaRouter.address)).to.eq(0);
	});
});
