// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "../synth-core/interfaces/IBridge.sol";


import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract TonBridge is OwnableUpgradeable {
    struct TonAddress {
        int8 workchain;
        bytes32 address_hash;
    }

    /// ** PUBLIC states **

    address public tonBridge;
    address public symbiosisBridge;
    uint256 public bridgeChainId;
    address public broadcaster;

    /// ** EVENTS **

    event ChangeBridgeChainId(uint256 newBridgeChainId);

    event ChangeTonBridge(address newBridge);

    event ChangeSymbiosisBridge(address newBridge);

    event ChangeBroadcaster(address newBroadcaster);

    /// ** INITIALIZER **

    function initialize(address _tonBridge, address _symbiosisBridge, uint256 _bridgeChainId, address _broadcaster) public virtual initializer {
        require(_tonBridge != address(0), "tonBridge cannot be 0");
        require(_symbiosisBridge != address(0), "bridge cannot be 0");
        require(_broadcaster != address(0), "broadcaster cannot be 0");
        require(_bridgeChainId != 0, "chainId cannot be 0");

        __Ownable_init();

        tonBridge = _tonBridge;
        symbiosisBridge = _symbiosisBridge;
        bridgeChainId = _bridgeChainId;
        broadcaster = _broadcaster;
    }

    /// ** TRANSMITTER functions **

    /**
     * @notice transmits request
     */
    function callBridgeRequest(
        uint256 _amount,
        TonAddress memory _tonAddress
    ) public {
        TransferHelper.safeTransferFrom(tonBridge, _msgSender(), broadcaster, _amount);
        bytes memory calldata_ = abi.encodeWithSignature("burn(uint256,(int8,bytes32))",
            _amount, _tonAddress);
        IBridge(symbiosisBridge).transmitRequestV2(
            calldata_,
            tonBridge,
            tonBridge,
            bridgeChainId
        );
    }

    /// ** OWNER functions **

    /**
     * @notice Changes Bridge Chain Id by owner
     */
    function changeBridgeChainId(uint256 _newBridgeChainId) external onlyOwner {
        require(_newBridgeChainId != 0, "chainId cannot be 0");
        bridgeChainId = _newBridgeChainId;
        emit ChangeBridgeChainId(_newBridgeChainId);
    }

    /**
     * @notice Changes TON Bridge by owner
     */
    function changeTonBridge(address _newTonBridge) external onlyOwner {
        require(_newTonBridge != address(0),  "tonBridge cannot be 0");
        tonBridge = _newTonBridge;
        emit ChangeTonBridge(_newTonBridge);
    }

    /**
     * @notice Changes Symbiosis Bridge by owner
     */
    function changeSymbiosisBridge(address _newSymbiosisBridge) external onlyOwner {
        require(_newSymbiosisBridge != address(0), "bridge cannot be 0");
        symbiosisBridge = _newSymbiosisBridge;
        emit ChangeSymbiosisBridge(_newSymbiosisBridge);
    }

    /**
     * @notice Changes Broadcaster by owner
     */
    function changeBroadcaster(address _newBroadcaster) external onlyOwner {

        require(_newBroadcaster != address(0), "broadcaster cannot be 0");
        broadcaster = _newBroadcaster;
        emit ChangeBroadcaster(_newBroadcaster);
    }

    function renounceOwnership() public override onlyOwner {
        revert("Not Allowed");
    }
}