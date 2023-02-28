const { ethers, hre } = require("hardhat");
const fs = require("fs");
const path = require("path");
const deployWithBridgeConfig = require("../configs/deployWithBridgeV2-config.json");
const createRepresentationsConfig = require("../configs/createRepresentations-config.json");

async function main() {
	const ERC20 = await ethers.getContractFactory("ERC20Mock");
	const Wrapper = await ethers.getContractFactory("WETH9");

	let USDC = await ERC20.deploy("USD Coin", "USDC", 6);
	let wrapper = await Wrapper.deploy();

	console.log("Wrapper on local node deployed to:", wrapper.address);
	console.log("USDC on local node deployed to:", USDC.address);

	let deployWithBridgeConfig = require("../configs/deployWithBridgeV2-config.json");
	deployWithBridgeConfig["fork"].wrapper = wrapper.address;
	deployWithBridgeConfig["fork"].portalWhitelistToken = USDC.address;

	let deployWithBridgeConfigUpd = JSON.stringify(
		deployWithBridgeConfig,
		null,
		4
	);
	fs.writeFileSync(
		path.join(__dirname, `../configs/deployWithBridgeV2-config.json`),
		deployWithBridgeConfigUpd,
		"utf8"
	);

	let createRepresentationsConfig = require("../configs/createRepresentations-config.json");
	createRepresentationsConfig["fork"] = {
		originalTokens: [
			{
				address: USDC.address,
				name: "Synthetic USD Coin",
				symbol: "sUSDC",
				decimals: 6,
				chainID: 31337,
			},
		],
	};

	let createRepresentationsConfigUpd = JSON.stringify(
		createRepresentationsConfig,
		null,
		4
	);
	fs.writeFileSync(
		path.join(__dirname, `../configs/createRepresentations-config.json`),
		createRepresentationsConfigUpd,
		"utf8"
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
