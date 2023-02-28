const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("../utils");
const {
	swapInterface,
	synthInterface,
	hardhatChainID,
	stableBridgingFee,
	burnInterface,
} = require("../utils");
const wethAbi = require("../abi/WETH9.json");
const ERC20Abi = require("../abi/ERC20Mock.json");
const stableSwapInterface = new ethers.utils.Interface([
	"function multicall(uint256,bytes[],address[],address[],uint256[],address)",
]);

let secondToken,
	thirdToken,
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

describe("MetaRouter V2 tests", function () {
	beforeEach(async () => {
		[owner, recipient, sender, provider] = await ethers.getSigners();

		console.log("Owner account:", owner.address);

		// get factories for contracts
		const ERC20 = await ethers.getContractFactory(
			ERC20Abi.abi,
			ERC20Abi.bytecode
		);
		const WETH = await ethers.getContractFactory(
			wethAbi.abi,
			wethAbi.bytecode
		);
		secondToken = await ERC20.deploy("Second Token", "SECOND", 18);
		thirdToken = await ERC20.deploy("Third Token", "THIRD", 18);
		weth = await WETH.deploy();

		console.log("Deploy tokens.");

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
			[secondToken, thirdToken],
			[20000 + stableBridgingFee, 10000],
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
			[],
			[],
			[sweth, sTestToken],
			[sWETHTokenAmount, syntTokenAmount],
			uniDex,
			uniFactory,
			[[secondToken, thirdToken]],
			[[secondTokenAmount, thirdTokenAmount]]
		);
	});

	it("Should check metaRoute V2 without final swap", async () => {
		let amountIn = 5000;

		let firstSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokensSupportingFeeOnTransferTokens",
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

		let finalCalldata = burnInterface.encodeFunctionData(
			"metaBurnSyntheticToken",
			[
				[
					stableBridgingFee,
					50,
					sender.address,
					symbDex.address,
					sweth.address,
					ethers.utils.hexConcat([]),
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

		let expectedBalance = 3100;

		console.log(
			"Final balance:",
			(await weth.balanceOf(recipient.address)).toString()
		);

		expect(await weth.balanceOf(recipient.address)).to.eq(expectedBalance);
	});

	afterEach(async () => {
		expect(await weth.balanceOf(metaRouter.address)).to.eq(0);
		expect(await sTestToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await secondToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await thirdToken.balanceOf(metaRouter.address)).to.eq(0);
	});
});
