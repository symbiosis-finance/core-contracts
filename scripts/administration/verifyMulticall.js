const { ethers } = require("hardhat");
hre = require("hardhat");

async function main() {
    const [admin] = await ethers.getSigners();
    console.log("Verifying contracts with account:", admin.address);
    console.log("Account balance:", (await admin.getBalance()).toString());
    const multicallAddress = "0x42Cd64f48496dDdfEfF8F3704df9175dbe20d325";

    await hre.run("verify:verify", {
        address: multicallAddress,
        constructorArguments: [],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
