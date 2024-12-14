// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

interface IStaking {
  function defaultDelegatee() external view returns (address);
  function stake(uint256 amount) external returns (uint256);
  function stakeAndDelegate(uint256 amount, address delegatee) external returns (uint256);
  function transfer(address _to, uint256 _value) external returns (bool);
  function unstake(uint256 _amount) external returns (uint256);
  function fetchOrInitializeDepositForDelegatee(address _delegatee) external returns (uint256);
  function updateDepositOnBehalf(
    address _account,
    uint256 _newDepositId,
    uint256 _nonce,
    uint256 _deadline,
    bytes memory _signature
  ) external;
}
