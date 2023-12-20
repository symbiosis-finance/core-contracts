const { ethers } = require("hardhat");
const hre = require("hardhat");
const config = require("../configs/deployWithBridgeV2-config.json");

async function main() {
    const [admin] = await ethers.getSigners();
    console.log("Verifying contracts with account:", admin.address);
    console.log("Account balance:", (await admin.getBalance()).toString());
    const network = hre.network.name;
    const wrapper = config[network].wrapper;

    const multicallAddress = "0xf02bBC9de6e443eFDf3FC41851529C2c3B9E5e0C";

    await hre.run("verify:verify", {
        address: multicallAddress,
        constructorArguments: [wrapper],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
