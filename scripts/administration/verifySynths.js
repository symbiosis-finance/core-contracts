const library = require("../deploy-lib");
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
hre = require("hardhat");

async function main() {
    const network = hre.network.name;
    const deploymentAddress = path.join(
        __dirname,
        `../deployments/createRepresentations-${network}.json`
    );
    const currentDeployment = require(deploymentAddress);

    const [admin] = await ethers.getSigners();
    console.log("Verifying contracts with account:", admin.address);
    console.log("Account balance:", (await admin.getBalance()).toString());

    for (let token of currentDeployment['tokens']) {
        await hre.run("verify:verify", {
            address: token.synthRepr,
            constructorArguments: [token.originalToken['name'], token.originalToken['symbol'], token.originalToken['decimals']],
        });
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
