const {ethers} = require("hardhat");

const { timeout } = require("../../utils/utils");

const adminAddress = "0xd99ac0681b904991169a4f398B9043781ADbe0C3"; // TODO: check address before run

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Setting admin on bridge with account:", deployer.address);
    const network = hre.network.name;

    const currentChain = require(`../deployments/deployWithBridgeV2-${network}.json`);

    const Bridge = await ethers.getContractFactory("BridgeV2");
    const bridge = await Bridge.attach(currentChain.bridge.proxy);

    console.log("BridgeV2:", bridge.address);
    console.log("admin:", adminAddress);

    await bridge.setAdminPermission(adminAddress, true);
    await timeout(15000);

    console.log("is admin:", (await bridge.isAdmin(adminAddress)).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
