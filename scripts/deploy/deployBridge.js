const library = require("../deploy-lib");
const config = require("../configs/deployBridgeV2-config.json");
const hre = require("hardhat");

async function main() {
	const network = hre.network.name;
	const mpc = config[network].mpc;

	console.log(`Deploying Bridge V2 on network ${network} with mpc: ${mpc}`);
	const Bridge = await ethers.getContractFactory("BridgeV2");
	const bridge = await upgrades.deployProxy(Bridge, [mpc]);
	await bridge.deployed();
	console.log("Bridge V2 deployed to:", bridge.address);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

