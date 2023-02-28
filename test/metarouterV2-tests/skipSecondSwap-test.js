const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("../utils");
const {
	swapInterface,
	hardhatChainID,
	stableBridgingFee,
	burnInterface,
	deployTokensMetaRouterTest,
} = require("../utils");

let firstToken,
	secondToken,
	thirdToken,
	bridge1,
	bridge2,
	symbDex,
	uniDex,
	weth,
	metaRouter,
	sWethAddr,
	portal1,
	synthesis,
	sweth,
	owner,
	recipient,
	sender;

describe("MetaRouter V2 tests", function () {
	beforeEach(async () => {
		[owner, recipient, sender, provider] = await ethers.getSigners();

		console.log("Owner account:", owner.address);

		[firstToken, secondToken, thirdToken, weth] =
			await deployTokensMetaRouterTest();

		console.log("Deploy tokens.");

		[_, bridge1, bridge2, _, portal1, _, synthesis, metaRouter] =
			await library.deploySynthContracts(
				owner,
				secondToken.address,
				weth.address
			);

		await portal1.setWhitelistToken(weth.address, true);

		[_, _, sWethAddr, sweth] = await library.createSyntRepr(
			secondToken,
			weth,
			synthesis,
			synthesis
		);

		[symbFactory, symbDex, _, uniFactory, uniDex] =
			await library.deployDexes(
				owner,
				[firstToken.address, thirdToken.address],
				weth
			);

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
			[firstToken, thirdToken],
			[10000, 20000 + stableBridgingFee, 10000],
			weth,
			20000 + stableBridgingFee
		);

		await library.synthesize(
			provider,
			portal1,
			10000 + stableBridgingFee,
			weth,
			synthesis,
			bridge2
		);

		expect(await sweth.balanceOf(provider.address)).to.eq(String(10000));

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
			[],
			[],
			uniDex,
			uniFactory,
			[[sweth, thirdToken]],
			[[sWETHTokenAmount, thirdTokenAmount]]
		);
	});

	it("Should check metaRoute V2 with first chain manager without second swap", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
				[thirdToken.address, sWethAddr],
				metaRouter.address,
				ethers.constants.MaxUint256,
			]
		);

		let finalSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				0,
				0,
				[weth.address, firstToken.address],
				recipient.address,
				ethers.constants.MaxUint256,
			]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");

		let otherSideCalldata = burnInterface.encodeFunctionData(
			"metaBurnSyntheticToken",
			[
				[
					stableBridgingFee,
					0,
					sender.address,
					symbDex.address,
					sweth.address,
					finalSwapCalldata,
					36,
					recipient.address,
					portal1.address,
					bridge1.address,
					recipient.address,
					hardhatChainID,
					clientId,
				],
			]
		);

		let tx = await metaRouter.connect(sender).metaRoute({
			firstDexRouter: uniDex.address,
			secondDexRouter: ethers.constants.AddressZero,
			amount: amountIn,
			nativeIn: false,
			firstSwapCalldata: firstSwapCalldata,
			approvedTokens: [thirdToken.address, sWethAddr],
			secondSwapCalldata: ethers.utils.hexConcat([]),
			relayRecipient: synthesis.address,
			otherSideCalldata: otherSideCalldata,
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(portal1.address);

		await bridge1.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 2433;

		console.log(
			"Final balance:",
			(await firstToken.balanceOf(recipient.address)).toString()
		);

		expect(await firstToken.balanceOf(recipient.address)).to.eq(
			expectedBalance
		);
	});

	afterEach(async () => {
		// TODO: check a;; tokens balances here
		expect(await firstToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await weth.balanceOf(metaRouter.address)).to.eq(0);
		expect(await thirdToken.balanceOf(metaRouter.address)).to.eq(0);
	});
});
