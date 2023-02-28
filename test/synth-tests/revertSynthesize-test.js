const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const stableBridgingFee = 100;

let owner, user, portal, synthesis, testToken, bridge, sTestToken;

describe("Revert synthesize request", function () {
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
	});

	context("revertSynthesize() negative tests", function () {
		beforeEach(async function () {
			const syntAmount = constants.WeiPerEther.mul(10);
			await portal.setWhitelistToken(testToken.address, true);
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

			receiptSynt = await txSynt.wait();
			synthesizeRequest = receiptSynt.events.filter((x) => {
				return x.event == "SynthesizeRequest";
			});

			syntTxID = synthesizeRequest[0].args[0];
		});

		it("should fail on revert synthesize when synthesis paused", async () => {
			await synthesis.pause();
			let clientId = ethers.utils.formatBytes32String("some client id");
			await expect(
				synthesis
					.connect(user)
					.revertSynthesizeRequest(
						stableBridgingFee,
						syntTxID,
						portal.address,
						bridge.address,
						hardhatChainID,
						clientId
					)
			).to.be.revertedWith("");
		});

		it("Should fail on revert synthesize when tokens are already minted", async () => {
			let oracleRequestUnsyntArgs = await library.catchOracleRequest(
				receiptSynt
			);

			let bytesSelectorUnsynt = oracleRequestUnsyntArgs[1];
			let receiveSideUnsynt = oracleRequestUnsyntArgs[2];

			await bridge.receiveRequestV2(
				bytesSelectorUnsynt,
				receiveSideUnsynt
			);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				synthesis
					.connect(user)
					.revertSynthesizeRequest(
						stableBridgingFee,
						syntTxID,
						portal.address,
						bridge.address,
						hardhatChainID,
						clientId
					)
			).to.be.revertedWith("Symb: synthetic tokens already minted");
		});

		it("should fail on revert synthesize by not revertable address", async () => {
			await synthesis.pause();
			// revert burning
			let clientId = ethers.utils.formatBytes32String("some client id");
			await expect(
				synthesis
					.connect(owner)
					.revertSynthesizeRequest(
						stableBridgingFee,
						syntTxID,
						portal.address,
						bridge.address,
						hardhatChainID,
						clientId
					)
			).to.be.revertedWith("Symb: paused");
		});
	});

	it("Should check revert synthesize", async () => {
		const syntAmount = constants.WeiPerEther.mul(10);

		let initialBalance = await testToken.balanceOf(owner.address);

		// synthesize assets
		let clientId = ethers.utils.formatBytes32String("some client id");
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
		let synthesizeRequest = receiptSynt.events.filter((x) => {
			return x.event == "SynthesizeRequest";
		});

		let syntTxID = synthesizeRequest[0].args[0];

		// check that synthetis assets appear
		expect(syntAmount).to.equal(await testToken.balanceOf(portal.address));


		let txRevertSynthesizeRequest = await synthesis
			.connect(user)
			.revertSynthesizeRequest(
				stableBridgingFee,
				syntTxID,
				portal.address,
				bridge.address,
				hardhatChainID,
				clientId
			);

		let revertSynthesizeReceipt = await txRevertSynthesizeRequest.wait();
		let revertSynthesizeOracleRequestArgs =
			await library.catchOracleRequest(revertSynthesizeReceipt);

		let bytesRevertSynthesizeSelector =
			revertSynthesizeOracleRequestArgs[1];
		let receiveSideSynt = revertSynthesizeOracleRequestArgs[2];

		await bridge.receiveRequestV2(
			bytesRevertSynthesizeSelector,
			receiveSideSynt
		);

		// check that assets were returned to owner
		expect(initialBalance.sub(stableBridgingFee)).to.equal(
			await testToken.balanceOf(owner.address)
		);
	});

	it("Should check revert synthesize with zero address", async () => {
		const syntAmount = constants.WeiPerEther.mul(10);

		let initialBalance = await testToken.balanceOf(owner.address);

		let clientId = ethers.utils.formatBytes32String("some client id");

		// synthesize assets
		let txSynt = await portal.synthesize(
			stableBridgingFee,
			testToken.address,
			syntAmount,
			user.address,
			synthesis.address,
			bridge.address,
			ethers.constants.AddressZero,
			hardhatChainID,
			clientId
		);

		let receiptSynt = await txSynt.wait();
		let synthesizeRequest = receiptSynt.events.filter((x) => {
			return x.event == "SynthesizeRequest";
		});

		let syntTxID = synthesizeRequest[0].args[0];

		// check that synthetis assets appear
		expect(syntAmount).to.equal(await testToken.balanceOf(portal.address));

		let txRevertSynthesizeRequest = await synthesis
			.connect(user)
			.revertSynthesizeRequest(
				stableBridgingFee,
				syntTxID,
				portal.address,
				bridge.address,
				hardhatChainID,
				clientId
			);

		let revertSynthesizeReceipt = await txRevertSynthesizeRequest.wait();
		let revertSynthesizeOracleRequestArgs =
			await library.catchOracleRequest(revertSynthesizeReceipt);

		let bytesRevertSynthesizeSelector =
			revertSynthesizeOracleRequestArgs[1];
		let receiveSideSynt = revertSynthesizeOracleRequestArgs[2];

		await bridge.receiveRequestV2(
			bytesRevertSynthesizeSelector,
			receiveSideSynt
		);

		// check that assets were returned to owner
		expect(initialBalance.sub(stableBridgingFee)).to.equal(
			await testToken.balanceOf(owner.address)
		);
	});
});
