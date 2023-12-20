const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers } = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;

let testToken, bridge, synthesis, sTestToken, owner, user;

describe("Test Upgradable", function () {
	const mpc = "0x543B7ED5b1eF111B45b23B39E369757587F33987"; // some address, doesn't matter for this test

	it("BridgeV2 upgrade works", async () => {
		const BridgeV2 = await ethers.getContractFactory("BridgeV2");
		const bridge = await upgrades.deployProxy(BridgeV2, [mpc]);

		const bridgeUpgrated = await upgrades.upgradeProxy(
			bridge.address,
			BridgeV2
		);

		expect(await bridgeUpgrated.mpc()).to.equal(mpc);
	});
});

describe("Test invoking BridgeV2 via signature", function () {
	const stableBridgingFee = 100;
	let privateKey =
		"0x0123456789012345678901234567890123456789012345678901234567890123";
	let wallet = new ethers.Wallet(privateKey);
	let signer = new ethers.utils.SigningKey(privateKey);

	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		// get factories for contracts
		[, sTestToken, testToken, bridge, _, synthesis] =
			await library.deployContracts();
	});

	context("Should check receiveRequestV2", function () {
		let mintableAmount = constants.WeiPerEther.mul(10);
		let bytes32Id = ethers.utils.formatBytes32String("some id 1234345235");
		let iface = new ethers.utils.Interface([
			"function mintSyntheticToken(uint256,bytes32,bytes32,address,uint256,uint256,address)",
		]);
		let methodPrefix =
			"0x" + Buffer.from("receiveRequestV2", "utf-8").toString("hex");

		it("receiveRequestV2 succeed with valid signature", async () => {
			// change mpc address for signing message using ethers.utils.SigningKey
			// to not add \x19Ethereum Signed Message:\n32 prefix
			await bridge.changeMPC(wallet.address);
			expect(await bridge.mpc()).to.equal(wallet.address);

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

			let message =
				methodPrefix +
				mintSyntheticTokenCallData.slice(2) +
				synthesis.address.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(hardhatChainID), 32).slice(2) +
				bridge.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await bridge.receiveRequestV2Signed(
				mintSyntheticTokenCallData,
				synthesis.address,
				signatureFlat
			);

			let sTokenBalance = await sTestToken.balanceOf(user.address);
			expect(sTokenBalance).to.equal(
				mintableAmount.sub(stableBridgingFee)
			);
		});

		it("receiveRequestV2 failed with invalid signature", async () => {
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

			let message =
				methodPrefix +
				mintSyntheticTokenCallData.slice(2) +
				synthesis.address.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(hardhatChainID), 32).slice(2) +
				bridge.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await expect(
				bridge.receiveRequestV2Signed(
					mintSyntheticTokenCallData,
					synthesis.address,
					signatureFlat
				)
			).to.be.revertedWith("BridgeV2: invalid signature");
		});

		it("receiveRequestV2 failed with invalid chainId", async () => {
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

			let message =
				methodPrefix +
				mintSyntheticTokenCallData.slice(2) +
				synthesis.address.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(1234), 32).slice(2) +
				bridge.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await expect(
				bridge.receiveRequestV2Signed(
					mintSyntheticTokenCallData,
					synthesis.address,
					signatureFlat
				)
			).to.be.revertedWith("BridgeV2: invalid signature");
		});

		it("receiveRequestV2 failed with invalid address", async () => {
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

			let message =
				methodPrefix +
				mintSyntheticTokenCallData.slice(2) +
				synthesis.address.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(hardhatChainID), 32).slice(2) +
				owner.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await expect(
				bridge.receiveRequestV2Signed(
					mintSyntheticTokenCallData,
					synthesis.address,
					signatureFlat
				)
			).to.be.revertedWith("BridgeV2: invalid signature");
		});

		it("receiveRequestV2 with signature should not allow double spend", async () => {
			// change mpc address for signing message using ethers.utils.SigningKey
			// to not add \x19Ethereum Signed Message:\n32 prefix
			await bridge.changeMPC(wallet.address);
			expect(await bridge.mpc()).to.equal(wallet.address);

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

			let message =
				methodPrefix +
				mintSyntheticTokenCallData.slice(2) +
				synthesis.address.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(hardhatChainID), 32).slice(2) +
				bridge.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await bridge.receiveRequestV2Signed(
				mintSyntheticTokenCallData,
				synthesis.address,
				signatureFlat
			);

			let sTokenBalance = await sTestToken.balanceOf(user.address);
			expect(sTokenBalance).to.equal(
				mintableAmount.sub(stableBridgingFee)
			);

			await expect(
				bridge.receiveRequestV2Signed(
					mintSyntheticTokenCallData,
					synthesis.address,
					signatureFlat
				)
			).to.be.revertedWith(
				"Symb: revertSynthesizedRequest called or tokens have been already synthesized"
			);
		});
	});

	context("Should check changeMPC", function () {
		let newMPC, methodPrefix;
		beforeEach(async () => {
			newMPC = owner.address;
			methodPrefix =
				"0x" + Buffer.from("changeMPC", "utf-8").toString("hex");
		});

		it("changeMPC succeed with valid signature", async () => {
			// change mpc address for signing message using ethers.utils.SigningKey
			// to not add \x19Ethereum Signed Message:\n32 prefix
			await bridge.changeMPC(wallet.address);
			expect(await bridge.mpc()).to.equal(wallet.address);

			let message = methodPrefix + newMPC.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(hardhatChainID), 32).slice(2) +
				bridge.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await bridge.changeMPCSigned(newMPC, signatureFlat);

			expect(await bridge.mpc()).to.equal(newMPC);
		});

		it("changeMPC failed with invalid signature", async () => {
			let message = methodPrefix + newMPC.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(hardhatChainID), 32).slice(2) +
				bridge.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await expect(
				bridge.changeMPCSigned(newMPC, signatureFlat)
			).to.be.revertedWith("BridgeV2: invalid signature");
		});

		it("changeMPC failed with invalid chainId", async () => {
			let message = methodPrefix + newMPC.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(1234), 32).slice(2) +
				bridge.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await expect(
				bridge.changeMPCSigned(newMPC, signatureFlat)
			).to.be.revertedWith("BridgeV2: invalid signature");
		});

		it("changeMPC failed with invalid address", async () => {
			let message = methodPrefix + newMPC.slice(2) +
				ethers.utils.hexZeroPad(ethers.utils.hexlify(hardhatChainID), 32).slice(2) +
				owner.address.slice(2);
			let messageHash = ethers.utils.keccak256(message);
			let signature = signer.signDigest(messageHash);
			let signatureFlat = ethers.utils.joinSignature(signature);

			await expect(
				bridge.changeMPCSigned(newMPC, signatureFlat)
			).to.be.revertedWith("BridgeV2: invalid signature");
		});
	});
});