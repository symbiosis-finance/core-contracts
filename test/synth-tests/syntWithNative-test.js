const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const stableBridgingFee = 100;

let portal,
	synthesis,
	bridge,
	syntFabric,
	wrapper,
	sTestToken,
	sTestTokenAddr,
	owner,
	user;

describe("Native token syntesation test", function () {
	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		[
			wrapper,
			sTestToken,
			testToken,
			bridge,
			portal,
			synthesis,
			syntFabric,
		] = await library.deployContracts();
		await portal.setWhitelistToken(wrapper.address, true);

		await syntFabric.createRepresentationByAdmin(
			wrapper.address,
			hardhatChainID,
			"sTT",
			"sTT",
			18
		);

		let syntKey = ethers.utils.solidityKeccak256(
			["address", "uint256"],
			[wrapper.address, hardhatChainID]
		);
		sTestTokenAddr = await syntFabric.getSyntRepresentationByKey(syntKey);
		const STestToken = await ethers.getContractFactory("SyntERC20");
		sTestToken = await STestToken.attach(sTestTokenAddr);
	});

	it("Should check syntesize req", async () => {
		const syntAmount = constants.WeiPerEther.mul(10);
		let clientId = ethers.utils.formatBytes32String("some client id");

		let txSynt = await portal.synthesizeNative(
			stableBridgingFee,
			user.address,
			synthesis.address,
			bridge.address,
			user.address,
			hardhatChainID,
			clientId,
			{ value: syntAmount }
		);
		let receiptSynt = await txSynt.wait();
		let oracleRequestArgs = await library.catchOracleRequest(receiptSynt);

		let syntBytesSelector = oracleRequestArgs[1];
		let receiveSideSynt = oracleRequestArgs[2];

		await bridge.receiveRequestV2(syntBytesSelector, receiveSideSynt);
		expect(syntAmount.sub(stableBridgingFee)).to.equal(
			await sTestToken.balanceOf(user.address)
		);
	});

	context("syntWithPermit() negative tests", function () {
		it("Should fail on amount under threshold during synthesizeWithPermit", async () => {
			await portal.setTokenThreshold(
				wrapper.address,
				constants.MaxInt256
			);
			const syntAmount = constants.WeiPerEther.mul(10);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesizeNative(
					stableBridgingFee,
					user.address,
					synthesis.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId,
					{ value: syntAmount }
				)
			).to.be.revertedWith("Symb: amount under threshold");
		});

		it("Should fail on synthesizeWithPermit when portal paused", async () => {
			await portal.pause();
			const syntAmount = constants.WeiPerEther.mul(10);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesizeNative(
					stableBridgingFee,
					user.address,
					synthesis.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId,
					{ value: syntAmount }
				)
			).to.be.revertedWith("");
		});

		it("Should fail on synthesizeWithPermit with wrapper not in whitelist", async () => {
			await portal.setWhitelistToken(wrapper.address, false);
			const syntAmount = constants.WeiPerEther.mul(10);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesizeNative(
					stableBridgingFee,
					user.address,
					synthesis.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId,
					{ value: syntAmount }
				)
			).to.be.revertedWith("Symb: unauthorized token");
		});
	});
});
