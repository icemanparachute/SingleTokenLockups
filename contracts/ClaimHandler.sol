// contract to handle the interaction between the delegated claim campaigns and the token lockups

// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import './libraries/TransferHelper.sol';
import './interfaces/ITokenLockups.sol';

/// @title ClaimHandler
/// @notice this is an adapter for the ClaimCampaigns.sol contract
/// the claim campaigns contract is designed for the Hedgey Voting Token Lockups, but this adapter makes the SingleTokenLockups able to interact with and receive locked token claims
/// This contract will temporarily store the delegation and amount values for a specific lockup, and then when the claim contract calls the safeTransferFrom function, it will create the lockup and delegate the tokens
/// This contract is ONLY meant to be used with the sepcific type of claim campaign, and if used inappropriately it could result in loss of funds and will revert
/// This contract is deployed when the SingleTokenLockups contract is deployed, not meant to be deployed separately on its own
/// @dev this contract needs to be whitelisted by the ClaimsCampaign contract after deployment
contract ClaimHandler {
  /// @notice the id counter for temporary storage of claim items
  uint256 internal _ids;
  /// @notice the token lockups contract
  ITokenLockups public tokenLockup;
  /// @notice the token address
  address public token;
  /// @notice the address of the claim contract
  address public claimContract;

  /// @notice the struct for the lockup that temporarily stores the amount, rate and delegatee
  /// @param amount the amount of tokens that have been claimed and will be locked
  /// @param rate the rate that the tokens will unlock and is used for calling the create function
  /// @param delegatee the address tokens are going to be delegated to and used upon creation and delegation
  struct Lockup {
    uint256 amount;
    uint256 rate;
    address delegatee;
  }

  /// @notice the mapping of the lockups to an id
  mapping(uint256 => Lockup) public lockups;

  /// @notice the constructor to set the token lockups contract and the token address
  /// @param _token the address of the token
  /// @dev the SingleTokenLockups contract is supposed to call this and thus the msg.sender is set as the tokenLockup contract
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

  /// @notice this is the function call that is first received from the ClaimCampaign contract
  /// this only takes in the claimAmount, and rate and stores those values in the lockup struct
  /// all other values are ignored as they are not needed for the SingleTokenLockups contract
  function createPlan(
    address claimer,
    address _token,
    uint256 claimAmount,
    uint256 start,
    uint256 cliff,
    uint256 rate,
    uint256 period
  ) external onlyClaimContract returns (uint256 id) {
    require(_token == token, 'wrong token');
    TransferHelper.transferTokens(IERC20(token), msg.sender, address(this), claimAmount);
    // if the claim contract address is sent - then its doing claim and delegate flow
    if (claimer == claimContract) {
      id = _incrementId();
      lockups[id] = Lockup(claimAmount, rate, address(0x0));
    } else {
      // if a different recipient address is sent in, then we just simply create the lockup without delegation
      IERC20(token).approve(address(tokenLockup), claimAmount);
      tokenLockup.createLockup(claimer, claimAmount, rate);
    }
    
  }

  /// @notice this function is called by the claim contract to delegate the tokens to the delegatee
  /// in this case we update the storage of the lockup with this delatee address, but no delegation actually occurs yet
  function delegate(uint256 id, address delegatee) external onlyClaimContract {
    lockups[id].delegatee = delegatee;
  }

  /// @notice this function is called by the claim contract, where it would generally have created a lockup and now transferred it to the beneficiary
  /// @dev this function takes the instruction from the claim contract as the final call and it will now actually create the lockup
  /// this contact is expected to already have all of the necessary information for creating the lockup stored in the lockup struct from the previous two function calls
  /// and now it approves the token spend to the lockup contract, and actually creates the lockup itself
  /// this will pull tokens from this address to the lockup contract, and then perform the delegation in the single contract call
  /// @dev the lockup is deleted afterwards
  function safeTransferFrom(address from, address claimer, uint256 id) external onlyClaimContract {
    Lockup memory lockup = lockups[id];
    IERC20(token).approve(address(tokenLockup), lockup.amount);
    tokenLockup.createLockupWithDelegation(claimer, lockup.amount, lockup.rate, lockup.delegatee);
    delete lockups[id];
  }
}
