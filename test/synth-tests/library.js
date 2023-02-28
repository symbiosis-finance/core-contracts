const { ethers, upgrades } = require("hardhat");
const ERC20Abi = require("../abi/ERC20Mock.json");

async function getContractFactory(name) {
	return await ethers.getContractFactory(name);
}

const hardhatChainID = 31337;
const trustedForwarder = "0x83A54884bE4657706785D7309cf46B58FE5f6e8a";
const abiCoder = ethers.utils.defaultAbiCoder;

const oracleRequestTopic = ethers.utils.id(
	"OracleRequest(address,bytes,address,address,uint256)"
);
module.exports = {
	deployContracts: async function () {
		[owner] = await ethers.getSigners();
		const wethAbi = require('../abi/WETH9.json');
		const Wrapper = await ethers.getContractFactory(wethAbi.abi, wethAbi.bytecode);
		const Portal = await getContractFactory("Portal");
		const Synthesis = await getContractFactory("Synthesis");
		const ERC20Abi = require("../abi/ERC20Mock.json");
		const TestToken = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);
		const Fabric = await getContractFactory("SyntFabric");
		const STestToken = await getContractFactory("SyntERC20");
		const Bridge = await getContractFactory("BridgeV2");
		const MetaRouter = await getContractFactory("MetaRouter");

		//deploy tokens
		let testToken = await TestToken.deploy("First Token", "FIRST", 18);

		let wrapper = await Wrapper.deploy();

		metaRouter = await MetaRouter.deploy();

		//deploy portal, synthesis, syntFabric, bridge
		let bridge = await upgrades.deployProxy(Bridge, [owner.address]);

		let portal = await upgrades.deployProxy(Portal, [
			bridge.address,
			trustedForwarder,
			wrapper.address,
			testToken.address,
			metaRouter.address,
		]);

		let synthesis = await upgrades.deployProxy(Synthesis, [
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

		let syntKey2 = ethers.utils.solidityKeccak256(
			["address", "uint256"],
			[testToken.address, hardhatChainID]
		);
		sTestTokenAddr = await syntFabric.getSyntRepresentationByKey(syntKey2);
		sTestToken = await STestToken.attach(sTestTokenAddr);
		console.log("sTestTokenBridging attached to ", sTestToken.address);

		return [
			wrapper,
			sTestToken,
			testToken,
			bridge,
			portal,
			synthesis,
			syntFabric,
		];
	},

	catchOracleRequest: async function (receiptSynt) {
		let oracleRequestSynt = receiptSynt.events.filter((x) => {
			return x.topics[0] == oracleRequestTopic;
		});
		let oracleRequestArgs = abiCoder.decode(
			["address", "bytes", "address", "address", "uint256"],
			oracleRequestSynt[0].data
		);
		return oracleRequestArgs;
	},
};
