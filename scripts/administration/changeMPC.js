const {ethers} = require("hardhat");

async function main() {
    const [owner] = await ethers.getSigners();
    console.log("Setup contracts with the account:", owner.address);
    console.log("Account balance:", (await owner.getBalance()).toString());

    const network = hre.network.name;
    const currentDeployment = require(`../deployments/deployWithBridgeV2-${network}.json`);

    const Bridge = await ethers.getContractFactory("BridgeV2");
    const bridge = await Bridge.attach(currentDeployment["bridge"].proxy);

    const newMPC = "0xb4ADe33Bba3512c8c0B489cbd03aAd3557EC49Ca"; // TODO: check address before run

    await bridge.changeMPC(newMPC);
    console.log("MPC changed to", newMPC);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
