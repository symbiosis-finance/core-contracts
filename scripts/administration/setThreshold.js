const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const path = require("path");
const fs = require("fs");
const { timeout } = require("../../utils/utils");

async function main() {
    const network = hre.network.name;
    const config = require("../configs/setThreshold-config.json");
    const currentDeploymentConfig = require(`../configs/deployWithBridgeV2-config.json`);
    const currentDeployment = require(`../deployments/deployWithBridgeV2-${network}.json`);

    let currentDeploymentRepresentations = { tokens: [] };
    if (
        fs.existsSync(
            path.join(
                __dirname,
                `../deployments/createRepresentations-${network}.json`
            )
        )
    ) {
        currentDeploymentRepresentations = require(`../deployments/createRepresentations-${network}.json`);
    }

    const portalAddress = currentDeployment.portal.proxy;
    const synthesisAddress = currentDeployment.synthesis.proxy;

    const Synthesis = await ethers.getContractFactory("Synthesis");
    const Portal = await ethers.getContractFactory("Portal");
    const SyntERC20 = await ethers.getContractFactory("SyntERC20");
    const ERC20 = await ethers.getContractFactory("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");

    const thresholdToSet = config[network].threshold;
    const realTokenAddress =
        currentDeploymentConfig[network].portalWhitelistToken; // token to set threshold on portal
    console.log("real token address", realTokenAddress);

    const [owner] = await ethers.getSigners();
    console.log("Setup contracts with the account:", owner.address);
    console.log("Account balance:", (await owner.getBalance()).toString());

    const portal = await Portal.attach(portalAddress);
    const synthesis = await Synthesis.attach(synthesisAddress);

    let realToken = await ERC20.attach(realTokenAddress);
    let multiplier = BigNumber.from("10").pow(await realToken.decimals());

    await portal.setTokenThreshold(
        realTokenAddress,
        BigNumber.from(thresholdToSet).mul(multiplier)
    );

    await timeout(15000);
    console.log(
        "Portal real token and threshold:",
        realTokenAddress,
        (await portal.tokenThreshold(realTokenAddress)).toString()
    );

    for (let i = 0; i < currentDeploymentRepresentations.tokens.length; i++) {
        let synthTokenAddress =
            currentDeploymentRepresentations.tokens[i].syntRepr;

        let synthToken = await SyntERC20.attach(synthTokenAddress);
        multiplier = BigNumber.from("10").pow(await synthToken.decimals());

        await synthesis.setTokenThreshold(
            synthTokenAddress,
            BigNumber.from(thresholdToSet).mul(multiplier)
        );

        await timeout(15000);
        console.log(
            "Synthesis synth token and threshold:",
            synthTokenAddress,
            (await synthesis.tokenThreshold(synthTokenAddress)).toString()
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
