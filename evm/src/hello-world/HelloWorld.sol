// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {IWormhole} from "../interfaces/IWormhole.sol";

contract HelloWorld {
    struct State {
        address wormhole;
    }

    State state;

    constructor(address wormhole_) {
        state.wormhole = wormhole_;
    }

    function wormhole() internal view returns (IWormhole) {
        return IWormhole(state.wormhole);
    }
}
