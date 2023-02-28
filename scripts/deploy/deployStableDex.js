const { ethers, hre } = require("hardhat");
let fs = require("fs");
const path = require("path");
const config = require("../configs/deployStableDex-config.json");
const currentDeploymentConfig = require(`scripts/configs/deployWithBridgeV2-config.json`);

async function main() {
	const [deployer] = await ethers.getSigners();
	console.log("Deploying stable dex with the account:", deployer.address);
	console.log("Account balance:", (await deployer.getBalance()).toString());

	const network = hre.network.name;
	let synthTokens = require(`./deployments/createRepresentations-${network}.json`);

	let originalTokenAddress =
		currentDeploymentConfig[network].portalWhitelistToken;
	const SyntERC20 = await ethers.getContractFactory("SyntERC20");
	const ERC20 = await ethers.getContractFactory("ERC20");
	let originalToken = await ERC20.attach(originalTokenAddress);
	let originalTokenDecimals = await originalToken.decimals();
	let originalTokenName = await originalToken.name();

	let result = { deployer: deployer.address, pools: [] };

	const MathUtils = await ethers.getContractFactory("MathUtils");
	let SwapUtils,
		StableDex,
		mathUtils,
		swapUtils,
		stableDex,
		synthTokenName,
		poolName;

	let devaddr =
		config.devaddr === "deployer" ? deployer.address : config.devaddr;

	for (let synthToken of synthTokens["tokens"]) {
		mathUtils = await MathUtils.deploy();
		await mathUtils.deployed();

		console.log("MathUtils deployed to: ", mathUtils.address);

		SwapUtils = await ethers.getContractFactory("SwapUtils", {
			libraries: {
				MathUtils: mathUtils.address,
			},
		});
		swapUtils = await SwapUtils.deploy();
		await swapUtils.deployed();
		console.log("SwapUtils deployed to: ", swapUtils.address);

		StableDex = await ethers.getContractFactory("Swap", {
			libraries: {
				SwapUtils: swapUtils.address,
			},
		});

		synthToken = await SyntERC20.attach(synthToken.syntRepr);
		synthTokenName = await synthToken.name();

		stableDex = await StableDex.deploy(
			[originalTokenAddress, synthToken.address],
			[originalTokenDecimals, await synthToken.decimals()],
			config.lpTokenName,
			config.lpTokenSymbol,
			config.a,
			config.fee,
			config.adminFee,
			config.depositFee,
			config.withdrawFee,
			devaddr
		);
		await stableDex.deployed();

		poolName = `${originalTokenName} | ${synthTokenName}`;

		console.log(`Stable dex ${poolName} deployed to: ${stableDex.address}`);
		result["pools"].push({
			name: poolName,
			math_utils: mathUtils.address,
			swap_utils: swapUtils.address,
			stable_dex: stableDex.address,
		});
	}

	let json = JSON.stringify(result, null, 4);
	fs.writeFileSync(
		path.join(__dirname, `deployments/deployStableDex-${network}.json`),
		json,
		"utf8"
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
