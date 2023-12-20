const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers, upgrades } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const stableBridgingFee = 100;
const trustedForwarder = "0x83A54884bE4657706785D7309cf46B58FE5f6e8a";

let testToken, portal, bridge, synthesis, sTestToken, owner, user;

describe("Upgradable", function () {
	const bridge = "0x543B7ED5b1eF111B45b23B39E369757587F33987"; // any address, doesn't matter for this test
	const metaRouter = "0x543B7ED5b1eF111B45b23B39E369757587F33987"; // any address, doesn't matter for this test

	it("Synthesis upgrade works", async () => {
		const SynthesisV1 = await ethers.getContractFactory("Synthesis");
		const synthesisV1 = await upgrades.deployProxy(SynthesisV1, [
			bridge,
			trustedForwarder,
			metaRouter,
		]);

		const SynthesisV2 = await ethers.getContractFactory("Synthesis");
		const upgradedPortal = await upgrades.upgradeProxy(
			synthesisV1.address,
			SynthesisV2
		);

		expect(await upgradedPortal.bridge()).to.equal(bridge);
	});
});

describe("Should check synthesis", function () {
	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		// get factories for contracts
		[, sTestToken, testToken, bridge, portal, synthesis] =
			await library.deployContracts();

		//mint tokens
		const mintableAmount = constants.WeiPerEther.mul(90000);
		await testToken.mint(owner.address, mintableAmount);

		//approve for portal
		await testToken.approve(portal.address, mintableAmount);

		//set minimal token price
		await portal.setTokenThreshold(testToken.address, 100);
	});
	context("Should check mintSyntheticToken", function () {
		it("Should fail on mint by anyone", async () => {
			const mintableAmount = constants.WeiPerEther.mul(10);
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 1234345235");

			await expect(
				synthesis.mintSyntheticToken(
					stableBridgingFee,
					bytes32Id,
					bytes32Id,
					testToken.address,
					hardhatChainID,
					mintableAmount,
					user.address
				)
			).to.be.revertedWith("");
		});

		it("Should fail on mint when paused", async () => {
			const mintableAmount = constants.WeiPerEther.mul(10);
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 1234345235");
			await synthesis.pause();

			let iface = new ethers.utils.Interface([
				"function mintSyntheticToken(uint256,bytes32,bytes32,address,uint256,uint256,address)",
			]);

			let mintSyntheticTokenCallData = iface.encodeFunctionData(
				"mintSyntheticToken",
				[
					stableBridgingFee,
					bytes32Id,
					bytes32Id,
					testToken.address,
					hardhatChainID,
					mintableAmount,
					user.address,
				]
			);

			await expect(
				bridge.receiveRequestV2(
					mintSyntheticTokenCallData,
					synthesis.address
				)
			).to.be.revertedWith("Symb: paused");
		});

		it("Should fail on double mint", async () => {
			const mintableAmount = constants.WeiPerEther.mul(10);
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 1234345235");

			let iface = new ethers.utils.Interface([
				"function mintSyntheticToken(uint256,bytes32,bytes32,address,uint256,uint256,address)",
			]);

			let mintSyntheticTokenCallData = iface.encodeFunctionData(
				"mintSyntheticToken",
				[
					stableBridgingFee,
					bytes32Id,
					bytes32Id,
					testToken.address,
					hardhatChainID,
					mintableAmount,
					user.address,
				]
			);

			let mintSyntheticTokenCallData2 = iface.encodeFunctionData(
				"mintSyntheticToken",
				[
					stableBridgingFee,
					bytes32Id,
					bytes32Id,
					testToken.address,
					hardhatChainID,
					mintableAmount,
					user.address,
				]
			);

			await bridge.receiveRequestV2(
				mintSyntheticTokenCallData,
				synthesis.address
			);

			await expect(
				bridge.receiveRequestV2(
					mintSyntheticTokenCallData2,
					synthesis.address
				)
			).to.be.revertedWith(
				"Symb: revertSynthesizedRequest called or tokens have been already synthesized"
			);
		});

		it("Should synt some sTT", async () => {
			const mintableAmount = constants.WeiPerEther.mul(10);
			let bytes32Id =
				ethers.utils.formatBytes32String("some id 1234345235");

			let iface = new ethers.utils.Interface([
				"function mintSyntheticToken(uint256,bytes32,bytes32,address,uint256,uint256,address)",
			]);

			let mintSyntheticTokenCallData = iface.encodeFunctionData(
				"mintSyntheticToken",
				[
					stableBridgingFee,
					bytes32Id,
					bytes32Id,
					testToken.address,
					hardhatChainID,
					mintableAmount,
					user.address,
				]
			);

			await bridge.receiveRequestV2(
				mintSyntheticTokenCallData,
				synthesis.address
			);

			let sTokenBalance = await sTestToken.balanceOf(user.address);
			console.log("supply of sTT for adr1 is %s", sTokenBalance);
			expect(sTokenBalance).to.equal(
				mintableAmount.sub(stableBridgingFee)
			);
		});
	});

	context("Should check pause/unpause in synthesis", function () {
		it("Shouldn't pause by anyone in synthesis", async () => {
			await expect(synthesis.connect(user).pause()).to.be.revertedWith(
				""
			);
		});

		it("Shouldn't unpause by anyone in synthesis", async () => {
			await synthesis.pause();
			expect(await synthesis.paused()).to.equal(true);

			await expect(synthesis.connect(user).unpause()).to.be.revertedWith(
				""
			);
		});
		it("Should check pause/unpause in synthesis", async () => {
			await synthesis.pause();
			expect(await synthesis.paused()).to.equal(true);

			await synthesis.unpause();
			expect(await synthesis.paused()).to.equal(false);
		});

		it("Should check pause/unpause logging in synthesis", async () => {
			let tx = await synthesis.pause();
			let receipt = await tx.wait();
			let event = receipt.events.filter((x) => {
				return x.event == "Paused";
			});

			let pauseAddr = event[0].args[0];
			expect(pauseAddr).to.equal(owner.address)

			let tx1 = await synthesis.unpause();
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
			expect(await synthesis.metaRouter()).to.equal(metaRouter.address);
			const MetaRouter = await ethers.getContractFactory("MetaRouter");
			metaRouter2 = await MetaRouter.deploy();
		});
		it("shouldn't allow to set by anyone", async () => {
			await expect(
				synthesis.connect(user).setMetaRouter(metaRouter2.address)
			).to.be.revertedWith("");
		});

		it("shouldn't allow to set zero address", async () => {
			await expect(
				synthesis.setMetaRouter(ethers.constants.AddressZero)
			).to.be.revertedWith("Symb: metaRouter cannot be zero address");
		});

		it("Should check metaRouter setting in synthesis", async () => {
			await synthesis.setMetaRouter(metaRouter2.address);
			expect(await synthesis.metaRouter()).to.equal(metaRouter2.address);
		});

		it("Should check metaRouter setting logging in synthesis", async () => {
			let tx = await synthesis.setMetaRouter(metaRouter2.address);
			let receipt = await tx.wait();
			let event = receipt.events.filter((x) => {
				return x.event == "SetMetaRouter";
			});

			let newMetaRouter = event[0].args[0];
			expect(newMetaRouter).to.equal(metaRouter2.address)
		});
	});

	context("setTokenThreshold()", function () {
		it("shouldn't allow to set by anyone", async () => {
			await expect(
				synthesis
					.connect(user)
					.setTokenThreshold(testToken.address, 100)
			).to.be.revertedWith("");
		});

		it("Should check token threshold setting in synthesis", async () => {
			await synthesis.setTokenThreshold(testToken.address, 100);
			expect(await synthesis.tokenThreshold(testToken.address)).to.equal(
				100
			);
		});

		it("should check setTokenThreshold logging", async () => {
			let tx = await synthesis.setTokenThreshold(testToken.address, 1000);
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

	context("setFabric() tests", function () {
		it("shouldn't allow to set by anyone", async () => {
			await expect(
				synthesis.connect(user).setFabric(owner.address)
			).to.be.revertedWith("");
		});

		it("Shouldn't allow to set fabric second time", async () => {
			await expect(synthesis.setFabric(owner.address)).to.be.revertedWith(
				"Symb: Fabric already set"
			);
		});

		it("Should check Fabric setting logging", async () => {
			const bridge = "0x543B7ED5b1eF111B45b23B39E369757587F33987";
			const metaRouter = "0x543B7ED5b1eF111B45b23B39E369757587F33987";
			const Synthesis = await ethers.getContractFactory("Synthesis");
			let synthesis2 = await upgrades.deployProxy(Synthesis, [
				bridge,
				trustedForwarder,
				metaRouter,
			]);
			let tx = await synthesis2.setFabric(owner.address);
			let receipt = await tx.wait();
			let event = receipt.events.filter((x) => {
				return x.event == "SetFabric";
			});

			let newFabric = event[0].args[0];
			expect(newFabric).to.equal(owner.address)
		});
	});

	it("Should check version in synthesis", async () => {
		expect(await synthesis.versionRecipient()).to.equal("2.0.1");
	});
});
