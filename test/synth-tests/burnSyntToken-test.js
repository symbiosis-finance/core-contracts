const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const otherChainID = 204;
const stableBridgingFee = 100;

let testToken, portal, bridge, synthesis, syntFabric, sTestToken, owner, user;

describe("Should check burnSyntToken", function () {
	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		// deploy
		[, sTestToken, testToken, bridge, portal, synthesis, syntFabric] =
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
		const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
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

	it("Should reject a synthetic token registered for another destination chain", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);
		const balanceBefore = await sTestToken.balanceOf(user.address);
		const requestCountBefore = await synthesis.requestCount();
		const clientId = ethers.utils.formatBytes32String("some client id");

		await syntFabric.createRepresentationByAdmin(
			testToken.address,
			otherChainID,
			"sOther",
			"sOther",
			18
		);

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
					otherChainID,
					clientId
				)
		).to.be.revertedWith("Symb: incorrect synt");

		expect(await sTestToken.balanceOf(user.address)).to.equal(balanceBefore);
		expect(await synthesis.requestCount()).to.equal(requestCountBefore);
	});

	it("Should reject a meta burn registered for another destination chain", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);
		const balanceBefore = await sTestToken.balanceOf(user.address);
		const requestCountBefore = await synthesis.requestCount();
		const clientId = ethers.utils.formatBytes32String("some client id");

		await syntFabric.createRepresentationByAdmin(
			testToken.address,
			otherChainID,
			"sOther",
			"sOther",
			18
		);

		await expect(
			synthesis.connect(user).metaBurnSyntheticToken({
				stableBridgingFee,
				amount: unsyntAmount,
				crossChainID: ethers.constants.HashZero,
				syntCaller: user.address,
				finalReceiveSide: ethers.constants.AddressZero,
				sToken: sTestToken.address,
				finalCallData: "0x",
				finalOffset: 0,
				chain2address: user.address,
				receiveSide: portal.address,
				oppositeBridge: bridge.address,
				revertableAddress: user.address,
				chainID: otherChainID,
				clientID: clientId,
			})
		).to.be.revertedWith("Symb: incorrect synt");

		expect(await sTestToken.balanceOf(user.address)).to.equal(balanceBefore);
		expect(await synthesis.requestCount()).to.equal(requestCountBefore);
	});

	it("Should keep meta burns working for the matching destination chain", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);
		const balanceBefore = await sTestToken.balanceOf(user.address);
		const requestCountBefore = await synthesis.requestCount();
		const clientId = ethers.utils.formatBytes32String("some client id");

		await synthesis.connect(user).metaBurnSyntheticToken({
			stableBridgingFee,
			amount: unsyntAmount,
			crossChainID: ethers.constants.HashZero,
			syntCaller: user.address,
			finalReceiveSide: ethers.constants.AddressZero,
			sToken: sTestToken.address,
			finalCallData: "0x",
			finalOffset: 0,
			chain2address: user.address,
			receiveSide: portal.address,
			oppositeBridge: bridge.address,
			revertableAddress: user.address,
			chainID: hardhatChainID,
			clientID: clientId,
		});

		expect(await sTestToken.balanceOf(user.address)).to.equal(
			balanceBefore.sub(unsyntAmount)
		);
		expect(await synthesis.requestCount()).to.equal(
			requestCountBefore.add(1)
		);
	});

	it("Should reject a TON burn registered for another destination chain", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);
		const balanceBefore = await sTestToken.balanceOf(user.address);
		const requestCountBefore = await synthesis.requestCount();
		const clientId = ethers.utils.formatBytes32String("some client id");

		await syntFabric.createRepresentationByAdmin(
			testToken.address,
			otherChainID,
			"sOther",
			"sOther",
			18
		);

		await expect(
			synthesis.connect(user).burnSyntheticTokenTON(
				stableBridgingFee,
				sTestToken.address,
				unsyntAmount,
				ethers.constants.HashZero,
				{
					workchain: 0,
					address_hash: ethers.constants.HashZero,
				},
				portal.address,
				bridge.address,
				user.address,
				otherChainID,
				clientId
			)
		).to.be.revertedWith("Symb: incorrect synt");

		expect(await sTestToken.balanceOf(user.address)).to.equal(balanceBefore);
		expect(await synthesis.requestCount()).to.equal(requestCountBefore);
	});

	it("Should keep TON burns working for the matching destination chain", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);
		const balanceBefore = await sTestToken.balanceOf(user.address);
		const requestCountBefore = await synthesis.requestCount();
		const clientId = ethers.utils.formatBytes32String("some client id");

		const burnTx = await synthesis.connect(user).burnSyntheticTokenTON(
			stableBridgingFee,
			sTestToken.address,
			unsyntAmount,
			ethers.constants.HashZero,
			{
				workchain: 0,
				address_hash: ethers.constants.HashZero,
			},
			portal.address,
			bridge.address,
			user.address,
			hardhatChainID,
			clientId
		);
		const burnReceipt = await burnTx.wait();
		const oracleRequest = await library.catchOracleRequest(burnReceipt);
		const tonPortalInterface = new ethers.utils.Interface([
			"function unsynthesize(uint256,bytes32,bytes32,address,uint256,(int8,bytes32))",
		]);
		const decodedRequest = tonPortalInterface.decodeFunctionData(
			"unsynthesize",
			oracleRequest[1]
		);

		expect(await sTestToken.balanceOf(user.address)).to.equal(
			balanceBefore.sub(unsyntAmount)
		);
		expect(await synthesis.requestCount()).to.equal(
			requestCountBefore.add(1)
		);
		expect(decodedRequest[0]).to.equal(stableBridgingFee);
		expect(decodedRequest[2]).to.equal(ethers.constants.HashZero);
		expect(decodedRequest[3]).to.equal(testToken.address);
		expect(decodedRequest[4]).to.equal(unsyntAmount);
		expect(decodedRequest[5][0]).to.equal(0);
		expect(decodedRequest[5][1]).to.equal(ethers.constants.HashZero);
	});

	it("Should reject rerouting a burn through another asset representation", async () => {
		const unsyntAmount = constants.WeiPerEther.mul(5);
		const clientId = ethers.utils.formatBytes32String("some client id");

		await syntFabric.createRepresentationByAdmin(
			testToken.address,
			otherChainID,
			"sOther",
			"sOther",
			18
		);

		const burnTx = await synthesis
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
		const burnReceipt = await burnTx.wait();
		const oracleRequest = await library.catchOracleRequest(burnReceipt);
		const portalInterface = new ethers.utils.Interface([
			"function unsynthesize(uint256,bytes32,bytes32,address,uint256,address)",
		]);
		const decodedRequest = portalInterface.decodeFunctionData(
			"unsynthesize",
			oracleRequest[1]
		);
		const externalID = decodedRequest[1];
		const requestCountBefore = await synthesis.requestCount();

		const rerouteCallData = synthesis.interface.encodeFunctionData(
			"revertBurnAndBurn",
			[
				stableBridgingFee,
				externalID,
				portal.address,
				bridge.address,
				otherChainID,
				user.address,
			]
		);

		await expect(
			bridge.receiveRequestV2(rerouteCallData, synthesis.address)
		).to.be.revertedWith("Symb: incorrect synt");

		const sourceRequest = await synthesis.requests(externalID);
		expect(sourceRequest.state).to.equal(1);
		expect(await synthesis.requestCount()).to.equal(requestCountBefore);

		const validRerouteCallData = synthesis.interface.encodeFunctionData(
			"revertBurnAndBurn",
			[
				stableBridgingFee,
				externalID,
				portal.address,
				bridge.address,
				hardhatChainID,
				user.address,
			]
		);

		await bridge.receiveRequestV2(validRerouteCallData, synthesis.address);

		const reroutedSourceRequest = await synthesis.requests(externalID);
		expect(reroutedSourceRequest.state).to.equal(2);
		expect(await synthesis.requestCount()).to.equal(
			requestCountBefore.add(1)
		);
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

		const abiCoder = ethers.utils.defaultAbiCoder;
		let burnRequest = burnReceipt.events.filter((x) => {
			return x.topics.includes(library.burnRequestTopic);
		});
		let burnRequestArgs = abiCoder.decode(
			["bytes32", "address", "uint256", "address"],
			burnRequest[0].data
		);
		const cross_chain_id_burn_request = burnRequestArgs[0];

		let bytesSelectorUnsynt = oracleRequestUnsyntArgs[1];
		let receiveSideUnsynt = oracleRequestUnsyntArgs[2];

		const unsyntTx = await bridge.receiveRequestV2(bytesSelectorUnsynt, receiveSideUnsynt);
		const unsyntTxReceipt = await unsyntTx.wait();

		let burnCompleted = unsyntTxReceipt.events.filter((x) => {
			return x.topics.includes(cross_chain_id_burn_request);
		});

		expect(burnCompleted).not.to.be.empty;

		expect(unsyntAmount.sub(stableBridgingFee)).to.equal(
			await testToken.balanceOf(user.address)
		);
	});
});
