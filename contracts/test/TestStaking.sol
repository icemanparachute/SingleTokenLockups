// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract TestStaking {
  IERC20 public token;

  mapping(address => uint256) public stakingBalances;

  constructor(address _token) {
    token = IERC20(_token);
  }

  function stake(uint256 _amount) external returns (uint256) {
    return _stake(msg.sender, _amount);
  }

  function transfer(address _to, uint256 _value) external returns (bool) {
    _transfer(msg.sender, _to, _value);
    return true;
  }

  function unstake(uint256 _amount) external returns (uint256) {
    return _unstake(msg.sender, _amount);
  }

  function _stake(address _from, uint256 _amount) internal returns (uint256) {
    require(token.transferFrom(_from, address(this), _amount), 'transferFrom failed');
    stakingBalances[_from] += _amount;
    return _amount;
  }

  function _transfer(address _from, address _to, uint256 _value) internal {
    require(stakingBalances[_from] >= _value, 'insufficient balance');
    stakingBalances[_from] -= _value;
    stakingBalances[_to] += _value;
  }

  function _unstake(address _to, uint256 _amount) internal returns (uint256) {
    require(stakingBalances[_to] >= _amount, 'insufficient balance');
    require(token.transfer(_to, _amount), 'transfer failed');
    return _amount;
  }

  function balanceOf(address _account) public view returns (uint256) {
    return stakingBalances[_account];
  }
}
