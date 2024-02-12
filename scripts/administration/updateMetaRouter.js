const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const {timeout} = require("../utils/timeout");

async function main() {
	const network = hre.network.name;
	let deploymentAddress = `../deployments/deployWithBridgeV2-${network}.json`;
	const currentDeployment = require(deploymentAddress);

	const [deployer] = await ethers.getSigners();
	console.log("Setup contracts with the account:", deployer.address);

	const MetaRouter = await ethers.getContractFactory("MetaRouter");
	const metaRouter = await MetaRouter.deploy();
	await metaRouter.deployed();
	console.log("MetaRouter deployed to:", metaRouter.address);
	await timeout(15000);
	let metarouterGateway = await metaRouter.metaRouterGateway();
	console.log("MetaRouter Gateway deployed to:", metarouterGateway);
	currentDeployment["metarouter"] = metaRouter.address;
	currentDeployment["metarouter_gateway"] = metarouterGateway;

	// if (currentDeployment.synthesis) {
	// 	const Synthesis = await ethers.getContractFactory("Synthesis");
	// 	let synthesis = await Synthesis.attach(currentDeployment.synthesis.proxy);
	// 	await synthesis.setMetaRouter(metaRouter.address);
	// }
	//
	// if (currentDeployment.portal) {
	// 	const Portal = await ethers.getContractFactory("Portal");
	// 	let portal = await Portal.attach(currentDeployment.portal.proxy);
	// 	await portal.setMetaRouter(metaRouter.address);
	// }
	//
	let json = JSON.stringify(currentDeployment, null, 4);
	fs.writeFileSync(path.join(__dirname, deploymentAddress), json, "utf8");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
