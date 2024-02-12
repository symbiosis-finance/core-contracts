const library = require("../deploy-lib");
const config = require("../configs/deployWithBridgeV2-config.json");
const hre = require("hardhat");

async function main() {
	const network = hre.network.name;

	const wrapper = config[network].wrapper;
	const mpc = config[network].mpc;
	const portalWhitelistToken = config[network].portalWhitelistToken;

	const deployPortal = true;
	const deploySynthesis = false;

	await library.deployContracts(
		wrapper,
		mpc,
		portalWhitelistToken,
		deployPortal,
		deploySynthesis
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
