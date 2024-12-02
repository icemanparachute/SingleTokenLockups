// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import './VotingVault.sol';
import './ClaimHandler.sol';

import './libraries/TimelockLibrary.sol';
import './libraries/TransferHelper.sol';


/// @title SingleTokenLockups
/// this contract is used to lock tokens for many recipients that all have the same exact lockup schedule
/// each lockup is represented by an NFT, ERC721, where the recipients are the owners of the NFTS
/// only the owner can unlock the tokens based on the defined schedule that all NFT lockups adhere to
/// There is a specific admin address that can adjust the parameters before the token unlocks have started
/// and the contract can be setup with a blank parameter set that can be set by the admin after the fact
/// @dev this contract can interact with ERC20Votes interfaces so that each recipient can delegate or participate in onchain DAO governance with their tokens while they are locked


contract SingleTokenLockups is ERC721Enumerable, ReentrancyGuard {
  /**EVENTS ************************************************************************************************************************/

  event LockupCreated(uint256 tokenId, address recipient, uint256 amount, uint256 rate);
  event LockupDelegated(uint256 tokenId, address delegatee, address votingVault);
  event TokensUnlocked(uint256 tokenId, uint256 unlockedAmount, uint256 remainingAmount, uint256 resetTime);
  event TokensStaked(uint256 tokenId, uint256 stakeAmount, address beneficiary);
  event LockupCancelled(uint256 tokenId);

  event StartAndCliffSet(uint256 start, uint256 cliff);
  event TransferabilityChanged(bool transferable);
  event AdminChanged(address admin);
  event ClaimContractSet(address claimContract);
  event StakingContractSet(address stakingContract);

  /******GLOBAL VARIABLES********************************************************************************************************** */

  /// @notice _tokenIds is used for the NFT token IDs that is mapped to the amount and rate of the lockup
  uint256 internal _tokenIds;
  /// @notice token is the address of the ERC20 token that is being locked, only allows for one ERC20 to interact with a singleton contract
  address public token;
  /// @notice admin is the address that can adjust the parameters of the lockups before the start time, transferability, set the staking contract and claim contract
  address public admin;
  /// @notice stakingContract is the address of the staking contract that the tokens can be staked to after they are unlocked
  address public stakingContract;
  /// @notice claimContract is the address of the claim campaigns contract that is used for mass airdrops to many recipients to claim locked tokens
  address public claimContract;
  /// @notice a special adapter for the claimContract that allows this contract to interface with the claim campaigns contract
  ClaimHandler public claimHandler;

  /// @notice defines whether the NFTs are transferable or not, can be set by the admin at any time to true or false
  bool public transferable;

  /// @notice details of the lockup schedule that all NFTs adhere to
  /// start is the timestamp that the lockups start and tokens begin to unlock / vest
  uint256 public start;
  /// cliff is an optional parameter after the start date when tokens will unlock in a single discrete cliff time
  /// Tokens will begin to unlock on the start time, but if the cliff is set after the start, then no tokens unlock until the cliff time,
  /// whereupon all tokens that have vested from start to cliff will unlock in a big chunk on that date
  uint256 public cliff;
  /// period is the amount of time between discrete unlocks. Unlocks that are "streaming" or "linear" would use 1 here, where tokens will unlock every second
  /// a period of 86400 would unlock tokens every day, 604800 would unlock tokens every week, and generally 2,628,000 would unlock tokens every month
  uint256 public period;

  /// @notice lockups is the struct that uniquely defines each individual lockup, defined by the following parameters
  /// @param amount is the current amount of tokens locked in the mapped NFT. The amount gets updated each time tokens are unlocked, so the originally total is not stored only the current up to date locked amount
  /// @param rate is the amount of tokens that unlock in the given period of time
  /// @param resetTime is the timestamp when tokens have most recently been unlocked. This is set to the start time initially
  /// but is required so that each time an individual NFT is unlocked this time resets to record the most recent unlock time to recalibrate the lockup schedule for the individual NFT
  struct Lockup {
    uint256 amount;
    uint256 rate;
    uint256 resetTime;
  }


  /// @notice lockups is the mapping of the NFT token ID to the lockup struct that defines the lockup schedule for each individual NFT
  mapping(uint256 => Lockup) public lockups;
  /// @notice votingVaults is the mapping of the NFT token ID to the address of the VotingVault contract that holds the locked tokens for ERC20Votes delegation purposes
  mapping(uint256 => address) public votingVaults;

  /******CONSTRUCTOR************************************************************************ **********************************/

  /// @notice the constructor sets the initial parameters of the lockup schedule and the admin address, though many of these are optional and can be set to 0 to be set at a later date
  /// @param _token is the address of the ERC20 token that is being locked
  /// @param _admin is the address that can adjust the parameters of the lockups before the start time, transferability, set the staking contract and claim contract
  /// @param _transferable is the boolean that defines whether the NFTs are transferable or not, can be set by the admin at any time to true or false
  /// @param _start is the timestamp that the lockups start and tokens begin to unlock / vest - this can be set to 0 if the admin wants to set it later
  /// @param _cliff is an optional parameter after the start date when tokens will unlock in a single discrete cliff time - this can be set to 0 if the admin wants to set it later
  /// @param _period is the amount of time between discrete unlocks
  /// @param _name is the name of the NFT token - just for metadata it has no financial implications
  /// @param _symbol is the symbol of the NFT token - just for metadata it has no financial implications
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
  /// @notice modifier for admin functions that only allows the admin to call the function
  modifier onlyAdmin() {
    require(msg.sender == admin, '!Admin');
    _;
  }

  /// @notice modifier for owner functions that only allows the owner of the NFT to call the function
  modifier onlyOwner(uint256 tokenId) {
    require(ownerOf(tokenId) == msg.sender, '!Owner');
    _;
  }

  /******BASIC NFT TOKEN FUNCTIONS************************************************************************ *********************/
  /// @notice function to increment the tokenId internally when a new NFT is minted
  /// @dev this returns the current tokenId to be used when minting, by incrementing first and then mintning to the next tokenId in order
  function _incrementTokenId() internal returns (uint256) {
    _tokenIds++;
    return _tokenIds;
  }
  /// @notice function to get the current running total of tokenId, useful for when totalSupply does not match
  function currentTokenId() public view returns (uint256) {
    return _tokenIds;
  }

  /******VIEW METHODS********************************************************************************************************** */
  /// @notice function to get the balance of the locked tokens for a given NFT token ID at a given timestamp
  /// @param tokenId is the NFT token ID that is being queried
  /// @param timestamp is the timestamp that the balance is being queried for
  /// @return unlockedBalance is the amount of tokens that have unlocked at the given timestamp
  /// @return lockedBalance is the amount of tokens that are still locked at the given timestamp
  /// @return unlockTime is the timestamp of the reset time
  function balanceOfLockup(
    uint256 tokenId,
    uint256 timestamp
  ) public view returns (uint256 unlockedBalance, uint256 lockedBalance, uint256 unlockTime) {
    require(startCliffSet(), 'Start and cliff not set');
    Lockup memory lock = lockups[tokenId];
    uint256 resetTime = lock.resetTime == 0 ? start : lock.resetTime;
    (unlockedBalance, lockedBalance, unlockTime) = TimelockLibrary.balanceAtTime(
      resetTime,
      cliff,
      lock.amount,
      lock.rate,
      period,
      timestamp
    );
  }

  /// @notice function to get the initial global unlock - when all tokens have their first unlock event or timestamp
  function initialUnlock() public view returns (uint256) {
    require(startCliffSet(), 'Start and cliff not set');
    return TimelockLibrary.initialUnlock(start, cliff, period);
  }

  /****EXTERNAL CREATE METHODS**********************************************************************************************************/

  /// @notice function to create a lockup for a single recipient with a single lockup schedule
  /// @param recipient is the address of the recipient that will own the NFT
  /// @param amount is the amount of tokens that will be locked in the NFT
  /// @param rate is the amount of tokens that will unlock in the given period of time
  /// @return tokenId is the NFT token ID that is created and minted to the recipient
  /// @dev this function calls the internal _createLockup function to do all of the token transfers, minting and storage updates + events
  function createLockup(address recipient, uint256 amount, uint256 rate) external nonReentrant returns (uint256 tokenId) {
    // pull tokens from sender into contract
    tokenId = _createLockup(recipient, amount, rate);
  }


  /// @notice function to create many lockups for many recipients with many lockup schedules
  /// @param recipients is the array of addresses of the recipients that will own the NFTs
  /// @param amounts is the array of amounts of tokens that will be locked in the NFTs
  /// @param rates is the array of amounts of tokens that will unlock in the given period of time
  /// @return tokenIds is the array of NFT token IDs that are created and minted to the recipients
  /// @dev this function calls the internal _createLockup function to do all of the token transfers, minting and storage updates + events
  function createLockups(
    address[] memory recipients,
    uint256[] memory amounts,
    uint256[] memory rates
  ) external nonReentrant returns (uint256[] memory tokenIds) {
    require(recipients.length == amounts.length && amounts.length == rates.length, 'Array lengths must match');
    tokenIds = new uint256[](recipients.length);
    for (uint256 i; i < recipients.length; i++) {
      tokenIds[i] = _createLockup(recipients[i], amounts[i], rates[i]);
    }
  }

  /// @notice function to create a lockup for a single recipient with a single lockup schedule and delegate the locked tokens, creating a VotingVault in the process
  /// @param recipient is the address of the recipient that will own the NFT
  /// @param amount is the amount of tokens that will be locked in the NFT
  /// @param rate is the amount of tokens that will unlock in the given period of time
  /// @param delegatee is the address of the delegatee, where tokens will be delegated to from the created voting vault
  /// @return tokenId is the NFT token ID that is created and minted to the recipient
  /// @return vault is the address of the voting vault that holds the locked tokens and is delegated to the delegatee
  /// @dev this function calls the internal _createLockup function to do all of the token transfers, minting and storage updates + events
  /// and then calls the internal _delegate function to create the voting vault and delegate the tokens to the delegatee
  function createLockupWithDelegation(
    address recipient,
    uint256 amount,
    uint256 rate,
    address delegatee
  ) external nonReentrant returns (uint256 tokenId, address vault) {
    tokenId = _createLockup(recipient, amount, rate);
    vault = _delegate(tokenId, delegatee);
  }

  /// @notice function to create many lockups for many recipients with many lockup schedules and delegate the locked tokens, creating a VotingVaults in the process
  /// @param recipients is the array of addresses of the recipients that will own the NFTs
  /// @param amounts is the array of amounts of tokens that will be locked in the NFTs
  /// @param rates is the array of amounts of tokens that will unlock in the given period of time
  /// @param delegatees is the array of addresses of the delegatees, where tokens will be delegated to from the created voting vaults
  /// @return tokenIds is the array of NFT token IDs that are created and minted to the recipients
  /// @return vaults is the array of addresses of the voting vaults that hold the locked tokens and are delegated to the delegatees
  /// @dev this function calls the internal _createLockup function to do all of the token transfers, minting and storage updates + events
  /// and then calls the internal _delegate function to create the voting vaults and delegate the tokens to the delegatees
  function createLockupsWithDelegation(
    address[] memory recipients,
    uint256[] memory amounts,
    uint256[] memory rates,
    address[] memory delegatees
  ) external nonReentrant returns (uint256[] memory tokenIds, address[] memory vaults) {
    require(
      recipients.length == amounts.length && amounts.length == rates.length && rates.length == delegatees.length,
      'Array lengths must match'
    );
    tokenIds = new uint256[](recipients.length);
    vaults = new address[](recipients.length);
    for (uint256 i; i < recipients.length; i++) {
      tokenIds[i] = _createLockup(recipients[i], amounts[i], rates[i]);
      vaults[i] = _delegate(tokenIds[i], delegatees[i]);
    }
  }

  /******EXTERNAL NFT OWNER METHODS********************************************************************************************** */

  /// @notice function to unlock the tokens for a given NFT token ID
  /// @param tokenId is the NFT token ID that is being unlocked
  /// @dev this function calls the internal _unlock function to unlock the tokens and then transfers them to the owner of the NFT
  /// if the tokens have been delegated, it will withdraw and send tokens from the voting vault, otherwise it will send tokens from this main escrow contract out
  function unlock(uint256 tokenId) external nonReentrant onlyOwner(tokenId) {
    (uint256 redemption, address to, address vault) = _unlock(tokenId);
    if (vault != address(0)) {
      VotingVault(vault).withdrawTokens(to, redemption);
    } else {
      TransferHelper.withdrawTokens(IERC20(token), to, redemption);
    }
  }

  /// @notice function to unlock the tokens for a given NFT token ID and stake them in the staking contract
  /// @param tokenId is the NFT token ID that is being unlocked
  /// @dev this function requires that the staking contract has been set, and if it has not been cannot be called
  /// @dev this function cannot be called if the tokens have not been delegated and are sitting in the voting vault
  //// this is for extra security because staking requires to call an IERC20.approve() function, which is only done in the voting vault contract so that this main contract
  /// never approves any external contracts with token spend allowance
  function unlockAndStake(uint256 tokenId) external nonReentrant onlyOwner(tokenId) {
    require(stakingContract != address(0), 'Staking contract not set');
    (uint256 redemption, address to, address vault) = _unlock(tokenId);
    require(vault != address(0), 'vault error');
    VotingVault(vault).withdrawAndStake(stakingContract, to, redemption);
    emit TokensStaked(tokenId, redemption, to);
  }

  /// @notice function to delegate the tokens for a given NFT token ID to a delegatee
  /// @param tokenId is the NFT token ID that is being delegated
  /// @param delegatee is the address of the delegatee that the tokens will be delegated to
  /// @return vault is the address of the voting vault that holds the locked tokens and is delegated to the delegatee
  /// @dev this function calls the internal _delegate function to delegate the tokens to the delegatee
  /// if the tokens have not been delegated yet, it will create a voting vault and delegate the tokens to the delegatee, otherwise it will redelegate from the existing voting vault
  function delegate(uint256 tokenId, address delegatee) external nonReentrant onlyOwner(tokenId) returns (address vault) {
    vault = _delegate(tokenId, delegatee);
  }

  /***********INTERNAL METHODS****************************************************************************************************** */

  /// @notice function to create a lockup for a single recipient with a single lockup schedule
  /// @param recipient is the address of the recipient that will own the NFT
  /// @param amount is the amount of tokens that will be locked in the NFT
  /// @param rate is the amount of tokens that will unlock in the given period of time
  /// @return tokenId is the NFT token ID that is created and minted to the recipient
  /// @dev this function will pull tokens into this contract from the msg.sender. 
  /// then it will increment the tokenIds counter, create a new lockup struct, mint the NFT to the recipient, and emit the LockupCreated event
  function _createLockup(address recipient, uint256 amount, uint256 rate) internal returns (uint256 tokenId) {
    require(recipient != address(0), '!0address');
    TransferHelper.transferTokens(IERC20(token), msg.sender, address(this), amount);
    tokenId = _incrementTokenId();
    lockups[tokenId] = Lockup(amount, rate, start);
    _safeMint(recipient, tokenId);
    emit LockupCreated(tokenId, recipient, amount, rate);
  }

  /// @notice function to unlock the tokens for a given NFT token ID
  /// @param tokenId is the NFT token ID that is being unlocked
  /// @return redemption is the amount of tokens that have been unlocked
  /// @return to is the address of the recipient that the tokens will be sent to
  /// @return vault is the address of the voting vault that holds the locked tokens and is delegated to the delegatee
  /// @dev this function can only be called if the global lock is off, otherwise the unlock is not set and nothing can be unlocked yet
  /// @dev this function will check the reset time initially, as if the lockup was created prior to the start time being set, then it would be 0 and needs to be updated now
  /// once it checks the reset time, then it can calculate the balance at the current time, and if there are tokens available to be unlocked
  /// it intentionally returns the redemption amount, to address and vault, because if the locked balance is 0, then the NFT is burned and the vault is deleted
  /// if the lockedBalance is not 0, then it will update the reset time with the most recent unlock time, and adjust the amount to equal the locked balance
  function _unlock(uint256 tokenId) internal returns (uint256 redemption, address to, address vault) {
    require(!globalLock(), 'Locked');
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


  /// @notice function to delegate the tokens for a given NFT token ID to a delegatee
  /// @param tokenId is the NFT token ID that is being delegated
  /// @param delegatee is the address of the delegatee that the tokens will be delegated to
  /// @return vault is the address of the voting vault that holds the locked tokens and is delegated to the delegatee
  /// @dev if there is no voting vault created (ie votingVault == address(0)), then it will create a new one using the interanl function _setupVotingVault
  function _delegate(uint256 tokenId, address delegatee) internal returns (address vault) {
    require(delegatee != address(0), '!0address');
    vault = (votingVaults[tokenId] == address(0)) ? _setupVotingVault(tokenId) : votingVaults[tokenId];
    VotingVault(vault).delegateTokens(delegatee);
    emit LockupDelegated(tokenId, delegatee, vault);
  }


  /// @notice function to setup a new voting vault for a given NFT token ID
  /// @param tokenId is the NFT token ID that is being delegated
  /// @return vault is the address of the voting vault that holds the locked tokens and is delegated to the delegatee
  /// @dev this function will create a new voting vault contract, transfer the locked tokens from this contract to the voting vault
  function _setupVotingVault(uint256 tokenId) internal returns (address) {
    require(votingVaults[tokenId] == address(0));
    Lockup memory lock = lockups[tokenId];
    VotingVault vault = new VotingVault(token);
    votingVaults[tokenId] = address(vault);
    TransferHelper.withdrawTokens(IERC20(token), address(vault), lock.amount);
    return address(vault);
  }

  /***** ADMIN ONLY FUNCTIONS *****************************************************************************************************/
  
  /// @notice function to update the start and the cliff time - this assumes it has not been set or they are set in the future
  /// @param newStart is the new start time
  /// @param newCliff is the new cliff time
  /// @dev as long as the current cliff and start are both set to 0, or they are both set in the future - this function can be called to update it
  /// @dev the cliff can not be set prior to the start time, it must be equal to or greater than the start for validity
  function updateStartAndCliff(uint256 newStart, uint256 newCliff) external onlyAdmin {
    require(globalLock(), 'Cannot change start');
    require(newStart > 0);
    require(newCliff >= newStart, 'Cliff must be after start');
    start = newStart;
    cliff = newCliff;
    emit StartAndCliffSet(newStart, newCliff);
  }

  /// @notice function to set the staking contract by the admin
  /// @param _stakingContract is the address of the staking contract
  /// @dev this can Only be set once - it cannot be done multiple times
  function setStakingContract(address _stakingContract) external onlyAdmin {
    require(stakingContract == address(0), 'Staking contract already set');
    stakingContract = _stakingContract;
    emit StakingContractSet(_stakingContract);
  }

  /// @notice function to set the claim contract address by the admin
  /// @param _claimContract is the address of the claim contract
  /// @dev this can Only be set once - it cannot be done multiple times
  function setClaimContract(address _claimContract) external onlyAdmin {
    require(claimContract == address(0), 'Claim contract already set');
    claimContract = _claimContract;
    claimHandler.setClaimContract(_claimContract);
    emit ClaimContractSet(_claimContract);
  }

  /// @notice function to change the transferability of the NFTs by the admin
  /// @param _transferable defines whether the NFTs are transferable or not
  function changeTransferability(bool _transferable) external onlyAdmin {
    transferable = _transferable;
    emit TransferabilityChanged(_transferable);
  }

  /// @notice function for the admin to cancel specific lockup NFTs
  /// @param tokenIds is the array of NFT token IDs that are being cancelled
  /// @dev this could be useful in case recipients are unable to unlock their tokens or for other reasons
  function cancelLockups(uint256[] memory tokenIds) external onlyAdmin {
    require(globalLock(), 'Cannot cancel');
    for (uint256 i; i < tokenIds.length; i++) {
      _cancelLockup(tokenIds[i]);
    }
  }

  /// @notice function for the admin to cancel all lockup NFTs
  /// @dev used in emergency where all tokens need to be unlocked and returned to the admin
  function cancelAllLockups() external onlyAdmin {
    require(globalLock(), 'Cannot cancel');
    uint256 totalSupply = totalSupply();
    for (uint256 i; i < totalSupply; i++) {
      _cancelLockup(tokenByIndex(0));
    }
  }

  /// @notice internal function to cancel a lockup
  /// @param tokenId is the NFT token ID that is being cancelled
  /// @dev this will delete the lockup, burn the NFT, and return the tokens to the admin
  /// if the lockup has been deleted, then this will just return so that the for loop can continue to the next tokenId without reverting
  function _cancelLockup(uint256 tokenId) internal {
    Lockup memory lock = lockups[tokenId];
    if (lock.amount == 0) return;
    address vault = votingVaults[tokenId];
    if (vault != address(0)) {
      VotingVault(vault).withdrawTokens(admin, lock.amount);
    } else {
      TransferHelper.withdrawTokens(IERC20(token), admin, lock.amount);
    }
    delete lockups[tokenId];
    _burn(tokenId);
    emit LockupCancelled(tokenId);
  }

  /// @notice public function of if the start and cliff have been set - important as some other functions rely on its boolean return
  function startCliffSet() public view returns (bool) {
    return start > 0 && cliff >= start;
  }

  /// @notice public function to check if the global lock is on or off
  function globalLock() public view returns (bool) {
    return TimelockLibrary.initialUnlock(start, cliff, period) > block.timestamp || !startCliffSet();
  }

  /// @notice internal ERC721 update function - overrides to check the transfeability of the NFTs
  function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
    if (auth == address(0)) {
        return super._update(to, tokenId, auth);   
    } else {
        require(transferable, '!Transferable');
        return super._update(to, tokenId, auth);
    }
  }
}
