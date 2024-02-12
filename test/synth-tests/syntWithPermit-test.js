const { expect } = require("chai");
const { constants, utils } = require("ethers");
const { ethers } = require("hardhat");
const {
	keccak256,
	defaultAbiCoder,
	toUtf8Bytes,
	solidityPack,
} = require("ethers/lib/utils");
const { ecsign } = require("ethereumjs-util");
const library = require("./library");

const PERMIT_TYPEHASH = keccak256(
	toUtf8Bytes(
		"Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
	)
);

const hardhatChainID = 31337;
const stableBridgingFee = 100;

// owner private key in hardhat test env
const ownerPrivateKey = Buffer.from(
	"ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
	"hex"
);

function sign(digest, privateKey) {
	return ecsign(Buffer.from(digest.slice(2), "hex"), privateKey);
}

function getDomainSeparator(name, contractAddress, chainId) {
	return keccak256(
		defaultAbiCoder.encode(
			["bytes32", "bytes32", "bytes32", "uint256", "address"],
			[
				keccak256(
					toUtf8Bytes(
						"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
					)
				),
				keccak256(toUtf8Bytes(name)),
				keccak256(toUtf8Bytes("1")),
				chainId,
				contractAddress,
			]
		)
	);
}

function getPermitDigest(name, address, chainId, approve, nonce, deadline) {
	const DOMAIN_SEPARATOR = getDomainSeparator(name, address, chainId);

	return keccak256(
		solidityPack(
			["bytes1", "bytes1", "bytes32", "bytes32"],
			[
				"0x19",
				"0x01",
				DOMAIN_SEPARATOR,
				keccak256(
					defaultAbiCoder.encode(
						[
							"bytes32",
							"address",
							"address",
							"uint256",
							"uint256",
							"uint256",
						],
						[
							PERMIT_TYPEHASH,
							approve.owner,
							approve.spender,
							approve.value,
							nonce,
							deadline,
						]
					)
				),
			]
		)
	);
}

let testToken,
	sTestTokenAddr,
	portal,
	bridge,
	synthesis,
	mintableAmount,
	sTestToken,
	syntFabric,
	owner,
	user;

async function getContractFactory(name) {
	return await ethers.getContractFactory(name);
}

describe("Should check synthesation with permit", function () {
	beforeEach(async () => {
		[owner, user] = await ethers.getSigners();

		const TestToken = await getContractFactory("SyntERC20");
		const STestToken = await getContractFactory("SyntERC20");

		[
			wrapper,
			sTestToken,
			testToken,
			bridge,
			portal,
			synthesis,
			syntFabric,
		] = await library.deployContracts();
		testToken = await TestToken.deploy("sTT", "sTTT", 18);
		await portal.setWhitelistToken(testToken.address, true);

		//mint tokens
		mintableAmount = constants.WeiPerEther.mul(90000);
		await testToken.mint(owner.address, mintableAmount);

		//create synt representation of wrapper
		await syntFabric.createRepresentationByAdmin(
			testToken.address,
			hardhatChainID,
			"sTT",
			"sTT",
			18
		);

		let syntKey2 = ethers.utils.solidityKeccak256(
			["address", "uint256"],
			[testToken.address, hardhatChainID]
		);
		sTestTokenAddr = await syntFabric.getSyntRepresentationByKey(syntKey2);
		sTestToken = await STestToken.attach(sTestTokenAddr);
		console.log("sTestToken attached to ", sTestToken.address);
	});

	it("Should check syntesize req", async () => {
		let oldBalance = await testToken.balanceOf(owner.address);
		const syntAmount = constants.WeiPerEther.mul(10);

		const approve = {
			owner: owner.address,
			spender: portal.address,
			value: syntAmount,
		};

		const deadline = 100000000000000;
		const nonce = await testToken.nonces(owner.address);

		const digest = getPermitDigest(
			"Symbiosis",
			testToken.address,
			hardhatChainID,
			approve,
			nonce,
			deadline
		);

		// get esign here
		const { v, r, s } = sign(digest, ownerPrivateKey);

		let approvalData = utils.defaultAbiCoder.encode(
			["address", "uint256", "uint256", "uint8", "bytes32", "bytes32"],
			[approve.owner, approve.value, deadline, v, r, s]
		);

		let clientId = ethers.utils.formatBytes32String("some client id");

		let txSynt = await portal.synthesizeWithPermit({
				stableBridgingFee: stableBridgingFee,
				approvalData: approvalData,
				token: testToken.address,
				amount: syntAmount,
				chain2address: user.address,
				receiveSide: synthesis.address,
				oppositeBridge: bridge.address,
				revertableAddress: user.address,
				chainID: hardhatChainID,
				clientID: clientId
			});
		let syntReceipt = await txSynt.wait();
		let syntOracleRequestArgs = await library.catchOracleRequest(
			syntReceipt
		);

		let bytesSyntSelector = syntOracleRequestArgs[1];
		let receiveSideSynt = syntOracleRequestArgs[2];

		await bridge.receiveRequestV2(bytesSyntSelector, receiveSideSynt);

		expect(oldBalance.sub(syntAmount)).to.equal(
			await testToken.balanceOf(owner.address)
		);
		expect(syntAmount.sub(stableBridgingFee)).to.equal(
			await sTestToken.balanceOf(user.address)
		);
	});

	context("syntWithPermit() negative tests", function () {
		beforeEach(async function () {
			syntAmount = constants.WeiPerEther.mul(10);

			const approve = {
				owner: owner.address,
				spender: portal.address,
				value: syntAmount,
			};

			const deadline = 100000000000000;
			const nonce = await testToken.nonces(owner.address);

			const digest = getPermitDigest(
				"Symbiosis",
				testToken.address,
				hardhatChainID,
				approve,
				nonce,
				deadline
			);

			// get esign here
			const { v, r, s } = sign(digest, ownerPrivateKey);

			approvalData = utils.defaultAbiCoder.encode(
				[
					"address",
					"uint256",
					"uint256",
					"uint8",
					"bytes32",
					"bytes32",
				],
				[approve.owner, approve.value, deadline, v, r, s]
			);
		});

		it("Should fail on amount under threshold during synthesizeWithPermit", async () => {
			await portal.setTokenThreshold(
				testToken.address,
				constants.MaxInt256
			);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesizeWithPermit({
					stableBridgingFee: stableBridgingFee,
					approvalData: approvalData,
					token: testToken.address,
					amount: syntAmount,
					chain2address: user.address,
					receiveSide: synthesis.address,
					oppositeBridge: bridge.address,
					revertableAddress: user.address,
					chainID: hardhatChainID,
					clientID: clientId
				})
			).to.be.revertedWith("Symb: amount under threshold");
		});

		it("Should fail on synthesizeWithPermit when portal paused", async () => {
			await portal.pause();

			let clientId = ethers.utils.formatBytes32String("some client id");
			await expect(
				portal.synthesizeWithPermit({
					stableBridgingFee: stableBridgingFee,
					approvalData: approvalData,
					token: testToken.address,
					amount: syntAmount,
					chain2address: user.address,
					receiveSide: synthesis.address,
					oppositeBridge: bridge.address,
					revertableAddress: user.address,
					chainID: hardhatChainID,
					clientID: clientId
				})
			).to.be.revertedWith("");
		});

		it("Should fail on synthesizeWithPermit when token is not in whitelist", async () => {
			await portal.setWhitelistToken(testToken.address, false);

			let clientId = ethers.utils.formatBytes32String("some client id");

			await expect(
				portal.synthesizeWithPermit({
					stableBridgingFee: stableBridgingFee,
					approvalData: approvalData,
					token: testToken.address,
					amount: syntAmount,
					chain2address: user.address,
					receiveSide: synthesis.address,
					oppositeBridge: bridge.address,
					revertableAddress: user.address,
					chainID: hardhatChainID,
					clientID: clientId
				})
			).to.be.revertedWith("Symb: unauthorized token");
		});
	});
});
