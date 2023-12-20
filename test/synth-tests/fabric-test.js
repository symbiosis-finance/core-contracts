const { expect } = require("chai");
const { constants } = require("ethers");
const { ethers, upgrades} = require("hardhat");
const library = require("./library");

const hardhatChainID = 31337;
const stableBridgingFee = 100;
const trustedForwarder = "0x83A54884bE4657706785D7309cf46B58FE5f6e8a";

let metaRouter, bridge, synthesis, owner, syntFabric;

async function getContractFactory(name) {
    return await ethers.getContractFactory(name);
}

describe("Fabric tests", function () {
    beforeEach(async () => {
        [owner] = await ethers.getSigners();
        // get factories for contracts

        const Synthesis = await getContractFactory("Synthesis");
        const Fabric = await getContractFactory("SyntFabric");
        const MetaRouter = await getContractFactory("MetaRouter");
        const Bridge = await getContractFactory("BridgeV2");

        metaRouter = await MetaRouter.deploy();

        bridge = await upgrades.deployProxy(Bridge, [owner.address]);

        synthesis = await upgrades.deployProxy(Synthesis, [
            bridge.address,
            trustedForwarder,
            metaRouter.address,
        ]);

        syntFabric = await upgrades.deployProxy(Fabric, [synthesis.address]);

        await synthesis.setFabric(syntFabric.address);
    })

    it("Should fail on creating representation of zero address", async () => {
        await expect(syntFabric.createRepresentationByAdmin(
            ethers.constants.AddressZero,
            hardhatChainID,
            "sTT",
            "sTT",
            18
        )).to.be.revertedWith("Symb: rtoken is the zero address");
    });
});
