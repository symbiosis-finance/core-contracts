npx hardhat clean

# deploy ERC20
npx hardhat run scripts/test/deployTokens.js --network fork

# check deployWithBridgeV2
npx hardhat run scripts/deploy/deployWithBridgeV2.js --network fork

# check createRepresentation
npx hardhat run scripts/administration/createRepresentations.js --network fork

# check changeMPC
npx hardhat run scripts/administration/changeMPC.js --network fork

# check setAdminOnBridgeV2
npx hardhat run scripts/administration/setAdminOnBridgeV2.js --network fork

# setThreshold
npx hardhat run scripts/administration/setThreshold.js --network fork

# updateMetaRouter
npx hardhat run scripts/administration/updateMetaRouter.js --network fork

# upgrade
npx hardhat run scripts/administration/upgrade.js --network fork
