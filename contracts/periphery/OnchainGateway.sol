// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract OnchainGateway {
    address public onchainSwap;

    modifier onlyOnchainSwap() {
        require(onchainSwap == msg.sender, "Symb: caller is not the onchainSwap");
        _;
    }

    constructor(address _onchainSwap) {
        onchainSwap = _onchainSwap;
    }

    function claimTokens(
        address _token,
        address _from,
        uint256 _amount
    ) external onlyOnchainSwap {
        SafeERC20.safeTransferFrom(IERC20(_token), _from, onchainSwap, _amount);
    }
}
