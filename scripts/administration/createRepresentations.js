const library = require("../deploy-lib");
const fs = require("fs");
const path = require("path");
const {getSynthRepresentation} = require("../deploy-lib");
const {ethers} = require("hardhat");

async function main() {
    const network = hre.network.name;
    const config = require("../configs/createRepresentations-config.json");
    const currentDeployment = require(`../deployments/deployWithBridgeV2-${network}.json`);

    const pathToResult = path.join(
        __dirname,
        `../deployments/createRepresentations-${network}.json`
    );

    let result = { tokens: [] };
    if (fs.existsSync(pathToResult)) {
        result = require(pathToResult);
    }
    console.log(result);

    const fabricAddress = currentDeployment.fabric.proxy;
    const originalTokens = config[network].originalTokens;

    for (let token of originalTokens) {
        let synthRepr = await getSynthRepresentation(fabricAddress, token.address, token.chainID);
        if (synthRepr === ethers.constants.AddressZero) {
            synthRepr = await library.createRepresentation(
                fabricAddress,
                token.address,
                token.chainID,
                token.name,
                token.symbol,
                token.decimals
            );
            console.log(token.name, synthRepr);

            result["tokens"].push({originalToken: token, synthRepr: synthRepr});
        }
        else {
            console.log(`Representation for ${token.address} already exists:`, synthRepr);
        }
    }

    let json = JSON.stringify(result, null, 4);
    fs.writeFileSync(
        pathToResult,
        json,
        "utf8"
    );
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
