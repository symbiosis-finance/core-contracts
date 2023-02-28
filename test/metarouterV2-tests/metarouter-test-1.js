const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("../utils");
const {
	swapInterface,
	synthInterface,
	hardhatChainID,
	stableBridgingFee,
	deployTokensMetaRouterTest,
} = require("../utils");
const stableSwapInterface = new ethers.utils.Interface([
	"function multicall(uint256,bytes[],address[],address[],uint256[],address)",
]);

let firstToken,
	secondToken,
	thirdToken,
	bridge2,
	symbDex,
	stableDex,
	uniDex,
	weth,
	metaRouter,
	sTestTokenAddr,
	portal1,
	synthesis,
	sTestToken,
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

		[_, bridge1, bridge2, _, portal1, _, synthesis, metaRouter] =
			await library.deploySynthContracts(
				owner,
				secondToken.address,
				weth.address
			);
		await portal1.setWhitelistToken(weth.address, true);

		[sTestTokenAddr, sTestToken, sWethAddr, sweth] =
			await library.createSyntRepr(
				secondToken,
				weth,
				synthesis,
				synthesis
			);

		const StableRouter = await ethers.getContractFactory("MulticallRouter");
		stableRouter = await StableRouter.deploy();

		[symbFactory, symbDex, stableDex, uniFactory, uniDex] =
			await library.deployDexes(
				owner,
				[sTestTokenAddr, sweth.address],
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
			portal1,
			20000 + stableBridgingFee,
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
			[[firstToken, sweth]],
			[[firstTokenAmount, sWETHTokenAmount]],
			[sweth, sTestToken],
			[sWETHTokenAmount, syntTokenAmount],
			uniDex,
			uniFactory,
			[[secondToken, thirdToken]],
			[[secondTokenAmount, thirdTokenAmount]]
		);
	});

	it("Should check metaRoute V2 with second manager chain", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
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
			"swapExactTokensForTokens",
			[
				0,
				0,
				[sweth.address, firstToken.address],
				recipient.address,
				ethers.constants.MaxUint256,
			]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");

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
					symbDex.address,
					finalSwapCalldata,
					36,
					recipient.address,
					clientId,
				],
			]
		);

		let tx = await metaRouter.connect(sender).metaRoute({
			firstDexRouter: uniDex.address,
			secondDexRouter: stableRouter.address,
			amount: amountIn,
			nativeIn: false,
			firstSwapCalldata: firstSwapCalldata,
			approvedTokens: [thirdToken.address, secondToken.address],
			secondSwapCalldata: ethers.utils.hexConcat([]),
			relayRecipient: portal1.address,
			otherSideCalldata: otherSideCalldata,
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await bridge2.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 2418;

		console.log(
			"Final balance:",
			(await firstToken.balanceOf(recipient.address)).toString()
		);

		expect(await firstToken.balanceOf(recipient.address)).to.eq(
			expectedBalance
		);
	});

	it("Should check metaRoute V2 with second manager chain", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
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
			"swapExactTokensForTokens",
			[
				0,
				5000,
				[sweth.address, firstToken.address],
				recipient.address,
				ethers.constants.MaxUint256,
			]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");

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
					symbDex.address,
					finalSwapCalldata,
					36,
					recipient.address,
					clientId,
				],
			]
		);

		let tx = await metaRouter.connect(sender).metaRoute({
			firstDexRouter: uniDex.address,
			secondDexRouter: stableRouter.address,
			amount: amountIn,
			nativeIn: false,
			firstSwapCalldata: firstSwapCalldata,
			approvedTokens: [thirdToken.address, secondToken.address],
			secondSwapCalldata: ethers.utils.hexConcat([]),
			relayRecipient: portal1.address,
			otherSideCalldata: otherSideCalldata,
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await expect(
			bridge2.receiveRequestV2(callData, receiveSide)
		).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

		let syntRequestTopic = ethers.utils.id(
			"SynthesizeRequest(bytes32,address,uint256,address,address,uint256,address)"
		);

		let synthesizeRequest = receiptMetaRoute.events.filter((x) => {
			return x.topics[0] == syntRequestTopic;
		});

		let metaRouteSyntRequestArgs = ethers.utils.defaultAbiCoder.decode(
			["bytes32", "address", "uint256", "address"],
			synthesizeRequest[0].data
		);
		let syntTxID = metaRouteSyntRequestArgs[0];

		let txRevertSynthesizeRequest = await synthesis
			.connect(recipient)
			.revertSynthesizeRequest(
				stableBridgingFee,
				syntTxID,
				portal1.address,
				bridge1.address,
				hardhatChainID,
				clientId
			);

		let revertSynthesizeReceipt = await txRevertSynthesizeRequest.wait();
		let revertSynthesizeOracleRequestArgs =
			await library.catchOracleRequest(revertSynthesizeReceipt);

		let bytesRevertSynthesizeSelector =
			revertSynthesizeOracleRequestArgs[1];
		let receiveSideSynt = revertSynthesizeOracleRequestArgs[2];

		await bridge1.receiveRequestV2(
			bytesRevertSynthesizeSelector,
			receiveSideSynt
		);

		let expectedBalance = 3226;

		console.log(
			"Final balance:",
			(await secondToken.balanceOf(sender.address)).toString()
		);

		expect(await secondToken.balanceOf(sender.address)).to.eq(
			expectedBalance
		);
	});

	it("Should check metaRoute V2 with second manager chain without final swap when tokens comes to user from metaRouter", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
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

		let clientId = ethers.utils.formatBytes32String("some client id");

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
					ethers.constants.AddressZero,
					ethers.utils.hexConcat([]),
					0,
					recipient.address,
					clientId,
				],
			]
		);

		let tx = await metaRouter.connect(sender).metaRoute({
			firstDexRouter: uniDex.address,
			secondDexRouter: stableRouter.address,
			amount: amountIn,
			nativeIn: false,
			firstSwapCalldata: firstSwapCalldata,
			approvedTokens: [thirdToken.address, secondToken.address],
			secondSwapCalldata: ethers.utils.hexConcat([]),
			relayRecipient: portal1.address,
			otherSideCalldata: otherSideCalldata,
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await bridge2.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 3200;

		console.log(
			"Final balance:",
			(await sweth.balanceOf(recipient.address)).toString()
		);

		expect(await sweth.balanceOf(recipient.address)).to.eq(expectedBalance);
	});

	it("Should check metaRoute V2 with second manager chain without final swap when tokens comes to user from multicall", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
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
				recipient.address,
			]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");

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
					ethers.constants.AddressZero,
					ethers.utils.hexConcat([]),
					0,
					recipient.address,
					clientId,
				],
			]
		);

		let tx = await metaRouter.connect(sender).metaRoute({
			firstDexRouter: uniDex.address,
			secondDexRouter: stableRouter.address,
			amount: amountIn,
			nativeIn: false,
			firstSwapCalldata: firstSwapCalldata,
			approvedTokens: [thirdToken.address, secondToken.address],
			secondSwapCalldata: ethers.utils.hexConcat([]),
			relayRecipient: portal1.address,
			otherSideCalldata: otherSideCalldata,
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await bridge2.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 3200;

		console.log(
			"Final balance:",
			(await sweth.balanceOf(recipient.address)).toString()
		);

		expect(await sweth.balanceOf(recipient.address)).to.eq(expectedBalance);
	});

	afterEach(async () => {
		expect(await firstToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await weth.balanceOf(metaRouter.address)).to.eq(0);
		expect(await sTestToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await secondToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await thirdToken.balanceOf(metaRouter.address)).to.eq(0);
	});
});
