const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { timeout } = require("../utils/utils");
const {parseEther, parseUnits} = require("ethers/lib/utils");
const trustedForwarder = ethers.constants.AddressZero;

module.exports = {
	getSynthRepresentation: async function (fabricAddress, realTokenAddress, realTokenChainId) {
		const Fabric = await ethers.getContractFactory("SyntFabric");
		const fabric = await Fabric.attach(fabricAddress);

		return (await fabric.getSyntRepresentation(realTokenAddress, realTokenChainId));
	},
	deployContracts: async function (
		wrapperAddress,
		mpcAddress,
		portalWhitelistToken,
		deployPortal = true,
		deploySynthesis = true,
		nonEvm = false
	) {
		const [deployer] = await ethers.getSigners();
		console.log("Deploying contracts with the account:", deployer.address);
		console.log(
			"Account balance:",
			(await deployer.getBalance()).toString()
		);

		let synthesis, portal, fabric;
		let result = { deployer: deployer.address, nonEvm: nonEvm };
		const threshold = parseEther('0.005');

		// METAROUTER
		const MetaRouter = await ethers.getContractFactory(
			nonEvm ? "MetaRouterNonEvm" : "MetaRouter"
		);
		const metaRouter = await MetaRouter.deploy();
		await metaRouter.deployed();
		console.log("MetaRouter deployed to:", metaRouter.address);
		result["metarouter"] = metaRouter.address;

		await timeout(15000);
		let metaRouterGatewayAddress = await metaRouter.metaRouterGateway();
		console.log("MetaRouterGateway deployed to:", metaRouterGatewayAddress);
		result["metarouter_gateway"] = metaRouterGatewayAddress;

		// BRIDGE V2
		const Bridge = await ethers.getContractFactory(
			nonEvm ? "BridgeV2NonEvm" : "BridgeV2"
		);
		const bridge = await upgrades.deployProxy(Bridge, [mpcAddress]);
		await bridge.deployed();
		console.log("Bridge V2 deployed to:", bridge.address);
		await bridge.setAdminPermission("0xd99ac0681b904991169a4f398B9043781ADbe0C3", true);

		// SYMBIOSIS MULTICALL
		const MulticallRouter = await ethers.getContractFactory(
			"MulticallRouter"
		);
		const multicallRouter = await MulticallRouter.deploy();
		await multicallRouter.deployed();
		console.log("MulticallRouter deployed to:", multicallRouter.address);
		result["multicallRouter"] = multicallRouter.address;

		// SYNTHESIS, FABRIC
		if (deploySynthesis) {
			const Synthesis = await ethers.getContractFactory(
				nonEvm ? "SynthesisNonEvm" : "Synthesis"
			);
			synthesis = await upgrades.deployProxy(Synthesis, [
				bridge.address,
				trustedForwarder,
				metaRouter.address,
			]);
			await synthesis.deployed();
			console.log("Synthesis deployed to:", synthesis.address);
			await bridge.setTransmitterStatus(synthesis.address, true);

			const Fabric = await ethers.getContractFactory(
				nonEvm ? "SyntFabricNonEvm" : "SyntFabric"
			);
			fabric = await upgrades.deployProxy(Fabric, [synthesis.address]);
			await fabric.deployed();
			console.log("Fabric deployed to:", fabric.address);

			await synthesis.setFabric(fabric.address);
		}

		// PORTAL
		if (deployPortal && !nonEvm) {
			const Portal = await ethers.getContractFactory("Portal");
			portal = await upgrades.deployProxy(Portal, [
				bridge.address,
				trustedForwarder,
				wrapperAddress,
				portalWhitelistToken,
				metaRouter.address,
			]);
			await portal.deployed();
			console.log("Portal deployed to:", portal.address);
			await bridge.setTransmitterStatus(portal.address, true);
			await portal.setTokenThreshold(portalWhitelistToken, threshold);
		}

		// const Unwrapper = await ethers.getContractFactory("Unwrapper");
		// const unwrapper = await Unwrapper.deploy(wrapperAddress);
		// console.log("Unwrapper deployed to:", unwrapper.address);
		// result["unwrapper"] = unwrapper.address;

		await timeout(15000);

		let proxyAdmin = await upgrades.admin.getInstance();

		const bridgeImpl = await proxyAdmin.getProxyImplementation(
			bridge.address
		);
		console.log("Bridge impl:", bridgeImpl);

		if (deploySynthesis) {
			const synthesisImpl = await proxyAdmin.getProxyImplementation(
				synthesis.address
			);
			const fabricImpl = await proxyAdmin.getProxyImplementation(
				fabric.address
			);
			console.log("Synthesis impl:", synthesisImpl);
			console.log("Fabric impl:", fabricImpl);

			result["synthesis"] = {
				proxy: synthesis.address,
				impl: synthesisImpl,
			};
			result["fabric"] = { proxy: fabric.address, impl: fabricImpl };
		}

		if (deployPortal && !nonEvm) {
			const portalImpl = await proxyAdmin.getProxyImplementation(
				portal.address
			);
			console.log("Portal impl:", portalImpl);
			result["portal"] = { proxy: portal.address, impl: portalImpl };
		}

		result["bridge"] = { proxy: bridge.address, impl: bridgeImpl };
		result["proxy_admin"] = proxyAdmin.address;

		let json = JSON.stringify(result, null, 4);
		fs.writeFileSync(
			path.join(
				__dirname,
				`deployments/deployWithBridgeV2-${hre.network.name}.json`
			),
			json,
			"utf8"
		);
	},
	createRepresentation: async function (
		fabricAddress,
		realTokenAddress,
		chainID,
		name,
		symbol,
		decimals
	) {
		const [deployer] = await ethers.getSigners();

		console.log(
			"Creating representations with the account:",
			deployer.address
		);
		console.log(
			"Account balance:",
			(await deployer.getBalance()).toString()
		);

		const Fabric = await ethers.getContractFactory("SyntFabric");
		const fabric = await Fabric.attach(fabricAddress);
		console.log("Fabric attached to ", fabric.address);

		await fabric.createRepresentationByAdmin(
			realTokenAddress,
			chainID,
			name,
			symbol,
			decimals
		);

		await timeout(15000);

		return await fabric.getSyntRepresentation(realTokenAddress, chainID);
	},
	upgrade: async function (
		portalAddress,
		synthesisAddress,
		fabricAddress,
		bridgeAddress
	) {
		let portalImpl, synthesisImpl, fabricImpl, bridgeImpl;

		if (portalAddress) {
			const Portal = await ethers.getContractFactory("Portal");
			await upgrades.upgradeProxy(portalAddress, Portal);
			console.log("Portal upgraded");
		}

		if (synthesisAddress) {
			const Synthesis = await ethers.getContractFactory("Synthesis");
			await upgrades.upgradeProxy(synthesisAddress, Synthesis);
			console.log("Synthesis upgraded");
		}

		const Bridge = await ethers.getContractFactory("BridgeV2");
		await upgrades.upgradeProxy(bridgeAddress, Bridge);
		console.log("Bridge upgraded");

		if (fabricAddress) {
			const Fabric = await ethers.getContractFactory("SyntFabric");
			await upgrades.upgradeProxy(fabricAddress, Fabric);
			console.log("Fabric upgraded");
		}

		await timeout(15000);

		let proxyAdmin = await upgrades.admin.getInstance();

		if (portalAddress) {
			portalImpl = await proxyAdmin.getProxyImplementation(portalAddress);
			console.log("portal impl", portalImpl);
		}

		if (synthesisAddress) {
			synthesisImpl = await proxyAdmin.getProxyImplementation(
				synthesisAddress
			);
			console.log("synthesis impl", synthesisImpl);
		}

		bridgeImpl = await proxyAdmin.getProxyImplementation(bridgeAddress);
		console.log("bridge impl", bridgeImpl);

		if (fabricAddress) {
			fabricImpl = await proxyAdmin.getProxyImplementation(fabricAddress);
			console.log("fabric impl", fabricImpl);
		}

		return [bridgeImpl, portalImpl, synthesisImpl, fabricImpl];
	},
};
