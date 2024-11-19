const C = require('../constants');
const { getSignature } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const lockedDelegatingTests = () => {
  let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
  let start, cliff, period, periods, end;
  let totalAmount, remainder, campaign, claimLockup, claimA, claimB, claimC, claimD, claimE, id;
  it('Admin deploys the contracts, then sets up the staking and claim contracts', async () => {
    deployed = await setup();
    admin = deployed.admin;
    a = deployed.a;
    b = deployed.b;
    c = deployed.c;
    d = deployed.d;
    e = deployed.e;
    token = deployed.token;
    claimContract = deployed.claimContract;
    lockup = deployed.lockup;
    domain = deployed.claimDomain;
    staking = deployed.staking;
    claimHandler = deployed.claimHandler;
    
    await lockup.setStakingContract(staking.target);
    await lockup.setClaimContract(claimContract.target);
    
  });
  it('Admin creates a claim campaign', async () => {
    let now = BigInt(await time.latest());
    start = now;
    cliff = start;
    period = BigInt(1);
    periods = BigInt(1);
    end = start + periods;
    let treevalues = [];
    totalAmount = BigInt(0);
    const uuid = uuidv4();
    id = uuidParse(uuid);
    for (let i = 0; i < 100; i++) {
      let wallet;
      let amt = C.randomBigNum(1000, 100, 18);
      if (i == 0) {
        wallet = a.address;
        claimA = amt;
      } else if (i == 1) {
        wallet = b.address;
        claimB = amt;
      } else if (i == 2) {
        wallet = c.address;
        claimC = amt;
      } else if (i == 3) {
        wallet = d.address;
        claimD = amt;
      } else if (i == 4) {
        wallet = e.address;
        claimE = amt;
      } else {
        wallet = ethers.Wallet.createRandom().address;
      }
      totalAmount = amt + totalAmount;
      treevalues.push([wallet, amt.toString()]);
    }
    remainder = totalAmount;
    const root = createTree(treevalues, ['address', 'uint256']);
    campaign = {
      manager: admin.address,
      token: token.target,
      amount: totalAmount,
      start: now,
      end: BigInt((await time.latest()) + 60 * 60),
      tokenLockup: 1,
      root,
      delegating: true,
    };
    claimLockup = {
      tokenLocker: claimHandler.target,
      start,
      cliff,
      period,
      periods,
    };
    await token.approve(claimContract.target, totalAmount);
    expect(await token.allowance(admin.address, claimContract.target)).to.eq(totalAmount);
    const tx = await claimContract.createLockedCampaign(
      id,
      campaign,
      claimLockup,
      admin.address,
      BigInt(treevalues.length)
    );
    console.log('made it to here')
    expect(tx).to.emit(claimContract, 'ClaimLockupCreated').withArgs(id, claimLockup);
    expect(tx).to.emit(claimContract, 'CampaignCreated').withArgs(id, campaign, BigInt(treevalues.length));
    expect(await token.balanceOf(claimContract.target)).to.eq(totalAmount);
  });
  it('User A claims tokens from the claim campaign', async () => {
    let proof = getProof('./test/trees/tree.json', a.address);
    let delegatee = a.address;
    let expiry = BigInt(await time.latest()) + BigInt(60 * 60 * 24 * 7);
    let nonce = 0;
    const delegationValues = {
      delegatee,
      nonce,
      expiry,
    };
    const delegationSignature = await getSignature(a, domain, C.delegationtype, delegationValues);
    const delegationSig = {
      nonce,
      expiry,
      v: delegationSignature.v,
      r: delegationSignature.r,
      s: delegationSignature.s,
    };
    const tx = await claimContract.connect(a).claimAndDelegate(id, proof, claimA, delegatee, delegationSig);
    expect(await token.balanceOf(lockup.target)).to.eq(0);
    expect(await token.balanceOf(claimHandler.target)).to.eq(0);
    expect(await lockup.balanceOf(a.address)).to.eq(1);
    expect(await lockup.ownerOf(1)).to.eq(a.address);
    let votingVault = await lockup.votingVaults(1);
    expect(await token.balanceOf(votingVault)).to.eq(claimA);
    expect(await token.delegates(votingVault)).to.eq(delegatee);
    let lock = await lockup.lockups(1);
    expect(lock.amount).to.eq(claimA);
    expect(lock.rate).to.eq(claimA);
    expect(lock.resetTime).to.eq(0);
    expect(await lockup.startCliffSet()).to.eq(false);
    expect(await lockup.globalLock()).to.eq(true);
  })
}
  

module.exports = {
  lockedDelegatingTests,
  
};
