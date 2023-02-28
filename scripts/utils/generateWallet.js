const Wallet = require("ethereumjs-wallet").default;

async function main() {
  const wallet = Wallet.generate();
  console.log("privateKey: " + wallet.getPrivateKeyString());
  console.log("address: " + wallet.getAddressString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
