// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';

import './VotingVault.sol';
import './ClaimHandler.sol';

import './libraries/TimelockLibrary.sol';
import './libraries/TransferHelper.sol';

contract SingleTokenLockups is ERC721Enumerable {
  /**EVENTS ************************************************************************************************************************/

  event LockupCreated(uint256 tokenId, address recipient, uint256 amount, uint256 rate);
  event LockupDelegated(uint256 tokenId, address delegatee, address votingVault);
  event TokensUnlocked(uint256 tokenId, uint256 unlockedAmount, uint256 remainingAmount, uint256 resetTime);
  event TokensStaked(uint256 tokenId, uint256 stakeAmount, address beneficiary);

  event StartAndCliffSet(uint256 start, uint256 cliff);
  event TransferabilityChanged(bool transferable);
  event AdminChanged(address admin);
  event ClaimContractSet(address claimContract);
  event StakingContractSet(address stakingContract);

  /******GLOBAL VARIABLES********************************************************************************************************** */

  uint256 internal _tokenIds;
  address public token;
  address public admin;
  address public stakingContract;
  address public claimContract;
  ClaimHandler public claimHandler;

  bool public transferable;

  // lockup details
  uint256 public start;
  uint256 public cliff;
  uint256 public period;

  struct Lockup {
    uint256 amount;
    uint256 rate;
    uint256 resetTime;
  }

  mapping(uint256 => Lockup) public lockups;
  mapping(uint256 => address) public votingVaults;

  /******CONSTRUCTOR************************************************************************ **********************************/

  constructor(
    address _token,
    address _admin,
    bool _transferable,
    uint256 _start,
    uint256 _cliff,
    uint256 _period,
    string memory _name,
    string memory _symbol
  ) ERC721(_name, _symbol) {
    require(_admin != address(0), 'Admin cannot be 0 address');
    require(_period > 0, 'Period cannot be 0');
    require((_start > 0 && _cliff >= _start) || (_start == 0 && _cliff == 0), 'Start and cliff must be set together');
    token = _token;
    admin = _admin;
    transferable = _transferable;
    start = _start;
    cliff = _cliff;
    period = _period;
    claimHandler = new ClaimHandler(_token);
  }

  /******MODIFIERS******************************************************************************************************* */

  modifier onlyAdmin() {
    require(msg.sender == admin, '!NotAdmin');
    _;
  }

  modifier onlyOwner(uint256 tokenId) {
    require(ownerOf(tokenId) == msg.sender, '!NotOwner');
    _;
  }

  /******BASIC NFT TOKEN FUNCTIONS************************************************************************ *********************/

  function _incrementTokenId() internal returns (uint256) {
    _tokenIds++;
    return _tokenIds;
  }
  /// @notice function to get the current running total of tokenId, useful for when totalSupply does not match
  function currentTokenId() public view returns (uint256) {
    return _tokenIds;
  }

  function balanceOfLockup(
    uint256 tokenId,
    uint256 timestamp
  ) public view returns (uint256 unlockedBalance, uint256 lockedBalance, uint256 unlockTime) {
    require(startCliffSet(), 'Start and cliff not set');
    Lockup memory lock = lockups[tokenId];
    (unlockedBalance, lockedBalance, unlockTime) = TimelockLibrary.balanceAtTime(
      start,
      cliff,
      lock.amount,
      lock.rate,
      period,
      timestamp
    );
  }

  /****EXTERNAL CREATE METHODS**********************************************************************************************************/

  function createLockup(address recipient, uint256 amount, uint256 rate) external returns (uint256 tokenId) {
    // pull tokens from sender into contract
    tokenId = _createLockup(recipient, amount, rate);
  }

  function createLockups(
    address[] memory recipients,
    uint256[] memory amounts,
    uint256[] memory rates
  ) external returns (uint256[] memory tokenIds) {
    require(recipients.length == amounts.length && amounts.length == rates.length, 'Array lengths must match');
    tokenIds = new uint256[](recipients.length);
    for (uint256 i = 0; i < recipients.length; i++) {
      tokenIds[i] = _createLockup(recipients[i], amounts[i], rates[i]);
    }
  }

  function createLockupWithDelegation(
    address recipient,
    uint256 amount,
    uint256 rate,
    address delegatee
  ) external returns (uint256 tokenId, address vault) {
    tokenId = _createLockup(recipient, amount, rate);
    vault = _delegate(tokenId, delegatee);
  }

  function createLockupsWithDelegation(
    address[] memory recipients,
    uint256[] memory amounts,
    uint256[] memory rates,
    address[] memory delegatees
  ) external returns (uint256[] memory tokenIds, address[] memory vaults) {
    require(
      recipients.length == amounts.length && amounts.length == rates.length && rates.length == delegatees.length,
      'Array lengths must match'
    );
    tokenIds = new uint256[](recipients.length);
    vaults = new address[](recipients.length);
    for (uint256 i = 0; i < recipients.length; i++) {
      tokenIds[i] = _createLockup(recipients[i], amounts[i], rates[i]);
      vaults[i] = _delegate(tokenIds[i], delegatees[i]);
    }
  }

  /******EXTERNAL NFT OWNER METHODS********************************************************************************************** */

  function unlock(uint256 tokenId) external onlyOwner(tokenId) {
    (uint256 redemption, address to, address vault) = _unlock(tokenId);
    if (vault != address(0)) {
      VotingVault(vault).withdrawTokens(to, redemption);
    } else {
      TransferHelper.withdrawTokens(IERC20(token), to, redemption);
    }
  }

  function unlockAndStake(uint256 tokenId) external onlyOwner(tokenId) {
    (uint256 redemption, address to, address vault) = _unlock(tokenId);
    if (vault != address(0)) {
      VotingVault(vault).stakeTokens(stakingContract, to, redemption);
    } else {
      TransferHelper.stakeTokens(IERC20(token), stakingContract, to, redemption);
    }
    emit TokensStaked(tokenId, redemption, to);
  }

  function delegate(uint256 tokenId, address delegatee) external onlyOwner(tokenId) returns (address vault) {
    vault = _delegate(tokenId, delegatee);
  }

  /***********INTERNAL METHODS****************************************************************************************************** */

  function _createLockup(address recipient, uint256 amount, uint256 rate) internal returns (uint256 tokenId) {
    require(recipient != address(0), '!0address');
    TransferHelper.transferTokens(IERC20(token), msg.sender, address(this), amount);
    tokenId = _incrementTokenId();
    lockups[tokenId] = Lockup(amount, rate, start);
    _safeMint(recipient, tokenId);
    emit LockupCreated(tokenId, recipient, amount, rate);
  }

  function _unlock(uint256 tokenId) internal returns (uint256 redemption, address to, address vault) {
    require(!globalLock(), 'Start and cliff not set');
    if (lockups[tokenId].resetTime == 0) {
      // check if this is the first time unlocking and the start was not set initially
      lockups[tokenId].resetTime = start;
    }
    Lockup memory lock = lockups[tokenId];
    require(lock.resetTime >= start, 'reset error');
    to = ownerOf(tokenId);
    vault = votingVaults[tokenId];
    (uint256 unlockedBalance, uint256 lockedBalance, uint256 unlockTime) = TimelockLibrary.balanceAtTime(
      lock.resetTime,
      cliff,
      lock.amount,
      lock.rate,
      period,
      block.timestamp
    );
    require(unlockedBalance > 0, 'No tokens to unlock');
    redemption = unlockedBalance;
    if (lockedBalance == 0) {
      delete lockups[tokenId];
      _burn(tokenId);
    } else {
      lockups[tokenId].amount = lockedBalance;
      lockups[tokenId].resetTime = unlockTime;
    }
    emit TokensUnlocked(tokenId, redemption, lockedBalance, unlockTime);
  }

  function _delegate(uint256 tokenId, address delegatee) internal returns (address vault) {
    require(delegatee != address(0), '!0address');
    vault = (votingVaults[tokenId] == address(0)) ? _setupVotingVault(tokenId) : votingVaults[tokenId];
    VotingVault(vault).delegateTokens(delegatee);
    emit LockupDelegated(tokenId, delegatee, vault);
  }

  function _setupVotingVault(uint256 tokenId) internal returns (address) {
    require(votingVaults[tokenId] == address(0));
    Lockup memory lock = lockups[tokenId];
    VotingVault vault = new VotingVault(token);
    votingVaults[tokenId] = address(vault);
    TransferHelper.withdrawTokens(IERC20(token), address(vault), lock.amount);
    return address(vault);
  }

  /***** ADMIN ONLY FUNCTIONS *****************************************************************************************************/

  function updateStartAndCliff(uint256 newStart, uint256 newCliff) external onlyAdmin {
    require(globalLock(), 'Cannot change start');
    require(newStart > 0);
    require(newCliff >= newStart, 'Cliff must be after start');
    start = newStart;
    cliff = newCliff;
    emit StartAndCliffSet(newStart, newCliff);
  }

  function setStakingContract(address _stakingContract) external onlyAdmin {
    require(stakingContract == address(0), 'Staking contract already set');
    stakingContract = _stakingContract;
    emit StakingContractSet(_stakingContract);
  }

  function setClaimContract(address _claimContract) external onlyAdmin {
    require(claimContract == address(0), 'Claim contract already set');
    claimContract = _claimContract;
    claimHandler.setClaimContract(_claimContract);
    emit ClaimContractSet(_claimContract);
  }

  function changeTransferability(bool _transferable) external onlyAdmin {
    transferable = _transferable;
    emit TransferabilityChanged(_transferable);
  }

  function changeAdmin(address _admin) external onlyAdmin {
    admin = _admin;
    emit AdminChanged(_admin);
  }

  function startCliffSet() public view returns (bool) {
    return start > 0 && cliff >= start;
  }

  function globalLock() public view returns (bool) {
    return TimelockLibrary.initialUnlock(start, cliff, period) > block.timestamp || !startCliffSet();
  }

  function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
    if (auth == address(0)) {
        return super._update(to, tokenId, auth);   
    } else {
        require(transferable, 'Not transferable');
        return super._update(to, tokenId, auth);
    }
  }
}
