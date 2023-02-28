const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
	const network = hre.network.name;
	let deploymentAddress = `../deployments/deployWithBridgeV2-${network}.json`;
	const currentDeployment = require(deploymentAddress);

	const [deployer] = await ethers.getSigners();
	console.log("Deploying contracts with the account:", deployer.address);

	const MetaRouter = await ethers.getContractFactory("MetaRouter");
	const Synthesis = await ethers.getContractFactory("Synthesis");
	const Portal = await ethers.getContractFactory("Portal");

	let synthesis = await Synthesis.attach(currentDeployment.synthesis.proxy);
	let portal = await Portal.attach(currentDeployment.portal.proxy);

	const metaRouter = await MetaRouter.deploy();
	await metaRouter.deployed();

	console.log("MetaRouter deployed to:", metaRouter.address);
	let metarouterGateway = await metaRouter.metaRouterGateway();
	console.log("MetaRouter Gateway deployed to:", metarouterGateway);

	await synthesis.setMetaRouter(metaRouter.address);
	await portal.setMetaRouter(metaRouter.address);

	currentDeployment["metarouter"] = metaRouter.address;
	currentDeployment["metarouter_gateway"] = metarouterGateway;

	let json = JSON.stringify(currentDeployment, null, 4);
	fs.writeFileSync(path.join(__dirname, deploymentAddress), json, "utf8");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
