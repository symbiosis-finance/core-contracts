const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("./library");
const uniFactoryV2Abi = require("../abi/UniswapV2Factory.json");
const uniV2Abi = require("../abi/UniswapV2Router02.json");
const ERC20Abi = require("../abi/ERC20Mock.json");
const mathUtilsAbi = require("../abi/MathUtils.json");
const swapUtilsAbi = require("../abi/SwapUtils.json");
const swapAbi = require("../abi/Swap.json");
const {linkBytecode} = require("../utils");

const hardhatChainID = 31337;
const iface = new ethers.utils.Interface([
	"function swap(uint8,uint8,uint256,uint256,uint256)",
	"function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
]);
const stableSwapInterface = new ethers.utils.Interface([
	"function multicall(uint256,bytes[],address[],address[],uint256[],address)",
]);
const stableBridgingFee = 100;

let firstToken,
	secondToken,
	bridge,
	weth,
	portal,
	synthesis,
	sTestToken,
	owner,
	user,
	provider;

async function getContractFactory(name) {
	return await ethers.getContractFactory(name);
}

async function addLiquidity(
	firstTokenAmount,
	secondTokenAmount,
	thirdTokenAmount
) {
	await uniswapRouter
		.connect(provider)
		.addLiquidity(
			secondToken.address,
			thirdToken.address,
			secondTokenAmount.toString(),
			thirdTokenAmount.toString(),
			0,
			0,
			owner.address,
			ethers.constants.MaxUint256
		);

	await stableDex
		.connect(provider)
		.addLiquidity(
			[firstTokenAmount, secondTokenAmount],
			0,
			ethers.constants.MaxUint256
		);
}

describe("MetaSynthesize tests", function () {
	beforeEach(async () => {
		[owner, user, provider, oracle] = await ethers.getSigners();

		// get factories for contracts
		const ERC20Abi = require("../abi/ERC20Mock.json");
		const ERC20 = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);
		[weth, sTestToken, firstToken, bridge, portal, synthesis] =
			await library.deployContracts();

		const uniFactoryV2Abi = require('../abi/UniswapV2Factory.json');
		const uniV2Abi = require('../abi/UniswapV2Router02.json');

		const UniswapV2Factory = await ethers.getContractFactory(uniFactoryV2Abi.abi, uniFactoryV2Abi.bytecode);
		const UniswapV2Router02 = await ethers.getContractFactory(uniV2Abi.abi, uniV2Abi.bytecode);

		const mathUtilsAbi = require('../abi/MathUtils.json');
		const swapUtilsAbi = require('../abi/SwapUtils.json');
		const swapAbi = require('../abi/Swap.json');
		const MathUtils = await ethers.getContractFactory(mathUtilsAbi.abi, mathUtilsAbi.bytecode);

		const mathUtils = await MathUtils.deploy();

		const swapUtilsLinkedBytecode = linkBytecode(swapUtilsAbi, {'MathUtils': mathUtils.address});
		const SwapUtils = await ethers.getContractFactory(swapUtilsAbi.abi, swapUtilsLinkedBytecode);

		swapUtils = await SwapUtils.deploy();

		const stableDexLinkedBytecode = linkBytecode(swapAbi, {'SwapUtils': swapUtils.address});
		const StableDex = await ethers.getContractFactory(swapAbi.abi, stableDexLinkedBytecode);

		console.log("Get factories for contracts.");

		// deploy tokens
		secondToken = await ERC20.deploy("Second Token", "SECOND", 18);
		thirdToken = await ERC20.deploy("Third Token", "THIRD", 18);

		console.log("Deploy tokens.");

		console.log("Create synt representation for firstToken.");

		const StableRouter = await ethers.getContractFactory("MulticallRouter");
		stableRouter = await StableRouter.deploy();

		// deploy stableDex
		stableDex = await StableDex.deploy(
			[sTestToken.address, secondToken.address],
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

		console.log("Stable dex deployed.");

		// deploy uniswapRouter
		uniswapFactory = await UniswapV2Factory.deploy(owner.address);

		uniswapRouter = await UniswapV2Router02.deploy(
			uniswapFactory.address,
			weth.address
		);

		// approves for stableDex
		for await (let token of [sTestToken, secondToken]) {
			token
				.connect(provider)
				.approve(stableDex.address, ethers.constants.MaxUint256);
		}

		// approves for uniswapRouter
		for await (let token of [secondToken, thirdToken]) {
			token
				.connect(provider)
				.approve(uniswapRouter.address, ethers.constants.MaxUint256);
		}

		// approves for portal
		await firstToken
			.connect(provider)
			.approve(portal.address, ethers.constants.MaxUint256);

		//set minimal token price
		await portal.setTokenThreshold(firstToken.address, 100);
		await portal.setTokenThreshold(secondToken.address, 100);
		await portal.setTokenThreshold(thirdToken.address, 100);

		// mint tokens
		secondToken.mint(provider.address, String(20000));
		firstToken.mint(provider.address, String(20000));
		thirdToken.mint(provider.address, String(10000));

		let clientId = ethers.utils.formatBytes32String("some client id");

		let txSynt = await portal
			.connect(provider)
			.synthesize(
				stableBridgingFee,
				firstToken.address,
				String(10000),
				provider.address,
				synthesis.address,
				bridge.address,
				ethers.constants.AddressZero,
				hardhatChainID,
				clientId
			);

		let receipt = await txSynt.wait();
		let oracleRequestArgs = await library.catchOracleRequest(receipt);

		let bytesSelector = oracleRequestArgs[1];
		let receiveSideSynt = oracleRequestArgs[2];

		await bridge.receiveRequestV2(bytesSelector, receiveSideSynt);

		expect(await firstToken.balanceOf(provider.address)).to.eq(
			String(10000)
		);
		expect(await secondToken.balanceOf(provider.address)).to.eq(
			String(20000)
		);
		expect(await sTestToken.balanceOf(provider.address)).to.eq(
			String(10000 - stableBridgingFee)
		);
		expect(await thirdToken.balanceOf(provider.address)).to.eq(
			String(10000)
		);

		console.log("All required tokens minted");

		// add liquidity to uniV2 dex and stable dex
		firstTokenAmount = 10000 - stableBridgingFee;
		secondTokenAmount = 10000;
		thirdTokenAmount = 10000;

		await addLiquidity(
			firstTokenAmount,
			secondTokenAmount,
			thirdTokenAmount
		);

		let symbPair = await uniswapFactory.getPair(
			thirdToken.address,
			secondToken.address
		);

		expect(await thirdToken.balanceOf(symbPair)).to.eq(
			String(thirdTokenAmount)
		);
		expect(await secondToken.balanceOf(symbPair)).to.eq(
			String(secondTokenAmount)
		);

		expect(await sTestToken.balanceOf(stableDex.address)).to.eq(
			String(firstTokenAmount)
		);
		expect(await secondToken.balanceOf(stableDex.address)).to.eq(
			String(secondTokenAmount)
		);

		console.log("Add liquidity to dexes");
	});

	it("Should check metaSynthesize", async () => {
		let amountIn = 9000;

		let secondSwapCalldata = iface.encodeFunctionData("swap", [
			0,
			1,
			amountIn,
			0,
			ethers.constants.MaxUint256,
		]);

		let secondSwapRouterCalldata = stableSwapInterface.encodeFunctionData("multicall", [
			100,
			[secondSwapCalldata],
			[stableDex.address],
			[sTestTokenAddr, secondToken.address],
			[100],
			metaRouter.address
		]);

		let finalSwapCalldata = iface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				0,
				0,
				[secondToken.address, thirdToken.address],
				user.address,
				ethers.constants.MaxUint256,
			]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");

		let tx = await portal.connect(provider).metaSynthesize({
			stableBridgingFee: stableBridgingFee,
			rtoken: firstToken.address,
			amount: amountIn,
			chain2address: user.address,
			receiveSide: synthesis.address,
			oppositeBridge: bridge.address,
			syntCaller: owner.address,
			chainID: hardhatChainID,
			swapTokens: [
				sTestToken.address,
				secondToken.address,
				thirdToken.address,
			],
			secondDexRouter: stableRouter.address,
			secondSwapCalldata: secondSwapRouterCalldata,
			finalReceiveSide: uniswapRouter.address,
			finalCalldata: finalSwapCalldata,
			finalOffset: 36,
			revertableAddress: user.address,
			clientID: clientId
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await bridge.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 4564;

		console.log(
			"Final balance:",
			(await thirdToken.balanceOf(user.address)).toString()
		);

		expect(await thirdToken.balanceOf(user.address)).to.eq(expectedBalance);
	});

	it("Should check fail on metaSynthesize with token that has no synt representation", async () => {
		let amountIn = 9000;

		let secondSwapCalldata = iface.encodeFunctionData("swap", [
			0,
			1,
			amountIn,
			0,
			ethers.constants.MaxUint256,
		]);

		let secondSwapRouterCalldata = stableSwapInterface.encodeFunctionData("multicall", [
			100,
			[secondSwapCalldata],
			[stableDex.address],
			[sTestTokenAddr, secondToken.address],
			[100],
			metaRouter.address
		]);

		let finalSwapCalldata = iface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				0,
				0,
				[secondToken.address, thirdToken.address],
				user.address,
				ethers.constants.MaxUint256,
			]
		);

		const ERC20Abi = require("../abi/ERC20Mock.json");
		const TestToken = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);
		let testToken2 = await TestToken.deploy("First Token", "FIRST", 18);
		const mintableAmount = ethers.constants.WeiPerEther.mul(20);

		await testToken2.mint(owner.address, mintableAmount);
		await testToken2.approve(portal.address, mintableAmount);

		await portal.setWhitelistToken(testToken2.address, true);

		let clientId = ethers.utils.formatBytes32String("some client id");

		let tx = await portal.metaSynthesize({
			stableBridgingFee: stableBridgingFee,
			rtoken: testToken2.address,
			amount: amountIn,
			chain2address: user.address,
			receiveSide: synthesis.address,
			oppositeBridge: bridge.address,
			syntCaller: owner.address,
			chainID: hardhatChainID,
			swapTokens: [
				sTestToken.address,
				secondToken.address,
				thirdToken.address,
			],
			secondDexRouter: stableRouter.address,
			secondSwapCalldata: secondSwapRouterCalldata,
			finalReceiveSide: uniswapRouter.address,
			revertableAddress: user.address,
			finalOffset: 36,
			finalCalldata: finalSwapCalldata,
			clientID: clientId
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		await expect(
			bridge.receiveRequestV2(callData, receiveSide)
		).to.be.revertedWith(
			"Symb: There is no synt representation for this token"
		);
	});

	it("Should check metaSynthesize without final swap", async () => {
		let amountIn = 9000;

		let secondSwapCalldata = iface.encodeFunctionData("swap", [
			0,
			1,
			amountIn,
			0,
			ethers.constants.MaxUint256,
		]);

		let secondSwapRouterCalldata = stableSwapInterface.encodeFunctionData("multicall", [
			100,
			[secondSwapCalldata],
			[stableDex.address],
			[sTestTokenAddr, secondToken.address],
			[100],
			metaRouter.address
		]);

		let clientId = ethers.utils.formatBytes32String("some client id");

		let tx = await portal.connect(provider).metaSynthesize({
			stableBridgingFee: stableBridgingFee,
			rtoken: firstToken.address,
			amount: amountIn,
			chain2address: user.address,
			receiveSide: synthesis.address,
			oppositeBridge: bridge.address,
			syntCaller: owner.address,
			chainID: hardhatChainID,
			swapTokens: [sTestToken.address, secondToken.address],
			secondDexRouter: stableRouter.address,
			secondSwapCalldata: secondSwapRouterCalldata,
			finalReceiveSide: uniswapRouter.address,
			finalCalldata: ethers.utils.hexConcat([]),
			finalOffset: 36,
			revertableAddress: user.address,
			clientID: clientId
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await bridge.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 8423;

		console.log(
			"Final balance:",
			(await secondToken.balanceOf(user.address)).toString()
		);

		expect(await secondToken.balanceOf(user.address)).to.eq(
			expectedBalance
		);
	});

	it("Should check metaSynthesize without swaps", async () => {
		let amountIn = 9000;

		let clientId = ethers.utils.formatBytes32String("some client id");

		let tx = await portal.connect(provider).metaSynthesize({
			stableBridgingFee: stableBridgingFee,
			rtoken: firstToken.address,
			amount: amountIn,
			chain2address: user.address,
			receiveSide: synthesis.address,
			oppositeBridge: bridge.address,
			syntCaller: owner.address,
			chainID: hardhatChainID,
			swapTokens: [],
			secondDexRouter: stableDex.address,
			secondSwapCalldata: ethers.utils.hexConcat([]),
			finalReceiveSide: uniswapRouter.address,
			finalCalldata: ethers.utils.hexConcat([]),
			finalOffset: 36,
			revertableAddress: user.address,
			clientID: clientId
		});

		let receiptMetaRoute = await tx.wait();
		let metaRouteOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaRoute
		);

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await bridge.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 9000 - stableBridgingFee;

		console.log(
			"Final balance:",
			(await sTestToken.balanceOf(user.address)).toString()
		);

		expect(await sTestToken.balanceOf(user.address)).to.eq(expectedBalance);
	});

	context("metaSynthesize negative tests", function () {
		it("Should check metaMint call when tokens have been already synthesized", async () => {
			let amountIn = 9000;
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 1234345235");

			let secondSwapCalldata = iface.encodeFunctionData("swap", [
				0,
				1,
				amountIn,
				0,
				ethers.constants.MaxUint256,
			]);

			let secondSwapRouterCalldata = stableSwapInterface.encodeFunctionData("multicall", [
				100,
				[secondSwapCalldata],
				[stableDex.address],
				[sTestTokenAddr, secondToken.address],
				[100],
				metaRouter.address
			]);

			let finalSwapCalldata = iface.encodeFunctionData(
				"swapExactTokensForTokens",
				[
					0,
					0,
					[secondToken.address, thirdToken.address],
					user.address,
					ethers.constants.MaxUint256,
				]
			);

			let metaMintIface = new ethers.utils.Interface([
				"function metaMintSyntheticToken((uint256,uint256,bytes32,address,uint256,address,address[],address,bytes,address,bytes,uint256))",
			]);

			let metaMintSyntheticTokenCallData =
				metaMintIface.encodeFunctionData("metaMintSyntheticToken", [
					[
						stableBridgingFee,
						amountIn,
						bytes32Id,
						firstToken.address,
						hardhatChainID,
						user.address,
						[sTestToken.address, secondToken.address],
						stableRouter.address,
						secondSwapRouterCalldata,
						uniswapRouter.address,
						finalSwapCalldata,
						36,
					],
				]);

			await bridge.receiveRequestV2(
				metaMintSyntheticTokenCallData,
				synthesis.address
			);

			let tx = bridge.receiveRequestV2(
				metaMintSyntheticTokenCallData,
				synthesis.address
			);

			await expect(tx).to.be.revertedWith(
				"Symb: revertSynthesizedRequest called or tokens have been already synthesized"
			);
		});

		it("Should fail on amount under threshold during metaSynthesize", async () => {
			let amountIn = 9000;

			await portal.setTokenThreshold(firstToken.address, amountIn + 1);

			let secondSwapCalldata = iface.encodeFunctionData("swap", [
				0,
				1,
				amountIn,
				0,
				ethers.constants.MaxUint256,
			]);

			let finalSwapCalldata = iface.encodeFunctionData(
				"swapExactTokensForTokens",
				[
					0,
					0,
					[secondToken.address, thirdToken.address],
					user.address,
					ethers.constants.MaxUint256,
				]
			);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.connect(provider).metaSynthesize({
					stableBridgingFee: stableBridgingFee,
					rtoken: firstToken.address,
					amount: amountIn,
					chain2address: user.address,
					receiveSide: synthesis.address,
					oppositeBridge: bridge.address,
					syntCaller: owner.address,
					chainID: hardhatChainID,
					swapTokens: [
						sTestToken.address,
						secondToken.address,
						thirdToken.address,
					],
					secondDexRouter: stableDex.address,
					secondSwapCalldata: secondSwapCalldata,
					finalReceiveSide: uniswapRouter.address,
					finalCalldata: finalSwapCalldata,
					finalOffset: 36,
					revertableAddress: user.address,
					clientID: clientId
				})
			).to.be.revertedWith("Symb: amount under threshold");
		});
	});
});
