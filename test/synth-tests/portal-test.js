const { expect } = require("chai");
const { constants, utils } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const trustedForwarder = "0x83A54884bE4657706785D7309cf46B58FE5f6e8a";
const stableBridgingFee = 100;

let testToken, portal, bridge, synthesis, sTestToken, owner, user;

describe("Upgradable", function () {
	const bridge = "0x543B7ED5b1eF111B45b23B39E369757587F33987"; // some address, doesn't matter for this test
	const metaRouter = "0x543B7ED5b1eF111B45b23B39E369757587F33987"; // some address, doesn't matter for this test

	it("Portal upgrade works", async () => {
		const wrapper = "0x543B7ED5b1eF111B45b23B39E369757587F33987";

		const PortalV1 = await ethers.getContractFactory("Portal");
		const portalV1 = await upgrades.deployProxy(PortalV1, [
			bridge,
			trustedForwarder,
			wrapper,
			"0x0000000000000000000000000000000000000000",
			metaRouter,
		]);

		const PortalV2 = await ethers.getContractFactory("Portal");
		const upgradedPortal = await upgrades.upgradeProxy(
			portalV1.address,
			PortalV2
		);

		expect(await upgradedPortal.bridge()).to.equal(bridge);
	});
});

describe("Should check snts", function () {
	let token;

	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		// get factories for contracts
		[, sTestToken, testToken, bridge, portal, synthesis] =
			await library.deployContracts();

		token = "0x543B7ED5b1eF111B45b23B39E369757587F33987"; // some address, doesn't matter for this test

		//mint tokens
		const mintableAmount = constants.WeiPerEther.mul(90000);
		await testToken.mint(owner.address, mintableAmount);

		//approve for portal
		await testToken.approve(portal.address, mintableAmount);

		//set minimal token price
		await portal.setTokenThreshold(testToken.address, 100);
	});

	context("Should check pause/unpause in portal", function () {
		it("Shouldn't pause by anyone in portal", async () => {
			await expect(portal.connect(user).pause()).to.be.revertedWith("");
		});

		it("Shouldn't unpause by anyone in portal", async () => {
			await portal.pause();
			expect(await portal.paused()).to.equal(true);

			await expect(portal.connect(user).unpause()).to.be.revertedWith("");
		});
		it("Should check pause/unpause in portal", async () => {
			await portal.pause();
			expect(await portal.paused()).to.equal(true);

			await portal.unpause();
			expect(await portal.paused()).to.equal(false);
		});
		it("Should check pause/unpause logging in portal", async () => {
			let tx = await portal.pause();
			let receipt = await tx.wait();
			let event = receipt.events.filter((x) => {
				return x.event == "Paused";
			});

			let pauseAddr = event[0].args[0];
			expect(pauseAddr).to.equal(owner.address)

			let tx1 = await portal.unpause();
			let receipt1 = await tx1.wait();
			let event1 = receipt1.events.filter((x) => {
				return x.event == "Unpaused";
			});

			let pauseAddr1 = event1[0].args[0];
			expect(pauseAddr1).to.equal(owner.address)
		});
	});

	context("setMetaRouter()", function () {
		beforeEach(async function () {
			expect(await portal.metaRouter()).to.equal(metaRouter.address);
			const MetaRouter = await ethers.getContractFactory("MetaRouter");
			metaRouter2 = await MetaRouter.deploy();
		});
		it("shouldn't allow to set by anyone", async () => {
			await expect(
				portal.connect(user).setMetaRouter(metaRouter2.address)
			).to.be.revertedWith("");
		});

		it("shouldn't allow to set zero address", async () => {
			await expect(
				portal.setMetaRouter(ethers.constants.AddressZero)
			).to.be.revertedWith("Symb: metaRouter cannot be zero address");
		});

		it("Should check metaRouter setting in portal", async () => {
			await portal.setMetaRouter(metaRouter2.address);
			expect(await portal.metaRouter()).to.equal(metaRouter2.address);
		});

		it("Should check metaRouter setting logging in portal", async () => {
			let tx = await portal.setMetaRouter(metaRouter2.address);
			let receipt = await tx.wait();
			let event = receipt.events.filter((x) => {
				return x.event == "SetMetaRouter";
			});

			let newMetaRouter = event[0].args[0];
			expect(newMetaRouter).to.equal(metaRouter2.address)
		});
	});

	context("setWhitelistToken()", function () {
		it("shouldn't allow to set by anyone", async () => {
			await expect(
				portal.connect(user).setWhitelistToken(token, true)
			).to.be.revertedWith("Ownable: caller is not the owner");
		});

		it("should set by owner", async () => {
			expect(await portal.tokenWhitelist(token)).to.equal(false);
			await portal.setWhitelistToken(token, true);
			expect(await portal.tokenWhitelist(token)).to.equal(true);
		});

		it("should set by owner", async () => {
			await portal.setWhitelistToken(token, true);
			await portal.setWhitelistToken(token, false);
			expect(await portal.tokenWhitelist(token)).to.equal(false);
		});

		it("should check setWhitelistToken logging", async () => {
			expect(await portal.tokenWhitelist(token)).to.equal(false);
			let tx = await portal.setWhitelistToken(token, true);
			let receipt = await tx.wait();
			let event = receipt.events.filter((x) => {
				return x.event == "SetWhitelistToken";
			});

			let setToken = event[0].args[0];
			expect(setToken).to.equal(token);
			let activate = event[0].args[1];
			expect(activate).to.equal(true);
		});
	});

	context("setTokenThreshold()", function () {
		it("should check setTokenThreshold logging", async () => {
			let tx = await portal.setTokenThreshold(testToken.address, 1000);
			let receipt = await tx.wait();
			let event = receipt.events.filter((x) => {
				return x.event == "SetTokenThreshold";
			});

			let setToken = event[0].args[0];
			expect(setToken).to.equal(testToken.address);
			let threshold = event[0].args[1];
			expect(threshold).to.equal(1000);
		});
	});

	context("Should check syntezation", function () {
		it("Should check syntesize req", async () => {
			let oldBalance = await testToken.balanceOf(owner.address);
			const syntAmount = constants.WeiPerEther.mul(10);

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
			let oracleRequestArgs = await library.catchOracleRequest(
				receiptSynt
			);

			let syntBytesSelector = oracleRequestArgs[1];
			let receiveSideSynt = oracleRequestArgs[2];

			const abiCoder = ethers.utils.defaultAbiCoder;
			let synthesizeRequest = receiptSynt.events.filter((x) => {
				return x.topics.includes(library.synthesizeRequestTopic);
			});
			let synthesizeRequestArgs = abiCoder.decode(
				["bytes32", "address", "uint256", "address"],
				synthesizeRequest[0].data
			);
			const cross_chain_id_synthesize_request = synthesizeRequestArgs[0];

			const txMint = await bridge.receiveRequestV2(syntBytesSelector, receiveSideSynt);
			const txMintReceipt = await txMint.wait();

			let synthesizeCompleted = txMintReceipt.events.filter((x) => {
				return x.topics.includes(cross_chain_id_synthesize_request);
			});
			expect(synthesizeCompleted).not.to.be.empty;

			expect(oldBalance.sub(syntAmount)).to.equal(
				await testToken.balanceOf(owner.address)
			);
			expect(syntAmount.sub(stableBridgingFee)).to.equal(
				await sTestToken.balanceOf(user.address)
			);
		});

		it("Should fail on syntesize when paused", async () => {
			const syntAmount = constants.WeiPerEther.mul(10);
			await portal.setWhitelistToken(testToken.address, true);
			await portal.pause();

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesize(
					stableBridgingFee,
					testToken.address,
					syntAmount,
					user.address,
					synthesis.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId
				)
			).to.be.revertedWith("");
		});

		it("Should fail on amount under threshold", async () => {
			const syntAmount = constants.WeiPerEther.mul(10);

			await portal.setTokenThreshold(
				testToken.address,
				constants.MaxInt256
			);
			await portal.setWhitelistToken(testToken.address, true);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesize(
					stableBridgingFee,
					testToken.address,
					syntAmount,
					user.address,
					synthesis.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId
				)
			).to.be.revertedWith("Symb: amount under threshold");
		});

		it("Should check fail on synthesizing token that is not in whitelist", async () => {
			const syntAmount = constants.WeiPerEther.mul(10);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesize(
					stableBridgingFee,
					token,
					syntAmount,
					user.address,
					synthesis.address,
					bridge.address,
					user.address,
					hardhatChainID,
					clientId
				)
			).to.be.revertedWith("Symb: unauthorized token");
		});

		it("Should fail on synthesation token that has no synt representation", async () => {
			const syntAmount = constants.WeiPerEther.mul(10);
			const TestToken = await ethers.getContractFactory("GenericERC20");
			let testToken2 = await TestToken.deploy("First Token", "FIRST");
			const mintableAmount = constants.WeiPerEther.mul(20);

			await testToken2.mint(owner.address, mintableAmount);
			await testToken2.approve(portal.address, mintableAmount);

			await portal.setWhitelistToken(testToken2.address, true);

			let clientId = ethers.utils.formatBytes32String("some client id");

			let txSynt = await portal.synthesize(
				stableBridgingFee,
				testToken2.address,
				syntAmount,
				user.address,
				synthesis.address,
				bridge.address,
				user.address,
				hardhatChainID,
				clientId
			);
			let receiptSynt = await txSynt.wait();
			let oracleRequestArgs = await library.catchOracleRequest(
				receiptSynt
			);

			let syntBytesSelector = oracleRequestArgs[1];
			let receiveSideSynt = oracleRequestArgs[2];

			await expect(
				bridge.receiveRequestV2(syntBytesSelector, receiveSideSynt)
			).to.be.revertedWith(
				"Symb: There is no synt representation for this token"
			);
		});
	});

	context("Should check unsynthesize", function () {
		it("Should fail on unsynthesize by anyone", async () => {
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 234234235");

			const syntAmount = constants.WeiPerEther.mul(10);
			await portal.setWhitelistToken(testToken.address, true);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await portal.synthesize(
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

			await expect(
				portal.unsynthesize(
					stableBridgingFee,
					bytes32Id,
					bytes32Id,
					testToken.address,
					syntAmount,
					user.address
				)
			).to.be.revertedWith("");
		});

		it("Should fail on unsynthesize when paused", async () => {
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 234234235");

			const syntAmount = constants.WeiPerEther.mul(10);
			await portal.setWhitelistToken(testToken.address, true);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await portal.synthesize(
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

			await portal.pause();

			let iface = new ethers.utils.Interface([
				"function unsynthesize(uint256,bytes32,bytes32,address,uint256,address)",
			]);
			let unsyntCallData = iface.encodeFunctionData("unsynthesize", [
				stableBridgingFee,
				bytes32Id,
				bytes32Id,
				testToken.address,
				syntAmount,
				user.address,
			]);

			await expect(
				bridge.receiveRequestV2(unsyntCallData, portal.address)
			).to.be.revertedWith("Symb: paused");
		});

		it("Should fail on double unsynthesize", async () => {
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 234234235");

			const syntAmount = constants.WeiPerEther.mul(10);
			await portal.setWhitelistToken(testToken.address, true);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await portal.synthesize(
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

			let iface = new ethers.utils.Interface([
				"function unsynthesize(uint256,bytes32,bytes32,address,uint256,address)",
			]);
			let unsyntCallData = iface.encodeFunctionData("unsynthesize", [
				stableBridgingFee,
				bytes32Id,
				bytes32Id,
				testToken.address,
				syntAmount,
				user.address,
			]);

			let unsyntCallData2 = iface.encodeFunctionData("unsynthesize", [
				stableBridgingFee,
				bytes32Id,
				bytes32Id,
				testToken.address,
				syntAmount,
				user.address,
			]);

			await bridge.receiveRequestV2(unsyntCallData, portal.address);

			await expect(
				bridge.receiveRequestV2(unsyntCallData2, portal.address)
			).to.be.revertedWith("Symb: synthetic tokens emergencyUnburn");
		});

		it("Should check hard unsynthesize", async () => {
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 234234235");

			const syntAmount = constants.WeiPerEther.mul(10);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await portal.synthesize(
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

			let tokenBalanceOld = await testToken.balanceOf(user.address);

			let iface = new ethers.utils.Interface([
				"function unsynthesize(uint256,bytes32,bytes32,address,uint256,address)",
			]);
			let unsyntCallData = iface.encodeFunctionData("unsynthesize", [
				stableBridgingFee,
				bytes32Id,
				bytes32Id,
				testToken.address,
				syntAmount,
				user.address,
			]);

			await bridge.receiveRequestV2(unsyntCallData, portal.address);

			let newBalance = await testToken.balanceOf(user.address);

			console.log(
				"Balance of addr1 before hard unsynt",
				utils.formatUnits(tokenBalanceOld, 18)
			);
			console.log(
				"Balance of addr1 after hard unsynt",
				utils.formatUnits(newBalance, 18)
			);

			expect(syntAmount.sub(stableBridgingFee)).to.equal(newBalance);
		});
	});

	it("Should check that portal returns correct version", async () => {
		expect("2.0.1").to.equal(await portal.versionRecipient());
	});
});
