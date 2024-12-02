const C = require('../constants');
const { getSignature } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const adminTests = (constructorParams) => {
  let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
  let start, cliff, period;
  it('Deploys the contracts', async () => {
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
    period = constructorParams.period;
  });
  it('admin distributes lockups manually and users cannot claim as start and cliff have not been set', async () => {
    let recipients = [a.address, b.address, c.address, d.address, e.address];
    let amounts = [C.E18_100, C.E18_100, C.E18_100, C.E18_100, C.E18_100];
    let rates = [C.E18_1, C.E18_1, C.E18_1, C.E18_1, C.E18_1];
    await token.approve(lockup.target, C.E18_1000);
    await lockup.createLockups(recipients, amounts, rates);
    if (constructorParams.start == 0) {
      expect(await lockup.startCliffSet()).to.eq(false);
    } else {
      expect(await lockup.startCliffSet()).to.eq(true);
    }
    await expect(lockup.connect(a).unlock('1')).to.be.revertedWith('Locked');
  });
  it('not admin cannot update or set the start or cliff date', async () => {
    let now = BigInt(await time.latest());
    await expect(lockup.connect(a).updateStartAndCliff(now, now)).to.be.revertedWith('!Admin');
  });
  it('admin sets the start and cliff date in the future, and then can reset the start and cliff date again', async () => {
    let now = BigInt(await time.latest());
    start = now + BigInt(1000);
    cliff = now + BigInt(2000);
    await lockup.updateStartAndCliff(start, cliff);
    expect(await lockup.startCliffSet()).to.eq(true);
    expect(await lockup.start()).to.eq(start);
    expect(await lockup.cliff()).to.eq(cliff);
    start = now + BigInt(200);
    cliff = start;
    await lockup.updateStartAndCliff(start, cliff);
    expect(await lockup.startCliffSet()).to.eq(true);
    expect(await lockup.start()).to.eq(start);
    expect(await lockup.cliff()).to.eq(cliff);
  });
  it('admin sets the start and cliff date and users are able to claim, but unable to claim and stake', async () => {
    let now = BigInt(await time.latest());
    start = now;
    cliff = start + BigInt(20);
    await lockup.updateStartAndCliff(start, cliff);
    await time.increase(25);
    now = BigInt(await time.latest());
    await expect(lockup.connect(a).unlockAndStake('1')).to.be.revertedWith('Staking contract not set');
    let calc = C.calcPlanBalances(start, cliff, C.E18_100, C.E18_1, BigInt(period), now + BigInt(2));
    let calc2 = await lockup.balanceOfLockup('2', now + BigInt(2));
    expect(calc.unlockedBalance).to.eq(calc2.unlockedBalance);
    expect(calc.lockedBalance).to.eq(calc2.lockedBalance);
    await lockup.connect(a).unlock('1');
    expect(await token.balanceOf(a.address)).to.eq(calc.unlockedBalance);
  });
  it('admin sets the staking contract, and now users can unlock and stake', async () => {
    await lockup.setStakingContract(staking.target);
    expect(await lockup.stakingContract()).to.eq(staking.target);
    await lockup.connect(b).delegate('2', b.address);
    let now = BigInt(await time.latest());
    let calc = C.calcPlanBalances(start, cliff, C.E18_100, C.E18_1, BigInt(period), now + BigInt(1));
    let calc2 = await lockup.balanceOfLockup('2', now + BigInt(1));
    expect(calc.unlockedBalance).to.eq(calc2.unlockedBalance);
    expect(calc.lockedBalance).to.eq(calc2.lockedBalance);
    let preStakeBalance = await token.balanceOf(staking.target);
    await lockup.connect(b).unlockAndStake('2');
    let postStakeBalance = await token.balanceOf(staking.target);
    expect(postStakeBalance).to.eq(preStakeBalance + (calc.unlockedBalance));
    expect(await token.balanceOf(b.address)).to.eq(0);
    expect(await staking.balanceOf(b.address)).to.eq(calc.unlockedBalance);
    
  });
  it('admin changes transferability of the nfts', async () => {
    expect(await lockup.transferable()).to.eq(true);
    expect(await lockup.ownerOf('3')).to.eq(c.address);
    await lockup.connect(c).transferFrom(c.address, d.address, '3');
    expect(await lockup.ownerOf('3')).to.eq(d.address);
    await lockup.changeTransferability(false);
    expect(await lockup.transferable()).to.eq(false);
    await expect(lockup.connect(d).transferFrom(d.address, e.address, '3')).to.be.revertedWith('!Transferable');
    await expect(lockup.connect(d).safeTransferFrom(d.address, e.address, '3')).to.be.revertedWith('!Transferable');
    // check that it can still be burned during final unlock
    await time.increase(100);
    await lockup.connect(d).unlock('3');
    await expect(lockup.ownerOf('3')).to.be.reverted;
    await lockup.createLockup(a.address, C.E18_100, C.E18_1);
    expect(await lockup.ownerOf('6')).to.eq(a.address);
    await expect(lockup.connect(a).transferFrom(a.address, b.address, '6')).to.be.revertedWith('!Transferable');
    await lockup.changeTransferability(true);
    expect(await lockup.transferable()).to.eq(true);
    await lockup.connect(a).transferFrom(a.address, b.address, '6');
    expect(await lockup.ownerOf('6')).to.eq(b.address);
    
  });
  it('not admin cannot change transferabiliy of the nfts', async () => {
    await expect(lockup.connect(a).changeTransferability(false)).to.be.revertedWith('!Admin');
  });
  it('admin cannot change the start and cliff after the initial unlock', async () => {
    await expect(lockup.updateStartAndCliff(start, cliff)).to.be.revertedWith('Cannot change start');
  });
  it('admin cannot change staking contract after it has been set', async () => {
    await expect(lockup.setStakingContract(staking.target)).to.be.revertedWith('Staking contract already set');
  });
  it('admin cannot change the claim contract after it has been set', async () => {
    await expect(lockup.connect(b).setClaimContract(claimContract.target)).to.be.revertedWith('!Admin');
    await lockup.setClaimContract(claimContract.target);
    await expect(lockup.setClaimContract(claimContract.target)).to.be.revertedWith('Claim contract already set');
  });
};

module.exports = {
  adminTests,
};
