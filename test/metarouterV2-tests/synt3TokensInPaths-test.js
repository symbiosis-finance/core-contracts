const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("../utils");
const {
	swapInterface,
	synthInterface,
	hardhatChainID,
	stableBridgingFee,
	burnInterface,
	linkBytecode,
	deployTokensMetaRouterTest,
} = require("../utils");
const ERC20Abi = require("../abi/ERC20Mock.json");
const mathUtilsAbi = require("../abi/MathUtils.json");
const swapUtilsAbi = require("../abi/SwapUtils.json");
const swapAbi = require("../abi/Swap.json");
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
	stableDex2,
	uniDex,
	weth,
	metaRouter,
	sTestTokenAddr,
	synthMiddleToken,
	sWethAddr,
	portal1,
	portal2,
	synthesis,
	sTestToken,
	sweth,
	owner,
	recipient,
	sender;

describe("MetaRouter synth V2 tests (3 tokens in first, final paths)", function () {
	beforeEach(async () => {
		[owner, recipient, sender, provider] = await ethers.getSigners();

		console.log("Owner account:", owner.address);

		const ERC20 = await ethers.getContractFactory(
			ERC20Abi.abi,
			ERC20Abi.bytecode
		);
		firstMiddleToken = await ERC20.deploy(
			"First Middle Token",
			"FIRSTM",
			18
		);
		secondMiddleToken = await ERC20.deploy(
			"Second Middle Token",
			"SECONDM",
			18
		);
		synthMiddleToken = await ERC20.deploy(
			"Synth Middle Token",
			"SYNTHM",
			18
		);

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
			secondToken.address,
			weth.address
		);

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
				[sTestTokenAddr, synthMiddleToken.address],
				weth
			);

		const MathUtils = await ethers.getContractFactory(
			mathUtilsAbi.abi,
			mathUtilsAbi.bytecode
		);

		const mathUtils = await MathUtils.deploy();

		const swapUtilsLinkedBytecode = linkBytecode(swapUtilsAbi, {
			MathUtils: mathUtils.address,
		});
		const SwapUtils = await ethers.getContractFactory(
			swapUtilsAbi.abi,
			swapUtilsLinkedBytecode
		);

		swapUtils = await SwapUtils.deploy();

		const stableDexLinkedBytecode = linkBytecode(swapAbi, {
			SwapUtils: swapUtils.address,
		});
		const StableDex = await ethers.getContractFactory(
			swapAbi.abi,
			stableDexLinkedBytecode
		);

		stableDex2 = await StableDex.deploy(
			[synthMiddleToken.address, sWethAddr],
			[18, 18],
			"Symbiosis STBL pool",
			"SymbPool",
			50,
			1e7,
			0,
			0,
			0,
			owner.address
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
			[
				firstToken,
				secondToken,
				thirdToken,
				firstMiddleToken,
				secondMiddleToken,
				synthMiddleToken,
			],
			[10000, 20000 + stableBridgingFee, 10000, 20000, 20000, 20000],
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
		secondMiddleTokenAmount = 10000;
		firstMiddleTokenAmount = 10000;
		syntMiddleTokenAmount = 10000;

		await library.addLiquidity(
			owner,
			provider,
			symbDex,
			symbFactory,
			[
				[firstToken, firstMiddleToken],
				[firstMiddleToken, weth],
			],
			[
				[firstTokenAmount, firstMiddleTokenAmount],
				[firstMiddleTokenAmount, WETHTokenAmount],
			],
			[sTestToken, synthMiddleToken],
			[sWETHTokenAmount, syntMiddleTokenAmount],
			uniDex,
			uniFactory,
			[
				[secondToken, secondMiddleToken],
				[secondMiddleToken, thirdToken],
			],
			[
				[secondTokenAmount, secondMiddleTokenAmount],
				[secondMiddleTokenAmount, thirdTokenAmount],
			]
		);

		await synthMiddleToken
			.connect(provider)
			.approve(stableDex2.address, syntMiddleTokenAmount);
		await sweth
			.connect(provider)
			.approve(stableDex2.address, syntTokenAmount);
		await stableDex2
			.connect(provider)
			.addLiquidity(
				[syntMiddleTokenAmount, sWETHTokenAmount],
				0,
				ethers.constants.MaxUint256
			);
	});

	it("Should check metaRoute synth V2 (swapExactTokensForTokens)", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
				[
					thirdToken.address,
					secondMiddleToken.address,
					secondToken.address,
				],
				metaRouter.address,
				ethers.constants.MaxUint256,
			]
		);

		let secondSwapCalldata1 = swapInterface.encodeFunctionData("swap", [
			0,
			1,
			0,
			0,
			ethers.constants.MaxUint256,
		]);

		let secondSwapCalldata2 = swapInterface.encodeFunctionData("swap", [
			0,
			1,
			0,
			0,
			ethers.constants.MaxUint256,
		]);

		let secondSwapRouterCalldata = stableSwapInterface.encodeFunctionData(
			"multicall",
			[
				0,
				[secondSwapCalldata1, secondSwapCalldata2],
				[stableDex.address, stableDex2.address],
				[sTestTokenAddr, synthMiddleToken.address, sweth.address],
				[100, 100],
				metaRouter.address,
			]
		);

		let finalSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				0,
				0,
				[weth.address, firstMiddleToken.address, firstToken.address],
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

		let tx = await metaRouter.connect(sender).metaRoute({
			firstDexRouter: uniDex.address,
			secondDexRouter: stableDex.address,
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

		let tx2 = await bridge2.receiveRequestV2(callData, receiveSide);

		let receiptMetaRoute2 = await tx2.wait();
		let metaRouteOracleRequestArgs2 = await library.catchOracleRequest(
			receiptMetaRoute2
		);
		let callData2 = metaRouteOracleRequestArgs2[1];
		let receiveSide2 = metaRouteOracleRequestArgs2[2];

		expect(receiveSide2).to.eq(portal2.address);

		await bridge3.receiveRequestV2(callData2, receiveSide2);

		let expectedBalance = 1550;

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
		expect(await sTestToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await secondToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await thirdToken.balanceOf(metaRouter.address)).to.eq(0);
	});
});
