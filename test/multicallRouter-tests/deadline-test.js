const {expect} = require("chai");
const {ethers} = require("hardhat");
const ERC20Abi = require("../abi/ERC20Mock.json");
const mathUtilsAbi = require("../abi/MathUtils.json");
const {linkBytecode} = require("../utils");
const swapUtilsAbi = require("../abi/SwapUtils.json");
const swapAbi = require("../abi/Swap.json");

async function getContractFactory(name) {
    return await ethers.getContractFactory(name);
}

const swapInterface = new ethers.utils.Interface(["function swap(uint8,uint8,uint256,uint256,uint256)"]);

let firstToken,
    secondToken,
    thirdToken,
    stableDexFirst,
    stableDexSecond,
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
        thirdToken = await ERC20.deploy("Third Token", "THIRD", 18);

        multicallRouter = await MulticallRouter.deploy();

        console.log("Deploy tokens.");

        const mathUtilsAbi = require('../abi/MathUtils.json');
        const swapUtilsAbi = require('../abi/SwapUtils.json');
        const swapAbi = require('../abi/Swap.json');
        const MathUtils = await ethers.getContractFactory(mathUtilsAbi.abi, mathUtilsAbi.bytecode);

        let mathUtils = await MathUtils.deploy();

        let swapUtilsLinkedBytecode = linkBytecode(swapUtilsAbi, {'MathUtils': mathUtils.address});
        let SwapUtils = await ethers.getContractFactory(swapUtilsAbi.abi, swapUtilsLinkedBytecode);
        let swapUtils = await SwapUtils.deploy();

        let stableDexLinkedBytecode = linkBytecode(swapAbi, {'SwapUtils': swapUtils.address});
        let StableDex = await ethers.getContractFactory(swapAbi.abi, stableDexLinkedBytecode);

        stableDexFirst = await StableDex.deploy(
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

        mathUtils = await MathUtils.deploy();

        swapUtilsLinkedBytecode = linkBytecode(swapUtilsAbi, {'MathUtils': mathUtils.address});
        SwapUtils = await ethers.getContractFactory(swapUtilsAbi.abi, swapUtilsLinkedBytecode);
        swapUtils = await SwapUtils.deploy();

        stableDexLinkedBytecode = linkBytecode(swapAbi, {'SwapUtils': swapUtils.address});
        StableDex = await ethers.getContractFactory(swapAbi.abi, stableDexLinkedBytecode);

        stableDexSecond = await StableDex.deploy(
            [secondToken.address, thirdToken.address],
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

        const LIQUIDITY_PROVIDER_BALANCE = 100000;
        await firstToken.mint(liquidityProvider.address, String(LIQUIDITY_PROVIDER_BALANCE));
        await secondToken.mint(liquidityProvider.address, String(LIQUIDITY_PROVIDER_BALANCE * 2));
        await thirdToken.mint(liquidityProvider.address, String(LIQUIDITY_PROVIDER_BALANCE));

        expect(await firstToken.balanceOf(liquidityProvider.address)).to.eq(String(LIQUIDITY_PROVIDER_BALANCE));
        expect(await secondToken.balanceOf(liquidityProvider.address)).to.eq(String(LIQUIDITY_PROVIDER_BALANCE * 2));
        expect(await thirdToken.balanceOf(liquidityProvider.address)).to.eq(String(LIQUIDITY_PROVIDER_BALANCE));

        console.log("All required tokens minted");

        await firstToken.connect(liquidityProvider).approve(stableDexFirst.address, ethers.constants.MaxUint256);
        await secondToken.connect(liquidityProvider).approve(stableDexFirst.address, ethers.constants.MaxUint256);
        await secondToken.connect(liquidityProvider).approve(stableDexSecond.address, ethers.constants.MaxUint256);
        await thirdToken.connect(liquidityProvider).approve(stableDexSecond.address, ethers.constants.MaxUint256);

        await stableDexFirst
            .connect(liquidityProvider)
            .addLiquidity(
                [LIQUIDITY_PROVIDER_BALANCE, LIQUIDITY_PROVIDER_BALANCE],
                0,
                ethers.constants.MaxUint256
            );

        await stableDexSecond
            .connect(liquidityProvider)
            .addLiquidity(
                [LIQUIDITY_PROVIDER_BALANCE, LIQUIDITY_PROVIDER_BALANCE],
                0,
                ethers.constants.MaxUint256
            );

        expect(await firstToken.balanceOf(stableDexFirst.address)).to.eq(LIQUIDITY_PROVIDER_BALANCE);
        expect(await secondToken.balanceOf(stableDexFirst.address)).to.eq(LIQUIDITY_PROVIDER_BALANCE);

        expect(await secondToken.balanceOf(stableDexSecond.address)).to.eq(LIQUIDITY_PROVIDER_BALANCE);
        expect(await thirdToken.balanceOf(stableDexSecond.address)).to.eq(LIQUIDITY_PROVIDER_BALANCE);

    });

    it("Should check deadline fail on the second swap", async () => {
        let amountIn = 10000;

        let firstSwapCalldata = swapInterface.encodeFunctionData("swap", [
            0,
            1,
            0,
            0,
            ethers.constants.MaxUint256
        ]);

        let secondSwapCalldata = swapInterface.encodeFunctionData("swap", [
            0,
            1,
            0,
            0,
            "1646213494" // some timestamp from the past
        ]);

        let tx = multicallRouter.connect(sender).multicall(
            amountIn,
            [firstSwapCalldata, secondSwapCalldata],
            [stableDexFirst.address, stableDexSecond.address],
            [firstToken.address, secondToken.address, thirdToken.address],
            [100, 100],
            recipient.address
        );

        await expect(tx).to.be.revertedWith('Deadline not met');

        expect(await firstToken.balanceOf(sender.address)).to.eq(
            amountIn
        );
    });
});