// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import './libraries/TransferHelper.sol';
import './interfaces/IVotes.sol';

/// @title VotingVault
/// this contract is used to hold tokens outside and segregated from the main escrow contract for native ERC20Votes support
/// Tokens in here are controlled by the SingleTokenStaking contract only - but the onwer of the NFT dictates where tokens are delegated
/// and when they are withdrawn or or staked
contract VotingVault {
  /// @notice token is the address of the token
  address public token;
  /// @notice controller is the address of the SingleTokenStaking contract
  address public controller;

  /// @notice constructor to set the token and the controller
  /// @param _token the address of the token
  /// the msg.sender is set as the controller - the SingleTokenStaking contracts
  constructor(address _token) {
    controller = msg.sender;
    token = _token;
  }

  modifier onlyController() {
    require(msg.sender == controller);
    _;
  }

  /// @notice function to delegate the tokens of this address
  /// @param delegatee the address to delegate to
  function delegateTokens(address delegatee) external onlyController {
    address existingDelegate = IVotes(token).delegates(address(this));
    if (existingDelegate != delegatee) {
      uint256 balanceCheck = IERC20(token).balanceOf(address(this));
      IVotes(token).delegate(delegatee);
      // check to make sure delegate function is not malicious
      require(balanceCheck == IERC20(token).balanceOf(address(this)));
    }
  }

  /// @notice function to withdraw tokens from this address
  /// @dev only can be called by the Controller - the SingleTokenStaking contract
  /// this function with transfer tokens directly from this contract to the beneficiary
  function withdrawTokens(address to, uint256 amount) external onlyController {
    TransferHelper.withdrawTokens(IERC20(token), to, amount);
  }

  /// @notice function to withdraw and stake tokens from this address
  /// @param stakingContract the address of the staking contract
  /// @param beneficiary the address of the beneficiary
  /// @param amount the amount of tokens to withdraw and staked
  /// @dev only can be called by the Controller - the SingleTokenStaking contract
  // this first has to create a deposit for delegatee to get / create the delegate depositId
  /// this function uses the transfer helper library, which is designed to work with the UnisTaker / Tally Liquid Staking contract specifically
  /// it will stake the tokens, which this contract then receives the staked tokens; then it will transfer the staked tokens to the beneficiary
  function withdrawAndStake(
    address stakingContract,
    address beneficiary,
    uint256 amount,
    uint256 nonce,
    uint256 deadline,
    bytes memory signature
  ) external onlyController {
    address delegatee = IVotes(token).delegates(address(this));
    // if the delegatee is set to 0 address or the default delegatee, we don't need to initialize or update deposit on behalf
    if (delegatee == address(0) || delegatee == IStaking(stakingContract).defaultDelegatee()) {
      stakeTokens(IERC20(token), stakingContract, beneficiary, amount);
    } else {
      uint256 depositId = IStaking(stakingContract).fetchOrInitializeDepositForDelegatee(delegatee);
      stakeTokens(IERC20(token), stakingContract, beneficiary, amount);
      IStaking(stakingContract).updateDepositOnBehalf(beneficiary, depositId, nonce, deadline, signature);
    }
  }

  /// @notice internal function for staking - this is specifically make for the Tally liquid staking contract
  /// @param _token is the ERC20 contract address that is being transferred
  /// @param _stakingContract is the address of the staking contract
  /// @param _beneficiary is the address of the recipient
  /// @param _amount is the amount of tokens that are being transferred
  /// @dev the amount of tokens staked is returned in the function, so mechanically this will stake tokens, then transfer them to the beneficiary, using the stake amount returned in the stake function
  function stakeTokens(
    IERC20 _token,
    address _stakingContract,
    address _beneficiary,
    uint256 _amount
  ) internal {
    _token.approve(_stakingContract, _amount);
    uint256 stakedAmount = IStaking(_stakingContract).stake(_amount);
    require(_token.allowance(address(this), _stakingContract) == 0, 'Allowance error');
    IStaking(_stakingContract).transfer(_beneficiary, stakedAmount);
  }
}
