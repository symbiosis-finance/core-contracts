const library = require("../deploy-lib");
const fs = require("fs");
const path = require("path");
const { ethers, upgrades } = require("hardhat");

async function main() {
    const network = hre.network.name;
    const deploymentAddress = path.join(
        __dirname,
        `../deployments/deployWithBridgeV2-${network}.json`
    );
    const currentDeployment = require(deploymentAddress);

    const [admin] = await ethers.getSigners();
    console.log("Account:", admin.address);
    console.log("Account balance:", (await admin.getBalance()).toString());

    const Synthesis = await ethers.getContractFactory("Synthesis");
    const Portal = await ethers.getContractFactory("Portal");
    const Bridge = await ethers.getContractFactory("BridgeV2");
    const Fabric = await ethers.getContractFactory("SyntFabric");

    // const synthesisAddress = currentDeployment["synthesis"].proxy;
    const portalAddress = currentDeployment["portal"].proxy;
    // const fabricAddress = currentDeployment["fabric"].proxy;
    const bridgeAddress = currentDeployment["bridge"].proxy;

    // await upgrades.forceImport(portalAddress, Portal, { 'kind': 'transparent' })
    // console.log("Imported ", portalAddress);
    // await upgrades.forceImport(bridgeAddress, Bridge, { 'kind': 'transparent' })
    // console.log("Imported ", bridgeAddress);

    let portalImpl = await upgrades.prepareUpgrade(
        portalAddress,
        Portal
    );
    console.log(`new portal implementation address on ${network}: ${portalImpl}`);

    let bridgeImpl = await upgrades.prepareUpgrade(
        bridgeAddress,
        Bridge
    );
    console.log(`new bridge implementation address on ${network}: ${bridgeImpl}`);

    // let synthesisImpl = await upgrades.prepareUpgrade(
    //     synthesisAddress,
    //     Synthesis
    // );
    // console.log(`new synthesis implementation address on ${network}: ${synthesisImpl}`);
    //
    // let fabricImpl = await upgrades.prepareUpgrade(
    //     fabricAddress,
    //     Fabric
    // );
    // console.log(`new fabric implementation address on ${network}: ${fabricImpl}`);

    currentDeployment['portal'].impl = portalImpl;
    currentDeployment['bridge'].impl = bridgeImpl;
    // currentDeployment['fabric'].impl = fabricImpl;
    // currentDeployment['synthesis'].impl = synthesisImpl;

    let json = JSON.stringify(currentDeployment, null, 4);
    fs.writeFileSync(deploymentAddress, json, "utf8");

    // let synthesisImpl = await upgrades.prepareUpgrade(
    //     synthesisAddress,
    //     Synthesis
    // );
    // console.log(`new synthesis implementation address on ${network}: ${synthesisImpl}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });