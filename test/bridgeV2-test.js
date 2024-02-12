const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./synth-tests/library");

const hardhatChainID = 31337;
const stableBridgingFee = 100;
const trustedForwarder = "0x83A54884bE4657706785D7309cf46B58FE5f6e8a";

async function getContractFactory(name) {
	return await ethers.getContractFactory(name);
}

let testToken, portal, bridge, synthesis, sTestToken, owner, user, admin, mpc;

describe("Should check bridgeV2 functions", function () {
	beforeEach(async () => {
		[owner, user, mpc, admin] = await ethers.getSigners();

		// get factories for contracts
		const Wrapper = await getContractFactory("WETH9");
		const Portal = await getContractFactory("Portal");
		const Synthesis = await getContractFactory("Synthesis");
		const TestToken = await getContractFactory("GenericERC20");
		const Fabric = await getContractFactory("SyntFabric");
		const STestToken = await getContractFactory("SyntERC20");
		const Bridge = await getContractFactory("BridgeV2");
		const MetaRouter = await getContractFactory("MetaRouter");

		//deploy tokens
		testToken = await TestToken.deploy("First Token", "FIRST");

		let wrapper = await Wrapper.deploy();

		metaRouter = await MetaRouter.deploy();

		//deploy portal, synthesis, syntFabric, bridge
		bridge = await upgrades.deployProxy(Bridge, [mpc.address]);

		portal = await upgrades.deployProxy(Portal, [
			bridge.address,
			trustedForwarder,
			wrapper.address,
			testToken.address,
			metaRouter.address,
		]);

		synthesis = await upgrades.deployProxy(Synthesis, [
			bridge.address,
			trustedForwarder,
			metaRouter.address,
		]);

		syntFabric = await upgrades.deployProxy(Fabric, [synthesis.address]);

		await synthesis.setFabric(syntFabric.address);

		await bridge.setTransmitterStatus(portal.address, true);
		await bridge.setTransmitterStatus(synthesis.address, true);

		// create synt representation of test token
		await syntFabric.createRepresentationByAdmin(
			testToken.address,
			hardhatChainID,
			"sTT",
			"sTT",
			18
		);

		// add test token to Portal whitelist
		await portal.setWhitelistToken(testToken.address, true);

		let syntKey2 = ethers.utils.solidityKeccak256(
			["address", "uint256"],
			[testToken.address, hardhatChainID]
		);
		sTestTokenAddr = await syntFabric.getSyntRepresentationByKey(syntKey2);
		sTestToken = await STestToken.attach(sTestTokenAddr);
		console.log("sTestTokenBridging attached to ", sTestToken.address);

		//mint tokens
		const mintableAmount = constants.WeiPerEther.mul(90000); // 10%
		await testToken.mint(owner.address, mintableAmount);

		//approve for portal
		await testToken.approve(portal.address, mintableAmount);

		//set minimal token price
		await synthesis.setTokenThreshold(sTestToken.address, 100);
		await portal.setTokenThreshold(testToken.address, 100);
	});

	it("Should check withdraw fee", async () => {
		const syntAmount = constants.WeiPerEther.mul(10);
		await bridge.connect(owner).setAdminPermission(admin.address, true);

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

		let oracleRequestArgs = await library.catchOracleRequest(receiptSynt);

		let syntBytesSelector = oracleRequestArgs[1];
		let receiveSideSynt = oracleRequestArgs[2];

		await bridge
			.connect(mpc)
			.receiveRequestV2(syntBytesSelector, receiveSideSynt);
		console.log("here");

		const unsyntAmount = constants.WeiPerEther.mul(5);

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

		await bridge
			.connect(mpc)
			.receiveRequestV2(bytesSelectorUnsynt, receiveSideUnsynt);

		expect(await testToken.balanceOf(bridge.address)).to.equal(100);
		await bridge
			.connect(admin)
			.withdrawFee(testToken.address, mpc.address, 50);
		expect(await testToken.balanceOf(mpc.address)).to.equal(50);

		expect(await testToken.balanceOf(bridge.address)).to.equal(50);
		await bridge
			.connect(admin)
			.withdrawFee(testToken.address, mpc.address, 50);
		expect(await testToken.balanceOf(mpc.address)).to.equal(100);
	});

	it("Should change mpc", async () => {
		await bridge.changeMPC(user.address);
		expect(await bridge.mpc()).to.equal(user.address);
		await bridge.changeMPC(mpc.address);
	});

	context("BridgeV2 negative tests", function () {
		it("Should not allow set transmitter by anyone", async () => {
			await expect(
				bridge.connect(user).setTransmitterStatus(portal.address, true)
			).to.be.revertedWith("Ownable: caller is not the owner");
		});

		it("Should fail on change mpc with zero address", async () => {
			await expect(
				bridge.changeMPC(ethers.constants.AddressZero)
			).to.be.revertedWith("BridgeV2: address(0x0)");
		});

		it("Should fail on receive request with untrusted transmitter", async () => {
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

			await bridge.setTransmitterStatus(synthesis.address, false);

			let receiptSynt = await txSynt.wait();

			let oracleRequestArgs = await library.catchOracleRequest(
				receiptSynt
			);

			let syntBytesSelector = oracleRequestArgs[1];
			let receiveSideSynt = oracleRequestArgs[2];

			await expect(
				bridge
					.connect(mpc)
					.receiveRequestV2(syntBytesSelector, receiveSideSynt)
			).to.be.revertedWith("BridgeV2: untrusted transmitter");
		});
	});
});
