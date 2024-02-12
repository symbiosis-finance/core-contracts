const { ethers, upgrades} = require("hardhat");
const fs = require("fs");
const path = require("path");
const {timeout} = require("../utils/timeout");

async function main() {
    const network = hre.network.name;
    let deploymentAddress = `../deployments/deployWithBridgeV2-${network}.json`;
    let multisigAddress = `./multisigConfig.json`;
    const currentDeployment = require(deploymentAddress);
    const multisigs = require(multisigAddress)

    const [deployer] = await ethers.getSigners();
    console.log("Setup contracts with the account:", deployer.address);

    const safe_address = multisigs[network];

    const Portal = await ethers.getContractFactory("Portal");
    const Bridge = await ethers.getContractFactory("BridgeV2");
    let proxyAdmin = await upgrades.admin.getInstance();

    const portal = await Portal.attach(currentDeployment.portal.proxy);
    const bridge = await Bridge.attach(currentDeployment.bridge.proxy);

    await portal.transferOwnership(safe_address);
    await bridge.transferOwnership(safe_address);
    await proxyAdmin.transferOwnership(safe_address);

    await timeout(30000);

    console.log(await portal.owner());
    console.log(await bridge.owner());
    console.log(await proxyAdmin.owner());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
