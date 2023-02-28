const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("./library");
const {constants} = require("ethers");
const uniFactoryV2Abi = require("../abi/UniswapV2Factory.json");
const uniV2Abi = require("../abi/UniswapV2Router02.json");
const ERC20Abi = require("../abi/ERC20Mock.json");

const hardhatChainID = 31337;
const stableBridgingFee = 100;

let swapInterface = new ethers.utils.Interface([
	"function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
]);

let firstToken,
	secondToken,
	bridge,
	weth,
	portal,
	synthesis,
	sTestToken,
	owner,
	provider;

async function getContractFactory(name) {
	return await ethers.getContractFactory(name);
}

async function addLiquidity(firstTokenAmount, secondTokenAmount) {
	await uniswapRouter
		.connect(provider)
		.addLiquidity(
			firstToken.address,
			secondToken.address,
			firstTokenAmount.toString(),
			secondTokenAmount.toString(),
			0,
			0,
			owner.address,
			ethers.constants.MaxUint256
		);
}

describe("MetaBurn tests", function () {
	beforeEach(async () => {
		[owner, user, provider, oracle] = await ethers.getSigners();

		const ERC20Abi = require("../abi/ERC20Mock.json");
		const ERC20 = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);
		[weth, sTestToken, firstToken, bridge, portal, synthesis] =
			await library.deployContracts();

		const uniFactoryV2Abi = require('../abi/UniswapV2Factory.json');
		const uniV2Abi = require('../abi/UniswapV2Router02.json');

		const UniswapV2Factory = await ethers.getContractFactory(uniFactoryV2Abi.abi, uniFactoryV2Abi.bytecode);
		const UniswapV2Router02 = await ethers.getContractFactory(uniV2Abi.abi, uniV2Abi.bytecode);
		console.log("Get factories for contracts.");

		// deploy tokens
		secondToken = await ERC20.deploy("Second Token", "SECOND", 18);

		console.log("Deploy tokens.");

		console.log("Create synt representation for secondToken.");

		// deploy uniswapRouter
		uniswapFactory = await UniswapV2Factory.deploy(owner.address);

		uniswapRouter = await UniswapV2Router02.deploy(
			uniswapFactory.address,
			weth.address
		);

		// approves for uniswapRouter
		for await (let token of [firstToken, secondToken]) {
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

		// mint tokens
		firstToken.mint(provider.address, String(20000));
		secondToken.mint(provider.address, String(10000));

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
				user.address,
				hardhatChainID,
				clientId
			);

		let receipt = await txSynt.wait();
		let oracleRequestArgs = await library.catchOracleRequest(receipt);

		let bytesSelector = oracleRequestArgs[1];
		let receiveSideSynt = oracleRequestArgs[2];

		await bridge.receiveRequestV2(bytesSelector, receiveSideSynt);

		expect(await secondToken.balanceOf(provider.address)).to.eq(
			String(10000)
		);
		expect(await sTestToken.balanceOf(provider.address)).to.eq(
			String(10000 - stableBridgingFee)
		);

		console.log("All required tokens minted");

		// add liquidity to uniV2 dex and stable dex
		firstTokenAmount = 10000;
		secondTokenAmount = 10000;

		await addLiquidity(firstTokenAmount, secondTokenAmount);

		let symbPair = await uniswapFactory.getPair(
			firstToken.address,
			secondToken.address
		);

		expect(await firstToken.balanceOf(symbPair)).to.eq(
			String(firstTokenAmount)
		);
		expect(await secondToken.balanceOf(symbPair)).to.eq(
			String(secondTokenAmount)
		);

		console.log("Add liquidity to dexes");
	});

	it("Should check metaBurn", async () => {
		let amountIn = 9000;

		let swapCallData = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
				[firstToken.address, secondToken.address],
				user.address,
				ethers.constants.MaxUint256,
			]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");
		let metaBurnTx = await synthesis
			.connect(provider)
			.metaBurnSyntheticToken({
				stableBridgingFee: stableBridgingFee,
				syntCaller: owner.address,
				finalReceiveSide: uniswapRouter.address,
				sToken: sTestToken.address,
				finalCallData: swapCallData,
				finalOffset: 36,
				amount: amountIn,
				chain2address: user.address,
				receiveSide: portal.address,
				oppositeBridge: bridge.address,
				revertableAddress: user.address,
				chainID: hardhatChainID,
				clientID: clientId
			});

		let receiptMetaBurn = await metaBurnTx.wait();
		let metaBurnOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaBurn
		);

		let callData = metaBurnOracleRequestArgs[1];
		let receiveSide = metaBurnOracleRequestArgs[2];

		expect(receiveSide).to.eq(portal.address);

		await bridge.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 4701;

		console.log(
			"Final balance:",
			(await secondToken.balanceOf(user.address)).toString()
		);

		expect(await secondToken.balanceOf(user.address)).to.eq(
			expectedBalance
		);
	});

	it("Should check metaBurn without swap", async () => {
		let amountIn = 9000;

		let clientId = ethers.utils.formatBytes32String("some client id");
		let metaBurnTx = await synthesis
			.connect(provider)
			.metaBurnSyntheticToken({
				stableBridgingFee: stableBridgingFee,
				syntCaller: owner.address,
				finalReceiveSide: uniswapRouter.address,
				sToken: sTestToken.address,
				finalCallData: ethers.utils.hexConcat([]),
				finalOffset: 36,
				amount: amountIn,
				chain2address: user.address,
				receiveSide: portal.address,
				oppositeBridge: bridge.address,
				revertableAddress: user.address,
				chainID: hardhatChainID,
				clientID: clientId
			});

		let receiptMetaBurn = await metaBurnTx.wait();
		let metaBurnOracleRequestArgs = await library.catchOracleRequest(
			receiptMetaBurn
		);

		let callData = metaBurnOracleRequestArgs[1];
		let receiveSide = metaBurnOracleRequestArgs[2];

		expect(receiveSide).to.eq(portal.address);

		await bridge.receiveRequestV2(callData, receiveSide);

		let expectedBalance = 9000 - stableBridgingFee;

		console.log(
			"Final balance:",
			(await firstToken.balanceOf(user.address)).toString()
		);

		expect(await firstToken.balanceOf(user.address)).to.eq(expectedBalance);
	});

	context("metaBurn negative tests", function () {
		it("Should fail on metaBurn when amount under threshold", async () => {
			let amountIn = 9000;

			await synthesis.setTokenThreshold(sTestToken.address, amountIn + 1);

			let swapCallData = swapInterface.encodeFunctionData(
				"swapExactTokensForTokens",
				[
					amountIn,
					0,
					[firstToken.address, secondToken.address],
					user.address,
					ethers.constants.MaxUint256,
				]
			);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				synthesis.connect(provider).metaBurnSyntheticToken({
					stableBridgingFee: stableBridgingFee,
					syntCaller: owner.address,
					finalReceiveSide: uniswapRouter.address,
					sToken: sTestToken.address,
					finalCallData: swapCallData,
					finalOffset: 36,
					amount: amountIn,
					chain2address: user.address,
					receiveSide: portal.address,
					oppositeBridge: bridge.address,
					revertableAddress: user.address,
					chainID: hardhatChainID,
					clientID: clientId
				})
			).to.be.revertedWith("Symb: amount under threshold");
		});

		it("Should fail on metaBurn with incorrect synt", async () => {
			let amountIn = 9000;

			const ERC20Abi = require('../abi/ERC20Mock.json');
			const ERC20Mock = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);
			let fakeSynt = await ERC20Mock.deploy("Fake Synt", "Fake Synt", 18);
			await fakeSynt.mint(user.address, constants.WeiPerEther.mul(5));

			let swapCallData = swapInterface.encodeFunctionData(
				"swapExactTokensForTokens",
				[
					amountIn,
					0,
					[firstToken.address, secondToken.address],
					user.address,
					ethers.constants.MaxUint256,
				]
			);
			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				synthesis.connect(user).metaBurnSyntheticToken({
					stableBridgingFee: stableBridgingFee,
					syntCaller: owner.address,
					finalReceiveSide: uniswapRouter.address,
					sToken: fakeSynt.address,
					finalCallData: swapCallData,
					finalOffset: 36,
					amount: amountIn,
					chain2address: user.address,
					receiveSide: portal.address,
					oppositeBridge: bridge.address,
					revertableAddress: user.address,
					chainID: hardhatChainID,
					clientID: clientId
				})
			).to.be.revertedWith("Symb: incorrect synt");
		});

		it("Should fail on metaUnsynthesize with synthetic tokens emergencyUnburn", async () => {
			let amountIn = 9000;

			let swapCallData = swapInterface.encodeFunctionData(
				"swapExactTokensForTokens",
				[
					amountIn,
					0,
					[firstToken.address, secondToken.address],
					user.address,
					ethers.constants.MaxUint256,
				]
			);

			let clientId = ethers.utils.formatBytes32String("some client id");

			let metaBurnTx = await synthesis
				.connect(provider)
				.metaBurnSyntheticToken({
					stableBridgingFee: stableBridgingFee,
					syntCaller: owner.address,
					finalReceiveSide: uniswapRouter.address,
					sToken: sTestToken.address,
					finalCallData: swapCallData,
					finalOffset: 36,
					amount: amountIn,
					chain2address: user.address,
					receiveSide: portal.address,
					oppositeBridge: bridge.address,
					revertableAddress: user.address,
					chainID: hardhatChainID,
					clientID: clientId
				});

			let receiptMetaBurn = await metaBurnTx.wait();
			let metaBurnOracleRequestArgs = await library.catchOracleRequest(
				receiptMetaBurn
			);

			let callData = metaBurnOracleRequestArgs[1];
			let receiveSide = metaBurnOracleRequestArgs[2];

			await bridge.receiveRequestV2(callData, receiveSide);

			await expect(
				bridge.receiveRequestV2(callData, receiveSide)
			).to.be.revertedWith("Symb: synthetic tokens emergencyUnburn");
		});
	});
});
