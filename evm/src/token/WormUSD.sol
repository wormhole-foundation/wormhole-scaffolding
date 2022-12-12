// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.13;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WormUSD is ERC20 {
    uint8 decimals_;

    constructor(
        address mintToAddress,
        uint8 tokenDecimals_,
        uint256 supply
    ) ERC20("wormUSD", "WUSD"){
        decimals_ = tokenDecimals_;
        _mint(mintToAddress, supply*10**decimals_);
    }

    function decimals() public view override returns (uint8) {
        return decimals_;
    }
}
