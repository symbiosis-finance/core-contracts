const { expect } = require("chai");
const { ethers } = require("hardhat");
const library = require("../utils");
const {
	swapInterface,
	synthInterface,
	hardhatChainID,
	stableBridgingFee,
	stableSwapInterface,
	burnInterface,
	deployTokensMetaRouterTest,
	deployContractsMetaRouterTest,
} = require("../utils");
const revertMetaBurnInterface = new ethers.utils.Interface([
	"function revertMetaBurn(uint256,bytes32,address,bytes,address,address,bytes)",
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
	sTestTokenAddr,
	portal1,
	portal2,
	synthesis,
	sTestToken,
	sweth,
	owner,
	recipient,
	sender;

describe("MetaRouter synth V2 tests, empty contract call", function () {
	beforeEach(async () => {
		[owner, recipient, sender, provider] = await ethers.getSigners();
		console.log("Owner account:", owner.address);

		[firstToken, secondToken, thirdToken, weth] =
			await deployTokensMetaRouterTest();
		[
			_,
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

	it("Should fail on empty contract call", async () => {
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
					metaRouter.address,
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
		let emptyAddress = "0xa67e6742B436765A43E86c48B26aFa597df1093d";
		await expect(
			metaRouter.connect(sender).metaRoute({
				firstDexRouter: uniDex.address,
				secondDexRouter: stableDex.address,
				amount: amountIn,
				nativeIn: false,
				firstSwapCalldata: firstSwapCalldata,
				approvedTokens: [thirdToken.address, secondToken.address],
				secondSwapCalldata: ethers.utils.hexConcat([]),
				relayRecipient: emptyAddress,
				otherSideCalldata: otherSideCalldata,
			})
		).to.be.revertedWith("MetaRouter: call for a non-contract account");
	});

	it("Should check revert after fail on dest chain", async () => {
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
					metaRouter.address,
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

		let burnRequestTopic = ethers.utils.id(
			"BurnRequest(bytes32,address,uint256,address,address,uint256,address)"
		);

		let callData2 = metaRouteOracleRequestArgs2[1];
		let receiveSide2 = metaRouteOracleRequestArgs2[2];

		expect(receiveSide2).to.eq(portal2.address);

		await expect(
			bridge3.receiveRequestV2(callData2, receiveSide2)
		).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

		let metaRouteBurnRequest = receiptMetaRoute2.events.filter((x) => {
			return x.topics[0] == burnRequestTopic;
		});
		let metaRouteBurnRequestArgs = ethers.utils.defaultAbiCoder.decode(
			["bytes32", "address", "uint256", "address"],
			metaRouteBurnRequest[0].data
		);
		let burnTxID = metaRouteBurnRequestArgs[0];

		let swapCalldata = swapInterface.encodeFunctionData("swap", [
			1,
			0,
			0,
			0,
			ethers.constants.MaxUint256,
		]);

		let swapRouterCalldata = stableSwapInterface.encodeFunctionData(
			"multicall",
			[
				0,
				[swapCalldata],
				[stableDex.address],
				[sweth.address, sTestTokenAddr],
				[100],
				metaRouter.address,
			]
		);

		let revertSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
				[secondToken.address, thirdToken.address],
				sender.address,
				ethers.constants.MaxUint256,
			]
		);

		let burnCalldata = burnInterface.encodeFunctionData(
			"metaBurnSyntheticToken",
			[
				[
					stableBridgingFee,
					0,
					metaRouter.address,
					uniDex.address,
					sTestTokenAddr,
					revertSwapCalldata,
					36,
					sender.address,
					portal1.address,
					bridge1.address,
					sender.address,
					hardhatChainID,
					clientId,
				],
			]
		);

		let balanceBeforeRevert = await thirdToken.balanceOf(sender.address);

		let txRevertBurnRequest = await portal2
			.connect(recipient)
			.metaRevertRequest({
				stableBridgingFee: stableBridgingFee,
				internalID: burnTxID,
				receiveSide: synthesis.address,
				managerChainBridge: bridge2.address,
				sourceChainBridge: ethers.constants.AddressZero,
				managerChainId: hardhatChainID,
				sourceChainId: hardhatChainID,
				router: stableRouter.address,
				swapCalldata: swapRouterCalldata,
				sourceChainSynthesis: synthesis.address,
				burnToken: sTestTokenAddr,
				burnCalldata: burnCalldata,
				clientID: clientId,
			});

		let revertBurnReceipt = await txRevertBurnRequest.wait();
		let revertBurnOracleRequestArgs = await library.catchOracleRequest(
			revertBurnReceipt
		);

		let revertBurnSelector = revertBurnOracleRequestArgs[1];
		let revertBurnReceiveSide = revertBurnOracleRequestArgs[2];
		expect(revertBurnReceiveSide).to.eq(synthesis.address);

		let tx3 = await bridge2.receiveRequestV2(
			revertBurnSelector,
			revertBurnReceiveSide
		);

		let receiptRevertBurn = await tx3.wait();
		let revertBurnOracleRequestArgs2 = await library.catchOracleRequest(
			receiptRevertBurn
		);
		let callData3 = revertBurnOracleRequestArgs2[1];
		let receiveSide3 = revertBurnOracleRequestArgs2[2];

		expect(receiveSide3).to.eq(portal1.address);

		await bridge1.receiveRequestV2(callData3, receiveSide3);

		expect(
			(await thirdToken.balanceOf(sender.address)) - balanceBeforeRevert
		).to.eq(4662);
	});

	it("Should check revert after fail on dest chain by bridge", async () => {
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
					metaRouter.address,
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

		let burnRequestTopic = ethers.utils.id(
			"BurnRequest(bytes32,address,uint256,address,address,uint256,address)"
		);

		let callData2 = metaRouteOracleRequestArgs2[1];
		let receiveSide2 = metaRouteOracleRequestArgs2[2];

		expect(receiveSide2).to.eq(portal2.address);

		await expect(
			bridge3.receiveRequestV2(callData2, receiveSide2)
		).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

		let metaRouteBurnRequest = receiptMetaRoute2.events.filter((x) => {
			return x.topics[0] == burnRequestTopic;
		});
		let metaRouteBurnRequestArgs = ethers.utils.defaultAbiCoder.decode(
			["bytes32", "address", "uint256", "address"],
			metaRouteBurnRequest[0].data
		);
		let burnTxID = metaRouteBurnRequestArgs[0];

		let swapCalldata = swapInterface.encodeFunctionData("swap", [
			1,
			0,
			0,
			0,
			ethers.constants.MaxUint256,
		]);

		let swapRouterCalldata = stableSwapInterface.encodeFunctionData(
			"multicall",
			[
				0,
				[swapCalldata],
				[stableDex.address],
				[sweth.address, sTestTokenAddr],
				[100],
				metaRouter.address,
			]
		);

		let revertSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
				[secondToken.address, thirdToken.address],
				sender.address,
				ethers.constants.MaxUint256,
			]
		);

		let burnCalldata = burnInterface.encodeFunctionData(
			"metaBurnSyntheticToken",
			[
				[
					stableBridgingFee,
					0,
					metaRouter.address,
					uniDex.address,
					sTestTokenAddr,
					revertSwapCalldata,
					36,
					sender.address,
					portal1.address,
					bridge1.address,
					sender.address,
					hardhatChainID,
					clientId,
				],
			]
		);

		let balanceBeforeRevert = await thirdToken.balanceOf(sender.address);

		let externalID = ethers.utils.solidityKeccak256(
			["bytes32", "address", "address", "uint256"],
			[burnTxID, portal2.address, recipient.address, hardhatChainID]
		);

		let revertMetaBurnCalldata = revertMetaBurnInterface.encodeFunctionData(
			"revertMetaBurn",
			[
				stableBridgingFee,
				externalID,
				stableRouter.address,
				swapRouterCalldata,
				synthesis.address,
				sTestTokenAddr,
				burnCalldata,
			]
		);

		let revertBurnReceiveSide = synthesis.address;

		let tx3 = await bridge2.receiveRequestV2(
			revertMetaBurnCalldata,
			revertBurnReceiveSide
		);

		let receiptRevertBurn = await tx3.wait();
		let revertBurnOracleRequestArgs2 = await library.catchOracleRequest(
			receiptRevertBurn
		);
		let callData3 = revertBurnOracleRequestArgs2[1];
		let receiveSide3 = revertBurnOracleRequestArgs2[2];

		expect(receiveSide3).to.eq(portal1.address);

		await bridge1.receiveRequestV2(callData3, receiveSide3);

		expect(
			(await thirdToken.balanceOf(sender.address)) - balanceBeforeRevert
		).to.eq(4662);
	});

	it("Should check metaRoute synth V2 (swapExactTokensForTokens)", async () => {
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
					metaRouter.address,
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

		let expectedBalance = 2360;

		console.log(
			"Final balance:",
			(await firstToken.balanceOf(recipient.address)).toString()
		);

		expect(await firstToken.balanceOf(recipient.address)).to.eq(
			expectedBalance
		);
	});

	it("Should check metaRoute synth V2 (swapExactTokensForTokensSupportingFeeOnTransferTokens)", async () => {
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

		let expectedBalance = 2360;

		console.log(
			"Final balance:",
			(await firstToken.balanceOf(recipient.address)).toString()
		);

		expect(await firstToken.balanceOf(recipient.address)).to.eq(
			expectedBalance
		);
	});

	it("Should check revert metaRoute V2 after fail on manager chain", async () => {
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
			5000,
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

		let synthesizeRequestTopic = ethers.utils.id(
			"SynthesizeRequest(bytes32,address,uint256,address,address,uint256,address)"
		);
		let metaRouteSynthesizeRequest = receiptMetaRoute.events.filter((x) => {
			return x.topics[0] == synthesizeRequestTopic;
		});

		let metaRouteSynthesizeRequestArgs =
			ethers.utils.defaultAbiCoder.decode(
				["bytes32", "address", "uint256", "address"],
				metaRouteSynthesizeRequest[0].data
			);
		let syntTxID = metaRouteSynthesizeRequestArgs[0];

		let callData = metaRouteOracleRequestArgs[1];
		let receiveSide = metaRouteOracleRequestArgs[2];

		expect(receiveSide).to.eq(synthesis.address);

		await expect(
			bridge2.receiveRequestV2(callData, receiveSide)
		).to.be.revertedWith("Swap didn't result in min tokens");

		let txRevertSynthesizeRequest = await portal1
			.connect(recipient)
			.metaRevertRequest({
				stableBridgingFee: stableBridgingFee,
				internalID: syntTxID,
				receiveSide: portal1.address,
				managerChainBridge: bridge2.address,
				sourceChainBridge: bridge1.address,
				managerChainId: hardhatChainID,
				sourceChainId: hardhatChainID,
				router: ethers.constants.AddressZero,
				swapCalldata: ethers.utils.hexConcat([]),
				sourceChainSynthesis: synthesis.address,
				burnToken: ethers.constants.AddressZero,
				burnCalldata: ethers.utils.hexConcat([]),
				clientID: clientId,
			});

		let revertSynthesizeReceipt = await txRevertSynthesizeRequest.wait();
		let revertSynthesizeOracleRequestArgs =
			await library.catchOracleRequest(revertSynthesizeReceipt);

		let bytesRevertSynthesizeSelector =
			revertSynthesizeOracleRequestArgs[1];
		let revertSynthesizeReceiveSide = revertSynthesizeOracleRequestArgs[2];
		expect(revertSynthesizeReceiveSide).to.eq(synthesis.address);
		let tx2 = await bridge2.receiveRequestV2(
			bytesRevertSynthesizeSelector,
			revertSynthesizeReceiveSide
		);
		let receiptMetaRoute2 = await tx2.wait();
		let metaRouteOracleRequestArgs2 = await library.catchOracleRequest(
			receiptMetaRoute2
		);

		let callData2 = metaRouteOracleRequestArgs2[1];
		let receiveSide2 = metaRouteOracleRequestArgs2[2];

		expect(receiveSide2).to.eq(portal1.address);

		await bridge1.receiveRequestV2(callData2, receiveSide2);

		expect(await secondToken.balanceOf(sender.address)).to.eq(3226);
	});

	it("Should check final slippage triggering", async () => {
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

		let finalSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokensSupportingFeeOnTransferTokens",
			[
				0,
				5000,
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

		await expect(
			bridge3.receiveRequestV2(callData2, receiveSide2)
		).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");
	});

	it("Should check revert between source and manager chain after revert from dest chain", async () => {
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
					metaRouter.address,
					symbDex.address,
					sweth.address,
					finalSwapCalldata,
					36,
					metaRouter.address,
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

		let burnRequestTopic = ethers.utils.id(
			"BurnRequest(bytes32,address,uint256,address,address,uint256,address)"
		);

		let callData2 = metaRouteOracleRequestArgs2[1];
		let receiveSide2 = metaRouteOracleRequestArgs2[2];

		expect(receiveSide2).to.eq(portal2.address);

		await expect(
			bridge3.receiveRequestV2(callData2, receiveSide2)
		).to.be.revertedWith("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT");

		let metaRouteBurnRequest = receiptMetaRoute2.events.filter((x) => {
			return x.topics[0] == burnRequestTopic;
		});
		let metaRouteBurnRequestArgs = ethers.utils.defaultAbiCoder.decode(
			["bytes32", "address", "uint256", "address"],
			metaRouteBurnRequest[0].data
		);
		let burnTxID = metaRouteBurnRequestArgs[0];

		let swapCalldata = swapInterface.encodeFunctionData("swap", [
			1,
			0,
			0,
			0,
			ethers.constants.MaxUint256,
		]);

		let swapRouterCalldata = stableSwapInterface.encodeFunctionData(
			"multicall",
			[
				0,
				[swapCalldata],
				[stableDex.address],
				[sweth.address, sTestTokenAddr],
				[100],
				metaRouter.address,
			]
		);

		let revertSwapCalldata = swapInterface.encodeFunctionData(
			"swapExactTokensForTokens",
			[
				amountIn,
				0,
				[secondToken.address, thirdToken.address],
				sender.address,
				ethers.constants.MaxUint256,
			]
		);

		let burnCalldata = burnInterface.encodeFunctionData(
			"metaBurnSyntheticToken",
			[
				[
					stableBridgingFee,
					0,
					metaRouter.address,
					uniDex.address,
					sTestTokenAddr,
					revertSwapCalldata,
					36,
					sender.address,
					portal1.address,
					bridge1.address,
					recipient.address,
					hardhatChainID,
					clientId,
				],
			]
		);

		let balanceBeforeRevert = await secondToken.balanceOf(sender.address);

		let txRevertBurnRequest = await portal2
			.connect(recipient)
			.metaRevertRequest({
				stableBridgingFee: stableBridgingFee,
				internalID: burnTxID,
				receiveSide: synthesis.address,
				managerChainBridge: bridge2.address,
				sourceChainBridge: ethers.constants.AddressZero,
				managerChainId: hardhatChainID,
				sourceChainId: hardhatChainID,
				router: stableRouter.address,
				swapCalldata: swapRouterCalldata,
				sourceChainSynthesis: synthesis.address,
				burnToken: sTestTokenAddr,
				burnCalldata: burnCalldata,
				clientID: clientId,
			});

		let revertBurnReceipt = await txRevertBurnRequest.wait();
		let revertBurnOracleRequestArgs = await library.catchOracleRequest(
			revertBurnReceipt
		);

		let revertBurnSelector = revertBurnOracleRequestArgs[1];
		let revertBurnReceiveSide = revertBurnOracleRequestArgs[2];
		expect(revertBurnReceiveSide).to.eq(synthesis.address);
		let tx3 = await bridge2.receiveRequestV2(
			revertBurnSelector,
			revertBurnReceiveSide
		);

		let receiptRevertBurn = await tx3.wait();
		let revertBurnOracleRequestArgs2 = await library.catchOracleRequest(
			receiptRevertBurn
		);
		let callData3 = revertBurnOracleRequestArgs2[1];
		let receiveSide3 = revertBurnOracleRequestArgs2[2];

		expect(receiveSide3).to.eq(portal1.address);

		let burnRequest = receiptRevertBurn.events.filter((x) => {
			return x.topics[0] == burnRequestTopic;
		});

		let burnRequestArgs = ethers.utils.defaultAbiCoder.decode(
			["bytes32", "address", "uint256", "address"],
			burnRequest[0].data
		);
		let burnTxID2 = burnRequestArgs[0];

		let txRevertBurnRequest2 = await portal1
			.connect(recipient)
			.metaRevertRequest({
				stableBridgingFee: stableBridgingFee,
				internalID: burnTxID2,
				receiveSide: portal1.address,
				managerChainBridge: bridge2.address,
				sourceChainBridge: bridge1.address,
				managerChainId: hardhatChainID,
				sourceChainId: hardhatChainID,
				router: ethers.constants.AddressZero,
				swapCalldata: ethers.utils.hexConcat([]),
				sourceChainSynthesis: synthesis.address,
				burnToken: ethers.constants.AddressZero,
				burnCalldata: burnCalldata,
				clientID: clientId,
			});

		let revertReceipt = await txRevertBurnRequest2.wait();
		let revertOracleRequestArgs = await library.catchOracleRequest(
			revertReceipt
		);

		let revertSelector = revertOracleRequestArgs[1];
		let revertReceiveSide = revertOracleRequestArgs[2];
		expect(revertReceiveSide).to.eq(synthesis.address);

		let tx4 = await bridge2.receiveRequestV2(
			revertSelector,
			revertReceiveSide
		);
		let revertReceipt2 = await tx4.wait();
		let revertOracleRequestArgs2 = await library.catchOracleRequest(
			revertReceipt2
		);

		let revertSelector2 = revertOracleRequestArgs2[1];
		let revertReceiveSide2 = revertOracleRequestArgs2[2];
		expect(revertReceiveSide2).to.eq(portal1.address);

		await bridge1.receiveRequestV2(revertSelector2, revertReceiveSide2);

		expect(
			(await secondToken.balanceOf(sender.address)) - balanceBeforeRevert
		).to.eq(2919);
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
		expect(await firstToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await weth.balanceOf(metaRouter.address)).to.eq(0);
		expect(await sTestToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await secondToken.balanceOf(metaRouter.address)).to.eq(0);
		expect(await thirdToken.balanceOf(metaRouter.address)).to.eq(0);
	});
});
