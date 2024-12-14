const C = require('../constants');
const { getSignature } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const claimTests = (constructorParams, lockupParams) => {
  let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
  let start, cliff, period, periods, end;
  let totalAmount, remainder, campaign, claimLockup, claimA, claimB, claimC, claimD, claimE, id;
  it('Deploys the contracts, and sets claim campaign', async () => {
    deployed = await setup(constructorParams);
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
    start = await lockup.start();
    cliff = await lockup.cliff();
    period = await lockup.period();
  });
  it('creates claim campaign without delegation, users can claim locked tokens without delegation', async () => {
    let now = BigInt(await time.latest());
    let claimStart = now;
    let claimCliff = BigInt(lockupParams.cliff) + claimStart;
    let claimPeriod = BigInt(lockupParams.period);
    periods = BigInt(lockupParams.periods);
    end = claimStart + periods;
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
      end: BigInt((await time.latest()) + 60 * 60 * 24 * 365),
      tokenLockup: 1,
      root,
      delegating: false,
    };
    claimLockup = {
      tokenLocker: claimHandler.target,
      start: claimStart,
      cliff: claimCliff,
      period: claimPeriod,
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
    expect(tx).to.emit(claimContract, 'ClaimLockupCreated').withArgs(id, claimLockup);
    expect(tx).to.emit(claimContract, 'CampaignCreated').withArgs(id, campaign, BigInt(treevalues.length));
    expect(await token.balanceOf(claimContract.target)).to.eq(totalAmount);
    // claimer a claims tokens
    let proof = getProof('./test/trees/tree.json', a.address);
    await claimContract.connect(a).claim(id, proof, claimA);
    expect(await token.balanceOf(lockup.target)).to.eq(claimA);
    expect(await lockup.ownerOf(1)).to.eq(a.address);
    expect(await lockup.balanceOf(a.address)).to.eq(1);
    expect(await token.balanceOf(claimHandler.target)).to.eq(0);
    let lockupInfo = await lockup.lockups(1);
    let rate = C.calcPlanRate(claimA, periods);
    expect(lockupInfo.amount).to.eq(claimA);
    expect(lockupInfo.rate).to.eq(rate);
    expect(await lockup.start()).to.eq(start);
    expect(await lockup.cliff()).to.eq(cliff);
    expect(await lockup.period()).to.eq(period);
    expect(await lockup.votingVaults(1)).to.eq(C.ZERO_ADDRESS);
    let initialUnlock =(await lockup.globalLock()) ? BigInt(0) : await lockup.initialUnlock();
    now = BigInt(await time.latest());
    if (now > initialUnlock && initialUnlock > 0) {
      console.log('initial unlock', initialUnlock, now);
      // test unlocking the tokens
      let calc = C.calcPlanBalances(start, cliff, claimA, rate, period, now + BigInt(1));
      await lockup.connect(a).unlock(1);
      expect(await token.balanceOf(a.address)).to.eq(calc.unlockedBalance);
    }
  });
  it('creates claim campaign with delegation, users claim tokens with delegation', async () => {
    const uuid = uuidv4();
    id = uuidParse(uuid);
    campaign.delegating = true;
    await token.approve(claimContract.target, totalAmount);
    await claimContract.createLockedCampaign(
      id,
      campaign,
      claimLockup,
      admin.address,
      C.E18_100
    );
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
    let votingVault = await lockup.votingVaults(2);
    expect(await token.balanceOf(votingVault)).to.eq(claimA);
    expect(await lockup.ownerOf(2)).to.eq(a.address);
    let initialUnlock =(await lockup.globalLock()) ? BigInt(0) : await lockup.initialUnlock();
    let now = BigInt(await time.latest());
    if (now > initialUnlock && initialUnlock > 0) {
      console.log('initial unlock', initialUnlock, now);
      // test unlocking the tokens
      let rate = C.calcPlanRate(claimA, periods);
      let calc = C.calcPlanBalances(start, cliff, claimA, rate, period, now + BigInt(1));
      await lockup.connect(a).unlock(2);
    }
  });
};

module.exports = {
  claimTests,
};
