const C = require('../constants');
const { getSignature } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const claimStakingTests = (constructorParams) => {
    let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, uniLst, uniStaker, claimHandler;
    let start, cliff, period, periods, end;
    let totalAmount, remainder, campaign, claimLockup, claimA, claimB, claimC, claimD, claimE, id;
    it('Deploys the contracts, and sets the staking contract', async () => {
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
      uniLst = deployed.uniLst;
      uniStaker = deployed.uniStaker;
      claimHandler = deployed.claimHandler;
      await lockup.setStakingContract(uniLst.target);
      await lockup.setClaimContract(claimContract.target);
      expect(await lockup.stakingContract()).to.eq(uniLst.target);
    });
    it('creates claim campaign, users claim & delegate tokens, then unlock & stake', async () => {

    });
  };

  const stakingTests = (constructorParams) => {
    let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, uniLst, uniStaker, claimHandler;
    let start, cliff, period, periods, end;
    let totalAmount, remainder, campaign, claimLockup, claimA, claimB, claimC, claimD, claimE, id;
    it('Deploys the contracts, and sets the staking contract', async () => {
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
      uniLst = deployed.uniLst;
      uniStaker = deployed.uniStaker;
      claimHandler = deployed.claimHandler;
      await lockup.setStakingContract(uniLst.target);
      await lockup.setClaimContract(claimContract.target);
      expect(await lockup.stakingContract()).to.eq(uniLst.target);
    });
    it('admin creates a batch of lockups with delegation', async () => {

    });
    it('admin creates a batch of lockups without delegation', async () => {

    });
    it('recipients unlock and stake tokens', async () => {

    });
    it('recipients that have not delegated cannot unlock and stake', async () => {

    });
    it('recipients that delegate to 0x0 address unlock and stake, delegating to the default delegatee', async () => {

    });
  }
  
  module.exports = {
    claimStakingTests,
  };