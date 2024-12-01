// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

interface ITokenLockups {
  function createLockupWithDelegation(
    address recipient,
    uint256 amount,
    uint256 rate,
    address delegatee
  ) external returns (uint256 tokenId);
  function token() external view returns (address);

  function createLockup(address recipient, uint256 amount, uint256 rate) external returns (uint256 tokenId);
}
