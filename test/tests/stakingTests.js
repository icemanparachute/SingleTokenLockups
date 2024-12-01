const C = require('../constants');
const { getSignature } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const stakingTests = (constructorParams) => {
    let deployed, admin, a, b, c, d, e, token, claimContract, lockup, domain, staking, claimHandler;
    let start, cliff, period, periods, end;
    let totalAmount, remainder, campaign, claimLockup, claimA, claimB, claimC, claimD, claimE, id;
    it('Deploys the contracts, and ', async () => {
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
    });
    it('admin creates a campaign and users claim tokens with delegation', async () => {

    });
    it('admin sets single unlock date, but users cannot claim & stake as staking contract is not set', async () => {

    });
    it('only admin can set staking contract', async () => {

    });
    it('with staking contract set, users can unlock and stake, maintaining delegations', async () => {

    });
  };
  
  module.exports = {
    stakingTests,
  };