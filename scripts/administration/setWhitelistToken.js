const {ethers} = require("hardhat");
const {timeout} = require("../utils/timeout");

async function main() {
    const [owner] = await ethers.getSigners();
    console.log("Setup contracts with the account:", owner.address);
    console.log("Account balance:", (await owner.getBalance()).toString());

    const network = hre.network.name;
    const currentDeployment = require(`../deployments/deployWithBridgeV2-${network}.json`);

    const Portal = await ethers.getContractFactory("Portal");
    const portal = await Portal.attach(currentDeployment["portal"].proxy);
    console.log('Portal attached to', portal.address);

    const token = '0x126969743a6d300bab08F303f104f0f7DBAfbe20';
    await portal.setWhitelistToken(token, true);
    await timeout(15000);
    console.log('token status', await portal.tokenWhitelist(token));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
