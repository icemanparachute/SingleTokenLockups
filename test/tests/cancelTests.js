const C = require('../constants');
const { getSignature } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const cancelTests = () => {
    let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
    it('Deploys the contracts', async () => {
      let params = {
        start: 0,
        cliff: 0,
        period: 1,
        transferable: true,
      }
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
    });
    it('admin distributes lockups manually and admin cancels one', async () => {
      let recipients = [a.address, b.address, c.address, d.address, e.address];
      let amounts = [C.E18_100, C.E18_100, C.E18_100, C.E18_100, C.E18_100];
      let rates = [C.E18_1, C.E18_1, C.E18_1, C.E18_1, C.E18_1];
      await token.approve(lockup.target, C.E18_1000);
      await lockup.createLockups(recipients, amounts, rates);
      let totalBalance = C.E18_100 * BigInt(5);
      expect(await token.balanceOf(lockup.target)).to.eq(totalBalance);
      expect(await lockup.ownerOf('1')).to.eq(a.address);
      expect(await lockup.balanceOf(a.address)).to.eq(1);
      expect(await lockup.cancelLockups(['1'])).to.emit(lockup, 'LockupCancelled');
      expect(await lockup.balanceOf(a.address)).to.eq(0);
      await expect(lockup.ownerOf('1')).to.be.reverted;
      expect(await token.balanceOf(lockup.target)).to.eq(totalBalance - C.E18_100);
    });
    it('not admin cannot cancel lockups', async () => {
      await expect(lockup.connect(a).cancelLockups(['2'])).to.be.revertedWith('!Admin');
    })
    it('admin sets start and cliff to future date and then is still able to cancel a lockup', async () => {
      let now = BigInt(await time.latest());
      let start = now + BigInt(86400);
      let cliff = start;
      await lockup.updateStartAndCliff(start, cliff);
      expect(await lockup.ownerOf('2')).to.eq(b.address);
      await lockup.cancelLockups(['2']);
      expect(await lockup.balanceOf(b.address)).to.eq(0);
      await expect(lockup.ownerOf('2')).to.be.reverted;
      expect(await token.balanceOf(lockup.target)).to.eq(C.E18_100 * BigInt(3));
    });
    it('user delegates tokens, setting up a voting vault and then lockup is cancelled', async () => {
      let preAdminBalance = await token.balanceOf(admin.address);
      let preLockupBalance = await token.balanceOf(lockup.target);
      await lockup.connect(c).delegate(3, c.address);
      let vault = await lockup.votingVaults(3);
      expect(await token.balanceOf(vault)).to.eq(C.E18_100);
      await lockup.cancelLockups(['3']);
      // expect admin balance to increase by the amount of the cancelled lockup
      expect(await token.balanceOf(admin.address)).to.eq(preAdminBalance + C.E18_100);
      // expect lockup contract balance to be unchanged
      expect(await token.balanceOf(lockup.target)).to.eq(preLockupBalance - C.E18_100);
      // expect voting vault to be empty
      expect(await token.balanceOf(vault)).to.eq(0);
    })
    it('can cancel all lockups in single transaction', async () => {
      // create additional lockups
      let recipients = [a.address, b.address, c.address, d.address, e.address];
      let amounts = [C.E18_100, C.E18_100, C.E18_100, C.E18_100, C.E18_100];
      let rates = [C.E18_1, C.E18_1, C.E18_1, C.E18_1, C.E18_1];
      await token.approve(lockup.target, C.E18_1000);
      await lockup.createLockups(recipients, amounts, rates);
      // users delegate tokens
      await lockup.connect(d).delegate(4, d.address);
      let vault4 = await lockup.votingVaults(4);
      await lockup.connect(e).delegate(5, e.address);
      let vault5 = await lockup.votingVaults(5);
      await lockup.connect(a).delegate(6, a.address);
      let vault6 = await lockup.votingVaults(6);
      await lockup.connect(b).delegate(7, b.address);
      let vault7 = await lockup.votingVaults(7);
      await lockup.connect(c).delegate(8, c.address);
      let vault8 = await lockup.votingVaults(8);
      await lockup.connect(d).delegate(9, d.address);
      let vault9 = await lockup.votingVaults(9);
      await lockup.connect(e).delegate(10, e.address);
      let vault10 = await lockup.votingVaults(10);
      expect(await token.balanceOf(lockup.target)).to.eq(0);
      let preAdminBalance = await token.balanceOf(admin.address);
      // cancel all lockups
      await lockup.cancelAllLockups();
      expect(await token.balanceOf(admin.address)).to.eq(preAdminBalance + (C.E18_100 * BigInt(7)));
      expect(await token.balanceOf(lockup.target)).to.eq(0);
      expect(await token.balanceOf(vault4)).to.eq(0);
      expect(await token.balanceOf(vault5)).to.eq(0);
      expect(await token.balanceOf(vault6)).to.eq(0);
      expect(await token.balanceOf(vault7)).to.eq(0);
      expect(await token.balanceOf(vault8)).to.eq(0);
      expect(await token.balanceOf(vault9)).to.eq(0);
      expect(await token.balanceOf(vault10)).to.eq(0);
      expect(await lockup.totalSupply()).to.eq(0);
      expect(await lockup.balanceOf(a.address)).to.eq(0);
      expect(await lockup.balanceOf(b.address)).to.eq(0);
      expect(await lockup.balanceOf(c.address)).to.eq(0);
      expect(await lockup.balanceOf(d.address)).to.eq(0);
      expect(await lockup.balanceOf(e.address)).to.eq(0);
    });
    it('cancels a set of tokens including one that has been cancelled', async () => {
      let recipients = [a.address, b.address, c.address, d.address, e.address];
      let amounts = [C.E18_100, C.E18_100, C.E18_100, C.E18_100, C.E18_100];
      let rates = [C.E18_1, C.E18_1, C.E18_1, C.E18_1, C.E18_1];
      await token.approve(lockup.target, C.E18_1000);
      await lockup.createLockups(recipients, amounts, rates);
      expect(await token.balanceOf(lockup.target)).to.eq(C.E18_100 * BigInt(5));
      expect(await lockup.ownerOf(12)).to.eq(b.address);
      await lockup.cancelLockups(['1', '2', '3', '4', '5', '12']);
      await expect(lockup.ownerOf(12)).to.be.reverted;
      expect(await token.balanceOf(lockup.target)).to.eq(C.E18_100 * BigInt(4));
    })
    it('admin creates more lockups after start and cliff have passed, and cannot cancel anymore', async () => {
      await time.increase(96400);
      expect(await lockup.ownerOf(11)).to.eq(a.address);
      await expect(lockup.cancelLockups([11])).to.be.revertedWith('Cannot cancel');
      await expect(lockup.cancelAllLockups()).to.be.revertedWith('Cannot cancel');
      // expect the call to have returned 0 and no effect
      expect(await lockup.ownerOf(11)).to.eq(a.address);
      expect(await lockup.balanceOf(a.address)).to.eq(1);
      expect(await token.balanceOf(lockup.target)).to.eq(C.E18_100 * BigInt(4));
      await lockup.connect(a).delegate(11, a.address);
      await lockup.connect(a).unlock(11);
    });
    
  };
  
  module.exports = {
    cancelTests,
  };