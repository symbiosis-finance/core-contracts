const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");
const { timeout } = require("../../utils/utils");
const {parseUnits} = require("ethers/lib/utils");

async function main() {
    const network = hre.network.name;
    const [owner] = await ethers.getSigners();
    console.log("Setup contracts with the account:", owner.address);
    console.log("Account balance:", (await owner.getBalance()).toString());

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

    const thresholdToSet = config[network].threshold;

    const SyntERC20 = await ethers.getContractFactory("SyntERC20");
    const ERC20 = await ethers.getContractFactory("@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20");

    if (currentDeployment.portal) {
        const Portal = await ethers.getContractFactory("Portal");
        const portal = await Portal.attach(currentDeployment.portal.proxy);

        const realTokenAddress = currentDeploymentConfig[network].portalWhitelistToken; // token to set threshold on portal
        console.log("real token address", realTokenAddress);
        let realToken = await ERC20.attach(realTokenAddress);

        await portal.setTokenThreshold(
            realTokenAddress,
            parseUnits(thresholdToSet.toString(), await realToken.decimals())
        );

        await timeout(15000);
        console.log(
            "Portal real token, decimals and threshold:",
            realTokenAddress,
            await realToken.decimals(),
            (await portal.tokenThreshold(realTokenAddress)).toString()
        );
    }
    if (currentDeployment.synthesis) {
        const Synthesis = await ethers.getContractFactory("Synthesis");
        const synthesis = await Synthesis.attach(currentDeployment.synthesis.proxy);

        for (let i = 0; i < currentDeploymentRepresentations.tokens.length; i++) {
            let synthTokenAddress = currentDeploymentRepresentations.tokens[i].syntRepr;
            let synthToken = await SyntERC20.attach(synthTokenAddress);

            await synthesis.setTokenThreshold(
                synthTokenAddress,
                parseUnits(thresholdToSet.toString(), await synthToken.decimals())
            );

            await timeout(15000);
            console.log(
                "Synthesis synth token, decimals and threshold:",
                synthTokenAddress,
                await synthToken.decimals(),
                (await synthesis.tokenThreshold(synthTokenAddress)).toString()
            );
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
