require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@openzeppelin/hardhat-upgrades");
require('solidity-coverage');
require("hardhat-gas-reporter");
require("dotenv").config();

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const SCAN_API_KEY = process.env.SCAN_API_KEY || "";

module.exports = {
    zksolc: {
        version: "1.3.13",
        compilerSource: "binary",
        settings: {},
    },
    solidity: {
        compilers: [{
                version: "0.8.7",
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
        zkMainnet: {
            url: "https://mainnet.era.zksync.io",
            accounts: [`${PRIVATE_KEY}`],
            ethNetwork: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
            zksync: true,
            verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification'
        },
        boba_bnb: {
            url: `https://bnb.boba.network/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        boba_eth: {
            url: `https://mainnet.boba.network/`,
            // url: 'https://lightning-replica.boba.network/',
            accounts: [`${PRIVATE_KEY}`],
            gasPrice: 7250000000,
            // blockGasLimit: 11000000,
        },
        boba_avax: {
            url: `https://avax.boba.network/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        eth: {
            // url: `https://rpc.symbiosis.finance/1`,
            url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`],
        },
        bsc: {
            url: `https://bsc-dataseed3.binance.org/`,
            // url: `https://speedy-nodes-nyc.moralis.io/${MORALIS_API_KEY}/bsc/mainnet`,
            accounts: [`${PRIVATE_KEY}`],
        },
        optimism: {
            url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`],
        },
        base: {
            url: `https://mainnet.base.org/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        metis: {
            url: `https://andromeda.metis.io/?owner=1088`,
            accounts: [`${PRIVATE_KEY}`],
        },
        zora: {
            url: `https://zora.rpc.thirdweb.com`,
            accounts: [`${PRIVATE_KEY}`],
            gas: 10000000,
            gasPrice: 2000000000,
        },
        avalanche: {
            // url: `https://rpc.symbiosis.finance/43114`,
            url: 'https://api.avax.network/ext/bc/C/rpc',
            accounts: [`${PRIVATE_KEY}`],
        },
        arb: {
            url: `https://arb1.arbitrum.io/rpc`,
            accounts: [`${PRIVATE_KEY}`],
        },
        kava: {
            url: `https://evm.kava.io/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        linea: {
            url: `https://linea-mainnet.infura.io/v3/40d9adf1363d40cc8c0e9e16e56cc008`,
            accounts: [`${PRIVATE_KEY}`],
        },
        mantle: {
            url: `https://rpc.mantle.xyz/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        manta: {
            url: `https://pacific-rpc.manta.network/http`,
            accounts: [`${PRIVATE_KEY}`],
        },
        polygon: {
            url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
            accounts: [`${PRIVATE_KEY}`],
        },
        polygon_zk_mainnet: {
            url: `https://zkevm-rpc.com`,
            accounts: [`${PRIVATE_KEY}`],
        },
        arb_nova: {
            url: `https://nova.arbitrum.io/rpc`,
            accounts: [`${PRIVATE_KEY}`],
        },
        scroll: {
            url: `https://mainnet-rpc.scroll.io/`,
            accounts: [`${PRIVATE_KEY}`],
        },
        zkMainnet: {
            url: "https://mainnet.era.zksync.io",
            accounts: [`${PRIVATE_KEY}`],
            ethNetwork: "https://eth-mainnet.g.alchemy.com/v2/j6tR9f7MdKYBMp-551iau0xuz0Eg8pcF",
            zksync: true,
            verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification'
        },
        telos: {
            url: "https://mainnet.telos.net/evm",

            accounts: [`${PRIVATE_KEY}`],
        },
        bsct: {
            url: `https://data-seed-prebsc-1-s1.binance.org:8545/`,
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
            mainnet: SCAN_API_KEY,
            'boba_eth': SCAN_API_KEY,
            'bsc': SCAN_API_KEY,
            arbitrumOne: SCAN_API_KEY,
            'boba_avax': 'NO_KEY_REQUIRED',
            'boba_bnb': 'NO_KEY_REQUIRED',
            'kava': 'NO_KEY_REQUIRED',
            'polygon_zk_mainnet': SCAN_API_KEY,
            optimisticEthereum: SCAN_API_KEY,
            avalanche: SCAN_API_KEY,
            'base': SCAN_API_KEY,
            polygon: SCAN_API_KEY,
            'linea': SCAN_API_KEY,
            'mantle': 'NO_KEY_REQUIRED',
            'arb_nova': SCAN_API_KEY,
            'scroll': SCAN_API_KEY,
            'manta': SCAN_API_KEY
        },
        customChains: [
            {
                network: 'linea',
                chainId: 59144,
                urls: {
                    apiURL: 'https://api.lineascan.build/api',
                    browserURL: 'https://lineascan.build/',
                },
            },
            {
                network: 'manta',
                chainId: 169,
                urls: {
                    apiURL: 'https://pacific-explorer.manta.network/api',
                    browserURL: 'https://pacific-explorer.manta.network/',
                },
            },
            {
                network: 'arb_nova',
                chainId: 42170,
                urls: {
                    apiURL: 'https://api-nova.arbiscan.io/api',
                    browserURL: 'https://nova.arbiscan.io',
                },
            },
            {
                network: 'scroll',
                chainId: 534352,
                urls: {
                    apiURL: 'https://blockscout.scroll.io/api',
                    browserURL: 'https://blockscout.scroll.io/',
                },
            },
            {
                network: "mantle",
                chainId: 5000,
                urls: {
                    apiURL: "https://api.routescan.io/v2/network/mainnet/evm/5000/etherscan",
                    browserURL: "https://mantlescan.info"
                }
            },
            {
                network: 'base',
                chainId: 8453,
                urls: {
                    apiURL: 'https://api.basescan.org/api',
                    browserURL: 'https://basescan.org',
                },
            },
            {
                network: 'boba_eth',
                chainId: 288,
                urls: {
                    apiURL: 'https://api.routescan.io/v2/network/mainnet/evm/288/etherscan',
                    browserURL: 'https://boba.routescan.io',
                },
            },
            {
                network: 'polygon_zk_mainnet',
                chainId: 1101,
                urls: {
                    apiURL: 'https://api-zkevm.polygonscan.com/api',
                    browserURL: 'https://zkevm.polygonscan.com',
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
                    apiURL: 'https://api.routescan.io/v2/network/mainnet/evm/56288/etherscan',
                    browserURL: 'https://bnb.bobascan.com',
                },
            },
            {
                network: 'kava',
                chainId: 2222,
                urls: {
                    apiURL: 'https://kavascan.com/api',
                    browserURL: 'https://kavascan.com',
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
        enabled: true
    }
};