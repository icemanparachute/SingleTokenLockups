// contract to handle the interaction between the delegated claim campaigns and the token lockups

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import './libraries/TransferHelper.sol';

interface ITokenLockups {
  function createLockupWithDelegation(
    address recipient,
    uint256 amount,
    uint256 rate,
    address delegatee
  ) external returns (uint256 tokenId);
  function token() external view returns (address);
}

contract ClaimHandler {
  uint256 internal _ids;
  ITokenLockups public tokenLockup;
  address public token;
  address public claimContract;

  struct Lockup {
    uint256 amount;
    uint256 rate;
    address delegatee;
  }

  mapping(uint256 => Lockup) public lockups;

  constructor(address _token) {
    tokenLockup = ITokenLockups(msg.sender);
    token = _token;
  }

  modifier onlyClaimContract() {
    require(msg.sender == claimContract, '!ClaimContract');
    _;
  }

  function setClaimContract(address _claimContract) external {
    require(msg.sender == address(tokenLockup));
    require(claimContract == address(0x0), 'already set');
    claimContract = _claimContract;
  }

  /// @notice function to increment the tokenId counter, and returns the current tokenId after inrecmenting
  function _incrementId() internal returns (uint256) {
    _ids++;
    return _ids;
  }
  /// @notice function to get the current running total of tokenId, useful for when totalSupply does not match
  function currentId() public view returns (uint256) {
    return _ids;
  }

  // function that creates a temporary lockup plan
  function createPlan(
    address claims,
    address token,
    uint256 claimAmount,
    uint256 start,
    uint256 cliff,
    uint256 rate,
    uint256 period
  ) external onlyClaimContract returns (uint256 id) {
    id = _incrementId();
    TransferHelper.transferTokens(IERC20(token), msg.sender, address(this), claimAmount);
    lockups[id] = Lockup(claimAmount, rate, address(0x0));
  }

  function delegate(uint256 id, address delegatee) external onlyClaimContract {
    lockups[id].delegatee = delegatee;
  }

  function safeTransferFrom(address claims, address claimer, uint256 id) external onlyClaimContract {
    Lockup memory lockup = lockups[id];
    IERC20(token).approve(address(tokenLockup), lockup.amount);
    tokenLockup.createLockupWithDelegation(claimer, lockup.amount, lockup.rate, lockup.delegatee);
    delete lockups[id];
  }
}
