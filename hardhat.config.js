require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@openzeppelin/hardhat-upgrades");
require('solidity-coverage');
require("hardhat-gas-reporter");
require("dotenv").config();

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const INFURA_API_KEY = process.env.INFURA_API_KEY || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const SCAN_API_KEY = process.env.SCAN_API_KEY || "";

module.exports = {
    solidity: {
        compilers: [{
                version: "0.8.8",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 2000,
                    },
                },
            },
            {
                version: "0.5.16",
                settings: {},
            },
            {
                version: "0.6.6",
                settings: {},
            },
        ],
        overrides: {
            "contracts/test/unidex-periphery/UniswapV2Router02.sol": {
                version: "0.6.6",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000,
                    },
                },
            },
        }
    },
    networks: {
        boba_bnb: {
            url: `https://bnb.boba.network/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        boba_eth: {
            url: `https://mainnet.boba.network/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        boba_avax: {
            url: `https://avax.boba.network/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        eth: {
            url: `https://rpc.symbiosis.finance/1`,
            // url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`],
        },
        bsc: {
            url: `https://rpc.symbiosis.finance/56`,
            // url: `https://speedy-nodes-nyc.moralis.io/${MORALIS_API_KEY}/bsc/mainnet`,
            accounts: [`${PRIVATE_KEY}`],
        },
        avalanche: {
            url: `https://rpc.symbiosis.finance/43114`,
            // url: `https://speedy-nodes-nyc.moralis.io/${MORALIS_API_KEY}/avalanche/mainnet`,
            accounts: [`${PRIVATE_KEY}`],
        },
        kava: {
            url: `https://evm.kava.io/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        polygon: {
            url: `https://rpc.symbiosis.finance/137`,
            // url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`],
        },
        telos: {
            url: "https://mainnet.telos.net/evm",
            accounts: [`${PRIVATE_KEY}`],
        },
        rinkeby: {
            url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`],
        },
        sepolia: {
            url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`]
        },
        bsct: {
            url: `http://data-seed-prebsc-1-s2.binance.org:8545/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        fuji: {
            url: `https://api.avax-test.network/ext/bc/C/rpc`,
            accounts: [`${PRIVATE_KEY}`],
        },
        mumbai: {
            url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`],
        },
        heco: {
            url: `https://http-testnet.hecochain.com/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        okex: {
            url: `https://exchaintestrpc.okex.org`,
            accounts: [`${PRIVATE_KEY}`],
        },
        hardhat: {
            gas: 10000000000,
            blockGasLimit: 10000000000,
            // gasLimit: 300000000
        },
        fork: {
            url: `http://127.0.0.1:8545/`,
        },
    },
    etherscan: {
        // apiKey: SCAN_API_KEY,
        apiKey: {
            'boba_eth': SCAN_API_KEY,
            'bsc': SCAN_API_KEY,
            'boba_avax': 'NO_KEY_REQUIRED',
            'boba_bnb': 'NO_KEY_REQUIRED',
            'kava': 'NO_KEY_REQUIRED',
            'sepolia': SCAN_API_KEY
        },
        customChains: [
            {
                network: 'boba_eth',
                chainId: 288,
                urls: {
                    apiURL: 'https://api.bobascan.com/api',
                    browserURL: 'https://bobascan.com',
                },
            },
            {
                network: 'boba_avax',
                chainId: 43288,
                urls: {
                    apiURL: 'https://blockexplorer.avax.boba.network/api',
                    browserURL: 'https://blockexplorer.avax.boba.network/',
                },
            },
            {
                network: 'boba_bnb',
                chainId: 56288,
                urls: {
                    apiURL: 'https://blockexplorer.bnb.boba.network/api',
                    browserURL: 'https://blockexplorer.bnb.boba.network/',
                },
            },
            {
                network: 'kava',
                chainId: 2222,
                urls: {
                    apiURL: 'https://explorer.kava.io/api',
                    browserURL: 'https://explorer.kava.io',
                },
            },
        ],
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
    },
    docgen: {
        path: "./docs-docgen",
        clear: true,
        runOnCompile: true,
    },
    mocha: {
        timeout: 100000
    },
    gasReporter: {
        enabled: !!(process.env.REPORT_GAS)
    }
};
