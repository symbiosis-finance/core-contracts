const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const stableBridgingFee = 100;

let owner, user, portal, synthesis, testToken, bridge, sTestToken;

describe("Revert burn request", function () {
	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		[wrapper, sTestToken, testToken, bridge, portal, synthesis] =
			await library.deployContracts();

		//mint tokens
		const mintableAmount = constants.WeiPerEther.mul(90000);
		await testToken.mint(owner.address, mintableAmount);

		//approve for portal
		await testToken.approve(portal.address, mintableAmount);

		//set minimal token price
		await portal.setTokenThreshold(testToken.address, 100);
		await synthesis.setTokenThreshold(sTestToken.address, 100);

		const syntAmount = constants.WeiPerEther.mul(10);

		let clientId = ethers.utils.formatBytes32String("some client id");
		// synthesize assets
		let txSynt = await portal.synthesize(
			stableBridgingFee,
			testToken.address,
			syntAmount,
			user.address,
			synthesis.address,
			bridge.address,
			user.address,
			hardhatChainID,
			clientId
		);

		let receiptSynt = await txSynt.wait();
		let oracleRequestArgs = await library.catchOracleRequest(receiptSynt);

		let syntBytesSelector = oracleRequestArgs[1];
		let receiveSideSynt = oracleRequestArgs[2];

		await bridge.receiveRequestV2(syntBytesSelector, receiveSideSynt);
	});

	context("revertBurn() negative tests", function () {
		beforeEach(async function () {
			// burn synthetic assets
			balanceBeforeBurn = await sTestToken.balanceOf(user.address);
			unsyntAmount = constants.WeiPerEther.mul(10).sub(stableBridgingFee);
			let clientId = ethers.utils.formatBytes32String("some client id");
			let txUnsynt = await synthesis
				.connect(user)
				.burnSyntheticToken(
					stableBridgingFee,
					sTestToken.address,
					unsyntAmount,
					user.address,
					portal.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId
				);
			receiptUnsynt = await txUnsynt.wait();

			burnRequestUnsynt = receiptUnsynt.events.filter((x) => {
				return x.event === "BurnRequest";
			});

			burnTxId = burnRequestUnsynt[0].args[0];
		});
		it("should fail on revert burn when portal paused", async () => {
			await portal.pause();
			let clientId = ethers.utils.formatBytes32String("some client id");
			// revert burning
			await expect(
				portal
					.connect(user)
					.revertBurnRequest(
						stableBridgingFee,
						burnTxId,
						synthesis.address,
						bridge.address,
						hardhatChainID,
						clientId
					)
			).to.be.revertedWith("");
		});

		it("Should fail on revert burn when tokens are already transfered", async () => {
			let oracleRequestUnsyntArgs = await library.catchOracleRequest(
				receiptUnsynt
			);

			let bytesSelectorUnsynt = oracleRequestUnsyntArgs[1];
			let receiveSideUnsynt = oracleRequestUnsyntArgs[2];

			await bridge.receiveRequestV2(
				bytesSelectorUnsynt,
				receiveSideUnsynt
			);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal
					.connect(user)
					.revertBurnRequest(
						stableBridgingFee,
						burnTxId,
						synthesis.address,
						bridge.address,
						hardhatChainID,
						clientId
					)
			).to.be.revertedWith("Symb: Real tokens already transfered");
		});

		it("Should fail on revert burn when tx does not exist", async () => {
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 1234345235");
			let iface = new ethers.utils.Interface([
				"function revertBurn(uint256,bytes32)",
			]);

			let revertBurnCallData = iface.encodeFunctionData("revertBurn", [
				stableBridgingFee,
				bytes32Id,
			]);

			await expect(
				bridge.receiveRequestV2(revertBurnCallData, synthesis.address)
			).to.be.revertedWith("Symb: state not open or tx does not exist");
		});

		it("Should fail on revert burn when state does not open", async () => {
			let clientId = ethers.utils.formatBytes32String("some client id");
			let txRevertBurn = await portal
				.connect(user)
				.revertBurnRequest(
					stableBridgingFee,
					burnTxId,
					synthesis.address,
					bridge.address,
					hardhatChainID,
					clientId
				);

			let revertBurnReceipt = await txRevertBurn.wait();
			let revertBurnOracleRequestArgs = await library.catchOracleRequest(
				revertBurnReceipt
			);

			let bytesRevertBurnSelector = revertBurnOracleRequestArgs[1];
			let receiveSideRevertBurn = revertBurnOracleRequestArgs[2];

			await bridge.receiveRequestV2(
				bytesRevertBurnSelector,
				receiveSideRevertBurn
			);

			expect(balanceBeforeBurn.sub(stableBridgingFee)).to.equal(
				await sTestToken.balanceOf(user.address)
			);

			let txRevertBurn2 = await portal.revertBurnRequest(
				stableBridgingFee,
				burnTxId,
				synthesis.address,
				bridge.address,
				hardhatChainID,
				clientId
			);

			let revertBurnReceipt2 = await txRevertBurn2.wait();
			revertBurnOracleRequestArgs = await library.catchOracleRequest(
				revertBurnReceipt2
			);

			let bytesRevertBurnSelector2 = revertBurnOracleRequestArgs[1];
			let receiveSideRevertBurn2 = revertBurnOracleRequestArgs[2];

			await expect(
				bridge.receiveRequestV2(
					bytesRevertBurnSelector2,
					receiveSideRevertBurn2
				)
			).to.be.revertedWith("Symb: state not open or tx does not exist");
		});

		it("Should fail on revert burn with not revertable address", async () => {
			await portal.pause();
			let clientId = ethers.utils.formatBytes32String("some client id");
			// revert burning
			await expect(
				portal
					.connect(owner)
					.revertBurnRequest(
						stableBridgingFee,
						burnTxId,
						synthesis.address,
						bridge.address,
						hardhatChainID,
						clientId
					)
			).to.be.revertedWith("Symb: paused");
		});
	});

	it("Should check revertBurn", async () => {
		let balanceBeforeBurn = await sTestToken.balanceOf(user.address);

		// burn synthetic assets
		const unsyntAmount =
			constants.WeiPerEther.mul(10).sub(stableBridgingFee);
		let clientId = ethers.utils.formatBytes32String("some client id");
		let txUnsynt = await synthesis
			.connect(user)
			.burnSyntheticToken(
				stableBridgingFee,
				sTestToken.address,
				unsyntAmount,
				user.address,
				portal.address,
				bridge.address,
				user.address,
				hardhatChainID,
				clientId
			);
		let receiptUnsynt = await txUnsynt.wait();

		// check that assets were burned
		expect(0).to.equal(await sTestToken.balanceOf(user.address));

		let burnRequestUnsynt = receiptUnsynt.events.filter((x) => {
			return x.event == "BurnRequest";
		});

		let burnTxId = burnRequestUnsynt[0].args[0];

		// revert burning
		let txRevertBurn = await portal
			.connect(user)
			.revertBurnRequest(
				stableBridgingFee,
				burnTxId,
				synthesis.address,
				bridge.address,
				hardhatChainID,
				clientId
			);

		let revertBurnReceipt = await txRevertBurn.wait();
		let revertBurnOracleRequestArgs = await library.catchOracleRequest(
			revertBurnReceipt
		);

		let bytesRevertBurnSelector = revertBurnOracleRequestArgs[1];
		let receiveSideRevertBurn = revertBurnOracleRequestArgs[2];

		await bridge.receiveRequestV2(
			bytesRevertBurnSelector,
			receiveSideRevertBurn
		);

		// check that synthetic assets were returned
		expect(balanceBeforeBurn.sub(stableBridgingFee)).to.equal(
			await sTestToken.balanceOf(user.address)
		);
	});

	it("Should check revertBurn with zero revertable address", async () => {
		let balanceBeforeBurn = await sTestToken.balanceOf(user.address);

		// burn synthetic assets
		const unsyntAmount =
			constants.WeiPerEther.mul(10).sub(stableBridgingFee);

		let clientId = ethers.utils.formatBytes32String("some client id");
		let txUnsynt = await synthesis
			.connect(user)
			.burnSyntheticToken(
				stableBridgingFee,
				sTestToken.address,
				unsyntAmount,
				user.address,
				portal.address,
				bridge.address,
				ethers.constants.AddressZero,
				hardhatChainID,
				clientId
			);
		let receiptUnsynt = await txUnsynt.wait();

		// check that assets were burned
		expect(0).to.equal(await sTestToken.balanceOf(user.address));

		let burnRequestUnsynt = receiptUnsynt.events.filter((x) => {
			return x.event == "BurnRequest";
		});

		let burnTxId = burnRequestUnsynt[0].args[0];

		// revert burning
		let txRevertBurn = await portal
			.connect(user)
			.revertBurnRequest(
				stableBridgingFee,
				burnTxId,
				synthesis.address,
				bridge.address,
				hardhatChainID,
				clientId
			);

		let revertBurnReceipt = await txRevertBurn.wait();
		let revertBurnOracleRequestArgs = await library.catchOracleRequest(
			revertBurnReceipt
		);

		let bytesRevertBurnSelector = revertBurnOracleRequestArgs[1];
		let receiveSideRevertBurn = revertBurnOracleRequestArgs[2];

		await bridge.receiveRequestV2(
			bytesRevertBurnSelector,
			receiveSideRevertBurn
		);

		// check that synthetic assets were returned
		expect(balanceBeforeBurn.sub(stableBridgingFee)).to.equal(
			await sTestToken.balanceOf(user.address)
		);
	});
});
