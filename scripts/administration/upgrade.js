const library = require("../deploy-lib");
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

async function main() {
	const network = hre.network.name;
	const deploymentAddress = path.join(
		__dirname,
		`../deployments/deployWithBridgeV2-${network}.json`
	);
	const currentDeployment = require(deploymentAddress);

	const [admin] = await ethers.getSigners();
	console.log("Account:", admin.address);
	console.log("Account balance:", (await admin.getBalance()).toString());

	const synthesisAddress = currentDeployment["synthesis"].proxy;
	const portalAddress = currentDeployment["portal"].proxy;
	const fabricAddress = currentDeployment["fabric"].proxy;
	const bridgeAddress = currentDeployment["bridge"].proxy;

	[bridgeImpl, portalImpl, synthesisImpl, fabricImpl] = await library.upgrade(
		portalAddress,
		synthesisAddress,
		fabricAddress,
		bridgeAddress
	);

	if (synthesisAddress) {
		currentDeployment["synthesis"].impl = synthesisImpl;
	}
	if (fabricAddress) {
		currentDeployment["fabric"].impl = fabricImpl;
	}
	if (portalAddress) {
		currentDeployment["portal"].impl = portalImpl;
	}
	currentDeployment["bridge"].impl = bridgeImpl;

	let json = JSON.stringify(currentDeployment, null, 4);
	fs.writeFileSync(deploymentAddress, json, "utf8");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
