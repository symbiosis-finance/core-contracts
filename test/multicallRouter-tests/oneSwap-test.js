const {expect} = require("chai");
const {ethers} = require("hardhat");
const {swapInterface, linkBytecode} = require("../utils");
const wethAbi = require("../abi/WETH9.json");
const uniFactoryV2Abi = require("../abi/UniswapV2Factory.json");
const uniV2Abi = require("../abi/UniswapV2Router02.json");
const ERC20Abi = require("../abi/ERC20Mock.json");
const mathUtilsAbi = require("../abi/MathUtils.json");
const swapUtilsAbi = require("../abi/SwapUtils.json");
const swapAbi = require("../abi/Swap.json");

async function getContractFactory(name) {
    return await ethers.getContractFactory(name);
}

const stableSwapInterface = new ethers.utils.Interface(["function swap(uint8,uint8,uint256,uint256,uint256)"]);

let firstToken,
    secondToken,
    weth,
    stableDex,
    uniFactory,
    uniRouter,
    owner,
    recipient,
    sender,
    liquidityProvider,
    multicallRouter;

describe("MulticallRouter tests", function () {
    beforeEach(async () => {
        [owner, recipient, sender, liquidityProvider] = await ethers.getSigners();

        console.log("Owner account:", owner.address);

        const ERC20Abi = require("../abi/ERC20Mock.json");
        const ERC20 = await ethers.getContractFactory(ERC20Abi.abi, ERC20Abi.bytecode);
        const MulticallRouter = await getContractFactory("MulticallRouter");

        firstToken = await ERC20.deploy("First Token", "FIRST", 18);
        secondToken = await ERC20.deploy("Second Token", "SECOND", 18);
        const wethAbi = require('../abi/WETH9.json');
        const WETH = await ethers.getContractFactory(wethAbi.abi, wethAbi.bytecode);
        weth = await WETH.deploy();

        multicallRouter = await MulticallRouter.deploy();

        const uniFactoryV2Abi = require('../abi/UniswapV2Factory.json');
        const uniV2Abi = require('../abi/UniswapV2Router02.json');

        const UniswapV2Factory = await ethers.getContractFactory(uniFactoryV2Abi.abi, uniFactoryV2Abi.bytecode);
        const UniswapV2Router02 = await ethers.getContractFactory(uniV2Abi.abi, uniV2Abi.bytecode);

        // deploy uniswapRouter
        uniFactory = await UniswapV2Factory.deploy(owner.address);

        uniRouter = await UniswapV2Router02.deploy(
            uniFactory.address,
            weth.address
        );

        console.log("Deploy tokens.");

        const mathUtilsAbi = require('../abi/MathUtils.json');
        const swapUtilsAbi = require('../abi/SwapUtils.json');
        const swapAbi = require('../abi/Swap.json');
        const MathUtils = await ethers.getContractFactory(mathUtilsAbi.abi, mathUtilsAbi.bytecode);

        const mathUtils = await MathUtils.deploy();

        const swapUtilsLinkedBytecode = linkBytecode(swapUtilsAbi, {'MathUtils': mathUtils.address});
        const SwapUtils = await ethers.getContractFactory(swapUtilsAbi.abi, swapUtilsLinkedBytecode);

        swapUtils = await SwapUtils.deploy();

        const stableDexLinkedBytecode = linkBytecode(swapAbi, {'SwapUtils': swapUtils.address});
        const StableDex = await ethers.getContractFactory(swapAbi.abi, stableDexLinkedBytecode);

        stableDex = await StableDex.deploy(
            [firstToken.address, secondToken.address],
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

        // approves for stableRouter
        await firstToken
            .connect(sender)
            .approve(multicallRouter.address, ethers.constants.MaxUint256);

        // mint tokens
        await firstToken.mint(sender.address, String(10000));
        expect(await firstToken.balanceOf(sender.address)).to.eq(String(10000));

        const LIQUIDITY_PROVIDER_BALANCE = 200000;
        await firstToken.mint(liquidityProvider.address, String(LIQUIDITY_PROVIDER_BALANCE));
        await secondToken.mint(liquidityProvider.address, String(LIQUIDITY_PROVIDER_BALANCE));

        expect(await firstToken.balanceOf(liquidityProvider.address)).to.eq(String(LIQUIDITY_PROVIDER_BALANCE));
        expect(await secondToken.balanceOf(liquidityProvider.address)).to.eq(String(LIQUIDITY_PROVIDER_BALANCE));

        console.log("All required tokens minted");

        await firstToken.connect(liquidityProvider).approve(stableDex.address, ethers.constants.MaxUint256);
        await secondToken.connect(liquidityProvider).approve(stableDex.address, ethers.constants.MaxUint256);

        await stableDex
            .connect(liquidityProvider)
            .addLiquidity(
                [LIQUIDITY_PROVIDER_BALANCE/2, LIQUIDITY_PROVIDER_BALANCE/2],
                0,
                ethers.constants.MaxUint256
            );

        expect(await firstToken.balanceOf(stableDex.address)).to.eq(LIQUIDITY_PROVIDER_BALANCE/2);
        expect(await secondToken.balanceOf(stableDex.address)).to.eq(LIQUIDITY_PROVIDER_BALANCE/2);

        await firstToken.connect(liquidityProvider).approve(uniRouter.address, ethers.constants.MaxUint256);
        await secondToken.connect(liquidityProvider).approve(uniRouter.address, ethers.constants.MaxUint256);

        await uniRouter
            .connect(liquidityProvider)
            .addLiquidity(
                firstToken.address,
                secondToken.address,
                LIQUIDITY_PROVIDER_BALANCE/2,
                LIQUIDITY_PROVIDER_BALANCE/2,
                0,
                0,
                owner.address,
                ethers.constants.MaxUint256
            );

        let symbPair = await uniFactory.getPair(
            firstToken.address,
            secondToken.address
        );

        expect(await firstToken.balanceOf(symbPair)).to.eq(
            String(LIQUIDITY_PROVIDER_BALANCE/2)
        );
        expect(await secondToken.balanceOf(symbPair)).to.eq(String(LIQUIDITY_PROVIDER_BALANCE/2));

    });

    it("Should check 1 stable swap", async () => {
        let amountIn = 10000;

        let swapCalldata = stableSwapInterface.encodeFunctionData("swap", [
            0,
            1,
            0,
            0,
            ethers.constants.MaxUint256,
        ]);

        await multicallRouter.connect(sender).multicall(
            amountIn,
            [swapCalldata],
            [stableDex.address],
            [firstToken.address, secondToken.address],
            [100],
            recipient.address
        );

        let expectedBalance = 9971;

        console.log(
            "Final balance:",
            (await secondToken.balanceOf(recipient.address)).toString()
        );

        expect(await secondToken.balanceOf(recipient.address)).to.eq(
            expectedBalance
        );
    });

    it("Should check 1 uni swap", async () => {
        let amountIn = 10000;

        let swapCalldata = swapInterface.encodeFunctionData(
            "swapExactTokensForTokens",
            [
                amountIn,
                0,
                [firstToken.address, secondToken.address],
                recipient.address,
                ethers.constants.MaxUint256,
            ]
        );

        await multicallRouter.connect(sender).multicall(
            amountIn,
            [swapCalldata],
            [uniRouter.address],
            [firstToken.address, secondToken.address],
            [36],
            recipient.address
        );

        let expectedBalance = 9066;

        console.log(
            "Final balance:",
            (await secondToken.balanceOf(recipient.address)).toString()
        );

        expect(await secondToken.balanceOf(recipient.address)).to.eq(
            expectedBalance
        );
    });
});