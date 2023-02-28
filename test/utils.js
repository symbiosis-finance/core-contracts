const {ethers, upgrades} = require("hardhat");
const {expect} = require("chai");
const wethAbi = require("./abi/WETH9.json");
const mathUtilsAbi = require("./abi/MathUtils.json");
const uniFactoryV2Abi = require("./abi/UniswapV2Factory.json");
const uniV2Abi = require("./abi/UniswapV2Router02.json");
const swapUtilsAbi = require("./abi/SwapUtils.json");
const swapAbi = require("./abi/Swap.json");
const ERC20Abi = require("./abi/ERC20Mock.json");

const hardhatChainID = 31337;
const abiCoder = ethers.utils.defaultAbiCoder;
const trustedForwarder = ethers.constants.AddressZero;

const oracleRequestTopic = ethers.utils.id(
    "OracleRequest(address,bytes,address,address,uint256)"
);

// code for linking libraries from https://ethereum.stackexchange.com/questions/85061/hardhat-error-unresolved-libraries-but-why/85110
function linkBytecode(artifact, libraries) {
    let bytecode = artifact.bytecode;

    for (const [fileName, fileReferences] of Object.entries(
        artifact.linkReferences
    )) {
        for (const [libName, fixups] of Object.entries(fileReferences)) {
            const addr = libraries[libName];
            if (addr === undefined) {
                continue;
            }

            for (const fixup of fixups) {
                bytecode =
                    bytecode.substr(0, 2 + fixup.start * 2) +
                    addr.substr(2) +
                    bytecode.substr(2 + (fixup.start + fixup.length) * 2);
            }
        }
    }

    return bytecode;
}

async function deploySynthContracts(owner, portalWhitelistToken1, portalWhitelistToken2) {
    const WETH = await ethers.getContractFactory(wethAbi.abi, wethAbi.bytecode);
    const Bridge = await ethers.getContractFactory("BridgeV2");
    const Portal = await ethers.getContractFactory("Portal");
    const Synthesis = await ethers.getContractFactory("Synthesis");
    const MetaRouter = await ethers.getContractFactory("MetaRouter");

    console.log("Get factories for contracts.");

    weth = await WETH.deploy();
    metaRouter = await MetaRouter.deploy();

    // deploy bridge, portal, synthesis and fabric
    bridge1 = await upgrades.deployProxy(Bridge, [owner.address]);
    bridge2 = await upgrades.deployProxy(Bridge, [owner.address]);
    bridge3 = await upgrades.deployProxy(Bridge, [owner.address]);
    bridge4 = await upgrades.deployProxy(Bridge, [owner.address]);

    portal1 = await upgrades.deployProxy(Portal, [
        bridge1.address,
        trustedForwarder,
        weth.address,
        portalWhitelistToken1,
        metaRouter.address
    ]);

    portal2 = await upgrades.deployProxy(Portal, [
        bridge3.address,
        trustedForwarder,
        weth.address,
        portalWhitelistToken2,
        metaRouter.address
    ]);

    synthesis = await upgrades.deployProxy(Synthesis, [
        bridge2.address,
        trustedForwarder,
        metaRouter.address
    ]);

    await bridge1.setTransmitterStatus(portal1.address, true);
    await bridge3.setTransmitterStatus(portal2.address, true);
    await bridge2.setTransmitterStatus(synthesis.address, true);

    return [weth, bridge1, bridge2, bridge3, portal1, portal2, synthesis, metaRouter];
}

async function createSyntRepr(token1, token2, synthesis1, synthesis2) {
    const Fabric = await ethers.getContractFactory("SyntFabric");
    const STestToken = await ethers.getContractFactory("SyntERC20");

    synthFabric1 = await upgrades.deployProxy(Fabric, [synthesis1.address]);
    await synthesis1.setFabric(synthFabric1.address);
    // create synt representation of token
    await synthFabric1.createRepresentationByAdmin(
        token1.address,
        hardhatChainID,
        "sTT",
        "sTT",
        18
    );

    let syntKey1 = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [token1.address, hardhatChainID]
    );
    sTestTokenAddr1 = await synthFabric1.getSyntRepresentationByKey(syntKey1);
    sTestToken1 = await STestToken.attach(sTestTokenAddr1);

    if (synthesis1.address !== synthesis2.address) {
        synthFabric2 = await upgrades.deployProxy(Fabric, [synthesis2.address]);
        await synthesis2.setFabric(synthFabric2.address);
    } else {
        synthFabric2 = synthFabric1;
    }

    // create synt representation of token
    await synthFabric2.createRepresentationByAdmin(
        token2.address,
        hardhatChainID,
        "sTT",
        "sTT",
        18
    );

    let syntKey2 = ethers.utils.solidityKeccak256(
        ["address", "uint256"],
        [token2.address, hardhatChainID]
    );
    sTestTokenAddr2 = await synthFabric2.getSyntRepresentationByKey(syntKey2);
    sTestToken2 = await STestToken.attach(sTestTokenAddr2);

    console.log("Create synt representations for tokens.");
    return [
        sTestTokenAddr1,
        sTestToken1,
        sTestTokenAddr2,
        sTestToken2
    ]
}

async function deployDexes(owner, stableDexTokens, weth) {
    const SymbiosisV2Factory = await ethers.getContractFactory(uniFactoryV2Abi.abi, uniFactoryV2Abi.bytecode);
    const SymbiosisV2Router02 = await ethers.getContractFactory(uniV2Abi.abi, uniV2Abi.bytecode);
    const MathUtils = await ethers.getContractFactory(mathUtilsAbi.abi, mathUtilsAbi.bytecode);

    const mathUtils = await MathUtils.deploy();

    const swapUtilsLinkedBytecode = linkBytecode(swapUtilsAbi, {'MathUtils': mathUtils.address});
    const SwapUtils = await ethers.getContractFactory(swapUtilsAbi.abi, swapUtilsLinkedBytecode);

    let swapUtils = await SwapUtils.deploy();

    const stableDexLinkedBytecode = linkBytecode(swapAbi, {'SwapUtils': swapUtils.address});
    const StableDex = await ethers.getContractFactory(swapAbi.abi, stableDexLinkedBytecode);

    stableDex = await StableDex.deploy(
        stableDexTokens,
        [18, 18],
        "Symbiosis STBL pool",
        "SymbPool",
        50,
        1e7,
        0,
        0,
        0,
        owner.address
    );

    console.log("Stable dex deployed.");

    // deploy symbDex
    symbFactory = await SymbiosisV2Factory.deploy(owner.address);

    symbDex = await SymbiosisV2Router02.deploy(
        symbFactory.address,
        weth.address
    );

    // deploy uniDex
    uniFactory = await SymbiosisV2Factory.deploy(owner.address);

    uniDex = await SymbiosisV2Router02.deploy(
        uniFactory.address,
        weth.address
    );

    return [symbFactory, symbDex, stableDex, uniFactory, uniDex];
}

async function deployTokensMetaRouterTest() {
    const ERC20 = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);
    const WETH = await ethers.getContractFactory(wethAbi.abi, wethAbi.bytecode);
    firstToken = await ERC20.deploy("First Token", "FIRST", 18); // first chain
    secondToken = await ERC20.deploy("Second Token", "SECOND", 18); // first chain
    thirdToken = await ERC20.deploy("Third Token", "THIRD", 18); //third chain
    weth = await WETH.deploy();

    console.log("Deploy tokens.");

    return [firstToken, secondToken, thirdToken, weth,]
}

async function deployContractsMetaRouterTest(owner, token1, token2) {
    [_, bridge1, bridge2, bridge3, portal1, portal2, synthesis, metaRouter] =
        await deploySynthContracts(owner, token1.address, token2.address);

    [sTestTokenAddr, sTestToken, sWethAddr, sweth] = await createSyntRepr(token1, token2, synthesis, synthesis);

    const StableRouter = await ethers.getContractFactory("MulticallRouter");
    stableRouter = await StableRouter.deploy();

    [symbFactory, symbDex, stableDex, uniFactory, uniDex] =
        await deployDexes(
            owner,
            [sTestTokenAddr, sweth.address],
            token2
        );

    return [bridge1, bridge2, bridge3, portal1, portal2, synthesis, metaRouter, sTestTokenAddr, sTestToken, sWethAddr, sweth, symbFactory, symbDex, stableDex, uniFactory, uniDex, stableRouter];
}

module.exports = {
    hardhatChainID: hardhatChainID,
    trustedForwarder: trustedForwarder,
    deployTokensMetaRouterTest: deployTokensMetaRouterTest,
    deployContractsMetaRouterTest: deployContractsMetaRouterTest,
    swapInterface: new ethers.utils.Interface([
        "function swap(uint8,uint8,uint256,uint256,uint256)",
        "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
        "function swapExactETHForTokens(uint256,address[],address,uint256)",
        "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)",
        "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256)",
    ]),
    burnInterface: new ethers.utils.Interface([
        "function metaBurnSyntheticToken((uint256,uint256,address,address,address,bytes,uint256,address,address,address,address,uint256,bytes32))",
    ]),
    synthInterface: new ethers.utils.Interface([
        "function metaSynthesize((uint256,uint256,address,address,address,address,address,uint256,address[],address,bytes,address,bytes,uint256,address,bytes32))",
    ]),
    middleSynthInterface: new ethers.utils.Interface([
        "function metaSynthesize((uint256,uint256,address,address,address,address,address,uint256,address[],address,bytes))",
    ]),
    stableSwapInterface: new ethers.utils.Interface([
        "function multicall(uint256,bytes[],address[],address[],uint256[],address)",
    ]),
    stableBridgingFee: 100,
    linkBytecode: linkBytecode,
    catchOracleRequest: async function (receiptSynt) {
        let oracleRequestSynt = receiptSynt.events.filter((x) => {
            return x.topics[0] === oracleRequestTopic;
        });
        return abiCoder.decode(
            ["address", "bytes", "address", "address", "uint256"],
            oracleRequestSynt[0].data
        );
    },

    createSyntRepr: createSyntRepr,
    deploySynthContracts: deploySynthContracts,

    deployDexes: deployDexes,
    addLiquidity: async function (
        owner,
        provider,
        symbDex,
        symbFactory,
        symbDexPairs,
        symbDexAmounts,
        stableDexTokens,
        stableDexAmounts,
        uniDex,
        uniFactory,
        uniDexPairs,
        uniDexAmounts
    ) {
        for (let i = 0; i < symbDexPairs.length; i++) {
            await symbDexPairs[i][0].connect(provider).approve(symbDex.address, symbDexAmounts[i][0]);
            await symbDexPairs[i][1].connect(provider).approve(symbDex.address, symbDexAmounts[i][1]);

            await symbDex
                .connect(provider)
                .addLiquidity(
                    symbDexPairs[i][0].address,
                    symbDexPairs[i][1].address,
                    symbDexAmounts[i][0].toString(),
                    symbDexAmounts[i][1].toString(),
                    0,
                    0,
                    owner.address,
                    ethers.constants.MaxUint256
                );

            let symbPair = await symbFactory.getPair(
                symbDexPairs[i][0].address,
                symbDexPairs[i][1].address
            );
            expect(await symbDexPairs[i][0].balanceOf(symbPair)).to.eq(
                String(symbDexAmounts[i][0])
            );
            expect(await symbDexPairs[i][1].balanceOf(symbPair)).to.eq(String(symbDexAmounts[i][0]));
        }

        for (let i = 0; i < uniDexPairs.length; i++) {
            await uniDexPairs[i][0].connect(provider).approve(uniDex.address, uniDexAmounts[i][0]);
            await uniDexPairs[i][1].connect(provider).approve(uniDex.address, uniDexAmounts[i][1]);

            await uniDex
                .connect(provider)
                .addLiquidity(
                    uniDexPairs[i][0].address,
                    uniDexPairs[i][1].address,
                    uniDexAmounts[i][0].toString(),
                    uniDexAmounts[i][1].toString(),
                    0,
                    0,
                    owner.address,
                    ethers.constants.MaxUint256
                );

            let uniPair = await uniFactory.getPair(
                uniDexPairs[i][0].address,
                uniDexPairs[i][1].address
            );

            expect(await uniDexPairs[i][0].balanceOf(uniPair)).to.eq(
                String(uniDexAmounts[i][0])
            );
            expect(await uniDexPairs[i][1].balanceOf(uniPair)).to.eq(String(uniDexAmounts[i][0]));
        }
        if (stableDexTokens.length != 0) {
            await stableDexTokens[0].connect(provider).approve(stableDex.address, stableDexAmounts[0]);
            await stableDexTokens[1].connect(provider).approve(stableDex.address, stableDexAmounts[1]);

            await stableDex
                .connect(provider)
                .addLiquidity(
                    stableDexAmounts,
                    0,
                    ethers.constants.MaxUint256
                );

            expect(await stableDexTokens[0].balanceOf(stableDex.address)).to.eq(
                String(stableDexAmounts[0])
            );
            expect(await stableDexTokens[1].balanceOf(stableDex.address)).to.eq(
                String(stableDexAmounts[1])
            );
        }

        console.log("Add liquidity.");
    },
    synthesize: async function (user, portal, amount, token, synthesis, bridge) {
        await token
            .connect(user)
            .approve(portal.address, amount);

        let clientId = ethers.utils.formatBytes32String("some client id");


        let txSynt = await portal
            .connect(user)
            .synthesize(
                this.stableBridgingFee,
                token.address,
                String(amount),
                user.address,
                synthesis.address,
                bridge.address,
                user.address,
                this.hardhatChainID,
                clientId
            );

        let receipt = await txSynt.wait();
        let oracleRequestArgs = await this.catchOracleRequest(receipt);

        let bytesSelector = oracleRequestArgs[1];
        let receiveSideSynt = oracleRequestArgs[2];

        await bridge.receiveRequestV2(bytesSelector, receiveSideSynt);
    },
    mintTokens: async function (user, tokensToMint, amounts, weth, wethAmount) {
        for (let i = 0; i < tokensToMint.length; i++) {
            await tokensToMint[i].mint(user.address, String(amounts[i]));

            expect(await tokensToMint[i].balanceOf(user.address)).to.eq(
                String(amounts[i])
            );
        }

        await weth.connect(user).deposit({value: String(wethAmount)});
    }
}
