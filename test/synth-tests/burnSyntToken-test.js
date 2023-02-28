const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const stableBridgingFee = 100;

let testToken, portal, bridge, synthesis, sTestToken, owner, user;

describe("Should check burnSyntToken", function () {
	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		// deploy
		[, sTestToken, testToken, bridge, portal, synthesis] =
			await library.deployContracts();

		//mint tokens
		const mintableAmount = constants.WeiPerEther.mul(90000); // 10%
		await testToken.mint(owner.address, mintableAmount);

		//approve for portal
		await testToken.approve(portal.address, mintableAmount);

		//set minimal token price
		await synthesis.setTokenThreshold(sTestToken.address, 100);
		await portal.setTokenThreshold(testToken.address, 100);

		const syntAmount = constants.WeiPerEther.mul(10);
		let clientId = ethers.utils.formatBytes32String("some client id");
		//synthesize
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

	it("Should fail on burnSyntheticToken when synthesis paused", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);

		await synthesis.pause();
		let clientId = ethers.utils.formatBytes32String("some client id");
		// burn
		await expect(
			synthesis
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
				)
		).to.be.revertedWith("");
	});

	it("Should fail on burnSyntheticToken with amount under threshold", async () => {
		const unsyntAmount = 99;
		let clientId = ethers.utils.formatBytes32String("some client id");
		// burn
		await expect(
			synthesis
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
				)
		).to.be.revertedWith("Symb: amount under threshold");
	});

	it("Should fail on burnSyntheticToken with incorrect synt", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);

		const ERC20Abi = require('../abi/ERC20Mock.json');
		const ERC20Mock = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);

		let fakeSynt = await ERC20Mock.deploy("Fake Synt", "Fake Synt", 18);
		await fakeSynt.mint(user.address, constants.WeiPerEther.mul(5));
		let clientId = ethers.utils.formatBytes32String("some client id");
		// burn
		await expect(
			synthesis
				.connect(user)
				.burnSyntheticToken(
					stableBridgingFee,
					fakeSynt.address,
					unsyntAmount,
					user.address,
					portal.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId
				)
		).to.be.revertedWith("Symb: incorrect synt");
	});

	it("Should check burnSyntheticToken", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);
		let clientId = ethers.utils.formatBytes32String("some client id");
		// burn
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
		let burnReceipt = await txUnsynt.wait();

		let oracleRequestUnsyntArgs = await library.catchOracleRequest(
			burnReceipt
		);

		let bytesSelectorUnsynt = oracleRequestUnsyntArgs[1];
		let receiveSideUnsynt = oracleRequestUnsyntArgs[2];

		await bridge.receiveRequestV2(bytesSelectorUnsynt, receiveSideUnsynt);

		expect(unsyntAmount.sub(stableBridgingFee)).to.equal(
			await testToken.balanceOf(user.address)
		);
	});
});
