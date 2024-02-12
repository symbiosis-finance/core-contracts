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

    const metarouterAddress = currentDeployment["metarouter"];
    const metarouterGatewayAddress = currentDeployment["metarouter_gateway"];

    // const metarouterAddress = '0x7bD0a0549e546f4e1C2D8eC53F705f8f60559bb1';
    // const metarouterGatewayAddress = '0x3006Dd3B40f33598A0a219602998D8C3715e75E5';

    console.log(metarouterAddress, metarouterGatewayAddress);

    await hre.run("verify:verify", {
        address: metarouterAddress,
        constructorArguments: [],
    });

    await hre.run("verify:verify", {
        address: metarouterGatewayAddress,
        constructorArguments: [metarouterAddress],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
