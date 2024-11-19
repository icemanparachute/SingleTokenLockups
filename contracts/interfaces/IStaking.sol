// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

interface IStaking {

    function stake(uint256 amount) external;
    function transfer(address _to, uint256 _value) external returns (bool);

}