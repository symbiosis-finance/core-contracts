const { ethers, upgrades} = require("hardhat");
const fs = require("fs");
const path = require("path");
const {timeout} = require("../utils/timeout");

async function main() {
    const network = hre.network.name;
    let multisigAddress = `./multisigConfig.json`;
    const multisigs = require(multisigAddress);

    const [deployer] = await ethers.getSigners();
    console.log("Setup contracts with the account:", deployer.address);

    const OnchainSwapV3 = await ethers.getContractFactory("OnchainSwapV3");

    const safe_address = multisigs[network];
    const feeCollector = OnchainSwapV3.attach("0xf85FC807D05d3Ab2309364226970aAc57b4e1ea4");
    await feeCollector.transferOwnership(safe_address);

    await timeout(15000);

    console.log(await feeCollector.owner());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
