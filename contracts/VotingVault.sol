// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import './libraries/TransferHelper.sol';
import './interfaces/IVotes.sol';


contract VotingVault {
  address public token;
  address public controller;

  constructor(address _token) {
    controller = msg.sender;
    token = _token;
  }

  modifier onlyController() {
    require(msg.sender == controller);
    _;
  }

    /// @notice function to delegate the tokens of this address
    /// @dev if the delegatee is the existing delegate, skip the delegate function call - would be redundant
  function delegateTokens(address delegatee) external onlyController {
    address existingDelegate = IVotes(token).delegates(address(this));
    if (existingDelegate != delegatee) {
      uint256 balanceCheck = IERC20(token).balanceOf(address(this));
      IVotes(token).delegate(delegatee);
      // check to make sure delegate function is not malicious
      require(balanceCheck == IERC20(token).balanceOf(address(this)));
    }
  }

  function withdrawTokens(address to, uint256 amount) external onlyController {
    TransferHelper.withdrawTokens(IERC20(token), to, amount);
  }

  function stakeTokens(address stakingContract, address beneficiary, uint256 amount) external onlyController {
    TransferHelper.stakeTokens(IERC20(token), stakingContract, beneficiary, amount);
  }
}
