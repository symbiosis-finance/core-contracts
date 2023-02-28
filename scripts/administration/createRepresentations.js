const library = require("../deploy-lib");
const fs = require("fs");
const path = require("path");

async function main() {
    const network = hre.network.name;
    const config = require("../configs/createRepresentations-config.json");
    const currentDeployment = require(`../deployments/deployWithBridgeV2-${network}.json`);

    let result = { tokens: [] };

    const fabricAddress = currentDeployment.fabric.proxy;
    const originalTokens = config[network].originalTokens;
    let syntRepr;

    for (let token of originalTokens) {
        syntRepr = await library.createRepresentation(
            fabricAddress,
            token.address,
            token.chainID,
            token.name,
            token.symbol,
            token.decimals
        );
        console.log(token.name, syntRepr);

        result["tokens"].push({ originalToken: token, syntRepr: syntRepr });
    }

    let json = JSON.stringify(result, null, 4);
    fs.writeFileSync(
        path.join(
            __dirname,
            `../deployments/createRepresentations-${network}.json`
        ),
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
