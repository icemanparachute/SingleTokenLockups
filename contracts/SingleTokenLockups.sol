// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

import "./interfaces/IDelegatePlan.sol";
import "./interfaces/IERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzepplin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract SingleTokenLockups is ERC721Enumerable {
    uint256 public tokenIds;
    IERC20 public token;
    address public admin;

    bool public transferable;

    // lockup details
    uint256 public start;
    uint256 public cliff;
    uint256 public period;

    struct Lockup {
        uint256 amount;
        uint256 rate;
    }

    mapping(uint256 => Lockup) public lockups;
    mapping(uint256 => address) public votingVault;

    constructor(
        address admin,
        address token,
        bool transferable,
        uint256 start,
        uint256 cliff,
        uint256 rate,
        uint256 period,
        string memory name,
        string memory symbol
    ) ERC721(name, symbol) {
        admin = admin;
        token = IERC20(token);
        transferable = transferable;
        start = start;
        cliff = cliff;
        rate = rate;
        period = period;
    }

    function createLockup(address recipient, uint256 amount) external returns (uint256 tokenId) {
        // pull tokens from sender into contract
        token.transferFrom(msg.sender, address(this), amount);
        tokenId = tokenIds++;
        lockedAmount[tokenId] = amount;
        votingVault[tokenId] = recipient;

        _mint(recipient, tokenId);
    }

    function unlock(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "TokenLocker: not owner");
    }

    function delegate(uint256 tokenId, address delegatee) external {
        require(ownerOf(tokenId) == msg.sender, "TokenLocker: not owner");
        IDelegatePlan(votingVault[tokenId]).delegate(delegatee);
    }

    function updateStart(uint256 newStart) external {
        require(msg.sender == admin, "TokenLocker: not admin");
        start = newStart;
    }

    function updateCliff(uint256 newCliff) external {
        require(msg.sender == admin, "TokenLocker: not admin");
        cliff = newCliff;
    }
}
