const C = require('../constants');
const { getSignature } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const unlockSingleTest = () => {
  let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
  let start, cliff, period;
  it('Admin creates lockups with a single unlock, users unlock on the single date', async () => {
    let now = BigInt(await time.latest());
    start = BigInt(100);
    cliff = start;
    period = BigInt(1);
    let p = {
      start,
      cliff,
      period,
      transferable: true,
    };
    deployed = await setup(p);
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

    let recipients = [a.address, b.address, c.address, d.address];
    let amount = C.E18_100;
    let rate = amount;
    let amounts = [amount, amount, amount, amount];
    let rates = [rate, rate, rate, rate];
    await token.approve(lockup.target, C.E18_1000);
    await lockup.createLockups(recipients, amounts, rates);

    // tokens are not unlocked yet
    await expect(lockup.connect(a).unlock('1')).to.be.revertedWith('Locked');
    await lockup.connect(a).delegate(1, a.address);
    await lockup.connect(d).transferFrom(d.address, e.address, 4);
    expect(await lockup.ownerOf(4)).to.eq(e.address);
    // test that other wallets cannot unlock
    now = BigInt(await time.increase(start));
    await expect(lockup.connect(b).unlock('1')).to.be.revertedWith('!Owner');
    await expect(lockup.connect(d).unlock('4')).to.be.revertedWith('!Owner');
    await expect(lockup.connect(c).unlockAndStake('2')).to.be.revertedWith('!Owner');
    // unlock tokens
    expect(await lockup.connect(a).unlock('1'))
      .to.emit(lockup, 'TokensUnlocked')
      .withArgs('1', amount, 0, start + BigInt(1));
    expect(await token.balanceOf(a.address)).to.eq(amount);
    expect(await lockup.connect(b).unlock('2'))
      .to.emit(lockup, 'TokensUnlocked')
      .withArgs('2', amount, 0, start + BigInt(1));
    expect(await token.balanceOf(b.address)).to.eq(amount);
    expect(await lockup.connect(c).unlock('3'))
      .to.emit(lockup, 'TokensUnlocked')
      .withArgs('3', amount, 0, start + BigInt(1));
    expect(await token.balanceOf(c.address)).to.eq(amount);
    expect(await lockup.connect(e).unlock('4'))
      .to.emit(lockup, 'TokensUnlocked')
      .withArgs('4', amount, 0, start + BigInt(1));
    expect(await token.balanceOf(e.address)).to.eq(amount);
  });
};

const unlockTests = (params, runs) => {
  let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
  let start, cliff, period;
  it('Testing various unlocks and cliffs and periods with preset params', async () => {
    for (let i = 0; i < runs; i++) {
      console.log(params.name);
      let now = BigInt(await time.latest());
      deployed = await setup(params);
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
      let amount = C.randomBigNum(1000, 5, 18);
      let rate = C.randomBigNum(1000, 1, 15);
      console.log('Amount: ', amount.toString());
      console.log('Rate: ', rate.toString());
      await token.approve(lockup.target, amount * BigInt(3));
      await lockup.createLockup(a.address, amount, rate);
      await lockup.createLockupWithDelegation(b.address, amount, rate, b.address);
      now = BigInt(await time.latest());
      let initialUnlock = await lockup.initialUnlock();
      console.log('Initial Unlock: ', initialUnlock.toString());
      console.log('Start: ', start.toString());
      console.log('Cliff: ', cliff.toString());
      if (now < initialUnlock) {
        expect(await lockup.globalLock()).to.eq(true);

        expect(await lockup.initialUnlock()).to.eq(cliff + period);

        now = BigInt(await time.increase(initialUnlock - now + BigInt(1)));
      } else {
        expect(await lockup.globalLock()).to.eq(false);

        now = BigInt(await time.latest());
      }
      let calc = C.calcPlanBalances(start, cliff, amount, rate, period, now + BigInt(1));
      let onchainCalc = await lockup.balanceOfLockup(1, now + BigInt(1));
      expect(calc.unlockedBalance).to.eq(onchainCalc.unlockedBalance);
      expect(calc.lockedBalance).to.eq(onchainCalc.lockedBalance);
      expect(calc.resetTime).to.eq(onchainCalc.unlockTime);
      await lockup.connect(a).unlock('1');
      await lockup.connect(b).unlock('2');
      expect(await token.balanceOf(a.address)).to.eq(calc.unlockedBalance);
      expect(await token.balanceOf(lockup.target)).to.eq(amount - calc.unlockedBalance);
      let vault = await lockup.votingVaults(2);
      if (period > 1) {
        expect(await token.balanceOf(b.address)).to.eq(calc.unlockedBalance);
        expect(await token.balanceOf(vault)).to.eq(amount - calc.unlockedBalance);
      } else {
        if (calc.lockedBalance > 0) {
          expect(await token.balanceOf(b.address)).to.eq(calc.unlockedBalance + rate);
          expect(await token.balanceOf(vault)).to.eq(amount - calc.unlockedBalance - rate);
        } else {
          expect(await token.balanceOf(b.address)).to.eq(calc.unlockedBalance);
          expect(await token.balanceOf(vault)).to.eq(0);
        }
      }
      if (calc.lockedBalance > 0) {
        let lockupA = await lockup.lockups(1);
        expect(lockupA.amount).to.eq(calc.lockedBalance);
        expect(lockupA.rate).to.eq(rate);
        expect(lockupA.resetTime).to.eq(calc.resetTime);
        let lockupB = await lockup.lockups(2);
        if (period > 1) {
          expect(lockupB.amount).to.eq(calc.lockedBalance);
          expect(lockupB.rate).to.eq(rate);
          expect(lockupB.resetTime).to.eq(calc.resetTime);
        } else {
          expect(lockupB.amount).to.eq(calc.lockedBalance - rate);
          expect(lockupB.rate).to.eq(rate);
          expect(lockupB.resetTime).to.eq(calc.resetTime + BigInt(1));
        }
        now = BigInt(await time.increase(C.bigMax(period, 10)));
        calc = C.calcPlanBalances(lockupA.resetTime, cliff, lockupA.amount, rate, period, now + BigInt(1));
        onchainCalc = await lockup.balanceOfLockup(1, now + BigInt(1));
        expect(calc.unlockedBalance).to.eq(onchainCalc.unlockedBalance);
        expect(calc.lockedBalance).to.eq(onchainCalc.lockedBalance);
        expect(calc.resetTime).to.eq(onchainCalc.unlockTime);
        await lockup.connect(a).unlock('1');
        await lockup.connect(b).unlock('2');

        if (calc.lockedBalance > 0) {
          let lockupA = await lockup.lockups(1);
          expect(lockupA.amount).to.eq(calc.lockedBalance);
          expect(lockupA.rate).to.eq(rate);
          expect(lockupA.resetTime).to.eq(calc.resetTime);
          let lockupB = await lockup.lockups(2);
          // expect(lockupB.amount).to.eq(calc.lockedBalance - rate);
          expect(lockupB.rate).to.eq(rate);
          let resetFraction = period == 1 ? BigInt(1) : BigInt(0);
          expect(lockupB.resetTime).to.eq(calc.resetTime + resetFraction);
          let end = C.calcPlanEnd(start, amount, rate, period);
          await time.increaseTo(end);
          await lockup.connect(a).unlock('1');
          await lockup.connect(b).unlock('2');
          expect(await token.balanceOf(a.address)).to.eq(amount);
          expect(await token.balanceOf(b.address)).to.eq(amount);
          expect(await token.balanceOf(lockup.target)).to.eq(0);
          expect(await token.balanceOf(vault)).to.eq(0);
        } else {
          expect((await lockup.lockups(1)).amount).to.eq(0);
          expect((await lockup.lockups(2)).amount).to.eq(0);
          await expect(lockup.connect(a).unlock('1')).to.be.revertedWith('ERC721NonexistentToken(1)');
          await expect(lockup.connect(b).unlock('2')).to.be.revertedWith('ERC721NonexistentToken(2)');
          await expect(lockup.ownerOf(1)).to.be.reverted;
          await expect(lockup.ownerOf(2)).to.be.reverted;
        }
      } else {
        await expect(lockup.connect(a).unlock('1')).to.be.reverted;
        await expect(lockup.connect(b).unlock('2')).to.be.reverted;
        expect((await lockup.lockups(1)).amount).to.eq(0);
        expect((await lockup.lockups(2)).amount).to.eq(0);
        expect(await token.balanceOf(a.address)).to.eq(amount);
        expect(await token.balanceOf(b.address)).to.eq(amount);
        await expect(lockup.ownerOf(1)).to.be.reverted;
        await expect(lockup.ownerOf(2)).to.be.reverted;
      }
    }
  });
};

const unlockResetTimeTests = (params, runs) => {
  let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
  let start, cliff, period;
  it('Deploys contract without setting start cliff, distributes lockups, then sets start and cliff and tests unlocking', async () => {
    for (let i = 0; i < runs; i++) {
      console.log(params.name);
      let now = BigInt(await time.latest());
      start = now + BigInt(params.start);
      cliff = now + BigInt(params.cliff);
      period = BigInt(params.period);
      let deployParams = {
        start: 0,
        cliff: 0,
        period,
        transferable: params.transferable
      }
      deployed = await setup(deployParams);
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
      let amount = C.randomBigNum(1000, 5, 18);
      let rate = C.randomBigNum(1000, 1, 15);
      console.log('Amount: ', amount.toString());
      console.log('Rate: ', rate.toString());
      await token.approve(lockup.target, amount * BigInt(3));
      await lockup.createLockup(a.address, amount, rate);
      await lockup.createLockupWithDelegation(b.address, amount, rate, b.address);
      await lockup.updateStartAndCliff(start, cliff);
      let initialUnlock = await lockup.initialUnlock();
      console.log('Initial Unlock: ', initialUnlock.toString());
      console.log('Start: ', start.toString());
      console.log('Cliff: ', cliff.toString());
      now = BigInt(await time.latest());
      if (now < initialUnlock) {
        expect(await lockup.globalLock()).to.eq(true);

        expect(await lockup.initialUnlock()).to.eq(cliff + period);

        now = BigInt(await time.increase(initialUnlock - now + BigInt(1)));
      } else {
        expect(await lockup.globalLock()).to.eq(false);

        now = BigInt(await time.latest());
      }
      let calc = C.calcPlanBalances(start, cliff, amount, rate, period, now + BigInt(1));
      let onchainCalc = await lockup.balanceOfLockup(1, now + BigInt(1));
      expect(calc.unlockedBalance).to.eq(onchainCalc.unlockedBalance);
      expect(calc.lockedBalance).to.eq(onchainCalc.lockedBalance);
      expect(calc.resetTime).to.eq(onchainCalc.unlockTime);
      await lockup.connect(a).unlock('1');
      await lockup.connect(b).unlock('2');
      expect(await token.balanceOf(a.address)).to.eq(calc.unlockedBalance);
      expect(await token.balanceOf(lockup.target)).to.eq(amount - calc.unlockedBalance);
      let vault = await lockup.votingVaults(2);
      if (period > 1) {
        expect(await token.balanceOf(b.address)).to.eq(calc.unlockedBalance);
        expect(await token.balanceOf(vault)).to.eq(amount - calc.unlockedBalance);
      } else {
        if (calc.lockedBalance > 0) {
          expect(await token.balanceOf(b.address)).to.eq(calc.unlockedBalance + rate);
          expect(await token.balanceOf(vault)).to.eq(amount - calc.unlockedBalance - rate);
        } else {
          expect(await token.balanceOf(b.address)).to.eq(calc.unlockedBalance);
          expect(await token.balanceOf(vault)).to.eq(0);
        }
      }
      if (calc.lockedBalance > 0) {
        let lockupA = await lockup.lockups(1);
        expect(lockupA.amount).to.eq(calc.lockedBalance);
        expect(lockupA.rate).to.eq(rate);
        expect(lockupA.resetTime).to.eq(calc.resetTime);
        let lockupB = await lockup.lockups(2);
        if (period > 1) {
          expect(lockupB.amount).to.eq(calc.lockedBalance);
          expect(lockupB.rate).to.eq(rate);
          expect(lockupB.resetTime).to.eq(calc.resetTime);
        } else {
          expect(lockupB.amount).to.eq(calc.lockedBalance - rate);
          expect(lockupB.rate).to.eq(rate);
          expect(lockupB.resetTime).to.eq(calc.resetTime + BigInt(1));
        }
        now = BigInt(await time.increase(C.bigMax(period, 10)));
        calc = C.calcPlanBalances(lockupA.resetTime, cliff, lockupA.amount, rate, period, now + BigInt(1));
        onchainCalc = await lockup.balanceOfLockup(1, now + BigInt(1));
        expect(calc.unlockedBalance).to.eq(onchainCalc.unlockedBalance);
        expect(calc.lockedBalance).to.eq(onchainCalc.lockedBalance);
        expect(calc.resetTime).to.eq(onchainCalc.unlockTime);
        await lockup.connect(a).unlock('1');
        await lockup.connect(b).unlock('2');

        if (calc.lockedBalance > 0) {
          let lockupA = await lockup.lockups(1);
          expect(lockupA.amount).to.eq(calc.lockedBalance);
          expect(lockupA.rate).to.eq(rate);
          expect(lockupA.resetTime).to.eq(calc.resetTime);
          let lockupB = await lockup.lockups(2);
          // expect(lockupB.amount).to.eq(calc.lockedBalance - rate);
          expect(lockupB.rate).to.eq(rate);
          let resetFraction = period == 1 ? BigInt(1) : BigInt(0);
          expect(lockupB.resetTime).to.eq(calc.resetTime + resetFraction);
          let end = C.calcPlanEnd(start, amount, rate, period);
          await time.increaseTo(end);
          await lockup.connect(a).unlock('1');
          await lockup.connect(b).unlock('2');
          expect(await token.balanceOf(a.address)).to.eq(amount);
          expect(await token.balanceOf(b.address)).to.eq(amount);
          expect(await token.balanceOf(lockup.target)).to.eq(0);
          expect(await token.balanceOf(vault)).to.eq(0);
        } else {
          expect((await lockup.lockups(1)).amount).to.eq(0);
          expect((await lockup.lockups(2)).amount).to.eq(0);
          await expect(lockup.connect(a).unlock('1')).to.be.revertedWith('ERC721NonexistentToken(1)');
          await expect(lockup.connect(b).unlock('2')).to.be.revertedWith('ERC721NonexistentToken(2)');
          await expect(lockup.ownerOf(1)).to.be.reverted;
          await expect(lockup.ownerOf(2)).to.be.reverted;
        }
      } else {
        await expect(lockup.connect(a).unlock('1')).to.be.reverted;
        await expect(lockup.connect(b).unlock('2')).to.be.reverted;
        expect((await lockup.lockups(1)).amount).to.eq(0);
        expect((await lockup.lockups(2)).amount).to.eq(0);
        expect(await token.balanceOf(a.address)).to.eq(amount);
        expect(await token.balanceOf(b.address)).to.eq(amount);
        await expect(lockup.ownerOf(1)).to.be.reverted;
        await expect(lockup.ownerOf(2)).to.be.reverted;
      }
    }
  })
};

module.exports = {
  unlockTests,
  unlockSingleTest,
  unlockResetTimeTests,
};
