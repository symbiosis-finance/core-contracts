const { ethers } = require("hardhat");
hre = require("hardhat");

async function main() {
    const [admin] = await ethers.getSigners();
    console.log("Verifying contracts with account:", admin.address);
    console.log("Account balance:", (await admin.getBalance()).toString());
    const onchainSwapAddress = "0xf02bBC9de6e443eFDf3FC41851529C2c3B9E5e0C";
    const Onchain = await ethers.getContractFactory("OnchainSwapV3");
    const onchain  = await Onchain.attach(onchainSwapAddress)
    const onchainSwapGatewayAddress = await onchain.onchainGateway();
    await hre.run("verify:verify", {
        address: onchainSwapAddress,
        constructorArguments: [],
    });

    await hre.run("verify:verify", {
        address: onchainSwapGatewayAddress,
        constructorArguments: [onchainSwapAddress],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
