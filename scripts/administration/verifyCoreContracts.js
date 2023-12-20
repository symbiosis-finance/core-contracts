const library = require("../deploy-lib");
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
hre = require("hardhat");

async function main() {
    const network = hre.network.name;
    const deploymentAddress = path.join(
        __dirname,
        `../deployments/deployWithBridgeV2-${network}.json`
    );
    const currentDeployment = require(deploymentAddress);

    const [admin] = await ethers.getSigners();
    console.log("Verifying contracts with account:", admin.address);
    console.log("Account balance:", (await admin.getBalance()).toString());

    const portalImplAddress = currentDeployment['portal'].impl;
    const bridgeImplAddress = currentDeployment['bridge'].impl;
    // const synthesisImplAddress = currentDeployment['synthesis'].impl;
    // const synthFabricImplAddress = currentDeployment['fabric'].impl;

    await hre.run("verify:verify", {
        address: portalImplAddress,
        constructorArguments: [],
    });

    await hre.run("verify:verify", {
        address: bridgeImplAddress,
        constructorArguments: [],
    });

    // await hre.run("verify:verify", {
    //     address: synthesisImplAddress,
    //     constructorArguments: [],
    // });
    //
    // await hre.run("verify:verify", {
    //     address: synthFabricImplAddress,
    //     constructorArguments: [],
    // });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
