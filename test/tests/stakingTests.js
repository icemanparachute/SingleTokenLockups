const C = require('../constants');
const { getSignature, getSignatureBytes } = require('../helpers');
const setup = require('../fixtures');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { createTree, getProof } = require('../merkleGenerator');
const { ethers } = require('hardhat');
const { v4: uuidv4, parse: uuidParse } = require('uuid');
const { lock } = require('ethers');

const claimStakingTests = (constructorParams, lockupParams) => {
  let deployed,
    admin,
    a,
    b,
    c,
    d,
    e,
    defaultDelegate,
    token,
    claimContract,
    lockup,
    domain,
    depositDomain,
    uniLst,
    uniStaker,
    claimHandler;
  let start, cliff, period, periods, end;
  let totalAmount, remainder, campaign, claimLockup, claimA, claimB, claimC, claimD, claimE, id;
  it('Creates claim and wallet A claims, then unlocks and stakes', async () => {
    deployed = await setup(constructorParams);
    admin = deployed.admin;
    a = deployed.a;
    b = deployed.b;
    c = deployed.c;
    d = deployed.d;
    e = deployed.e;
    defaultDelegate = deployed.defaultDelegate;
    token = deployed.token;
    claimContract = deployed.claimContract;
    lockup = deployed.lockup;
    domain = deployed.claimDomain;
    uniLst = deployed.uniLst;
    uniStaker = deployed.uniStaker;
    claimHandler = deployed.claimHandler;
    depositDomain = deployed.depositDomain;
    start = await lockup.start();
    cliff = await lockup.cliff();
    period = await lockup.period();
    await lockup.setClaimContract(claimContract.target);
    expect(await lockup.claimContract()).to.eq(claimContract.target);
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
      start: claimStart,
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
    await claimContract.createLockedCampaign(id, campaign, claimLockup, admin.address, BigInt(treevalues.length));
    expect(await token.balanceOf(claimContract.target)).to.eq(totalAmount);
    // claim
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
    await claimContract.connect(a).claimAndDelegate(id, proof, claimA, delegatee, delegationSig);
    expect(await token.balanceOf(lockup.target)).to.eq(0);
    expect(await token.balanceOf(claimHandler.target)).to.eq(0);
    expect(await lockup.balanceOf(a.address)).to.eq(1);
    expect(await lockup.ownerOf(1)).to.eq(a.address);
    let votingVault = await lockup.votingVaults(1);
    expect(await token.balanceOf(votingVault)).to.eq(claimA);
    expect(await token.delegates(votingVault)).to.eq(delegatee);
    let lock = await lockup.lockups(1);
    expect(lock.amount).to.eq(claimA);
    let calcRate = C.calcPlanRate(claimA, periods);
    expect(lock.rate).to.eq(calcRate);

    let initialUnlock = await lockup.initialUnlock();
    if (initialUnlock > BigInt(await time.latest())) await time.increaseTo(initialUnlock + BigInt(1));
    await uniLst.fetchOrInitializeDepositForDelegatee(delegatee);
    let newDepositId = await uniLst.depositForDelegatee(delegatee);
    console.log('newDepositId', newDepositId);
    now = BigInt(await time.latest());
    let deadline = BigInt(1000) + now;
    const depositValues = {
      account: a.address,
      newDepositId,
      nonce,
      deadline,
    };
    const depositSignature = await getSignatureBytes(a, depositDomain, C.deplositOnBehalfType, depositValues);
    await expect(lockup.connect(a).unlockAndStake('1', nonce, deadline, depositSignature)).to.be.revertedWith(
      'Staking contract not set'
    );
    await lockup.setStakingContract(uniLst.target);
    expect(await lockup.stakingContract()).to.eq(uniLst.target);
    await expect(lockup.connect(b).unlockAndStake('1', nonce, deadline, depositSignature)).to.be.revertedWith('!Owner');
    now = BigInt(await time.latest());
    let calc = await lockup.balanceOfLockup('1', now + BigInt(1));
    await lockup.connect(a).unlockAndStake('1', nonce, deadline, depositSignature);
    let surrogateAddress = await uniStaker.surrogates(delegatee);
    console.log('surrogateAddress', surrogateAddress);
    console.log('calc.unlockedBalance', calc.unlockedBalance);
    console.log(`surrogate balance: ${await token.balanceOf(surrogateAddress)}`);
    expect(await token.balanceOf(surrogateAddress)).to.eq(calc.unlockedBalance);
    expect(await token.balanceOf(uniStaker.target)).to.eq(0);
    expect(await uniLst.balanceOf(a.address)).to.eq(calc.unlockedBalance);
    expect(await uniLst.delegateeForHolder(a.address)).to.eq(delegatee);
    if (calc.lockedBalance > 0) {
      // there is additional amounts to claim, move forward in time a bit at least 1 period or 10 seconds
      console.log('going to next unlock');
      await time.increase(C.bigMax(period, 10));
      now = BigInt(await time.latest());
      calc = await lockup.balanceOfLockup('1', now + BigInt(1));
      let preSurrogateBalance = await token.balanceOf(surrogateAddress);
      console.log('preSurrogateBalance', preSurrogateBalance);
      console.log('calc.unlockedBalance', calc.unlockedBalance);
      deadline = BigInt(1000) + now;
      depositValues.deadline = deadline;
      depositValues.nonce = nonce + 1;
      const depositSignature = await getSignatureBytes(a, depositDomain, C.deplositOnBehalfType, depositValues);
      await lockup.connect(a).unlockAndStake('1', depositValues.nonce, deadline, depositSignature);
      expect(await token.balanceOf(surrogateAddress)).to.eq(calc.unlockedBalance + preSurrogateBalance);
    }
  });
  it('account claims without delegation and cannot unlock and stake', async () => {
    let proof = getProof('./test/trees/tree.json', b.address);
    await claimContract.connect(b).claim(id, proof, claimB);
    expect(await token.balanceOf(lockup.target)).to.eq(claimB);
    expect(await token.balanceOf(claimHandler.target)).to.eq(0);
    expect(await lockup.balanceOf(b.address)).to.eq(1);
    expect(await lockup.ownerOf(2)).to.eq(b.address);
    let now = BigInt(await time.latest());
    await expect(lockup.connect(b).unlockAndStake('2', 0, now + BigInt(1000), '0x')).to.be.revertedWith('vault error');
  });
  it('account B then delegates to a different address and can claim and stake', async () => {
    let now = BigInt(await time.latest());
    let calc = await lockup.balanceOfLockup(2, now + BigInt(1));
    if (calc.lockedBalance > 0) {
      // test unlocking tokens then doing the unlock and stake
      await lockup.connect(b).unlock('2');
    }
    let amount = (await lockup.lockups(2)).amount;
    let delegatee = c.address;
    await lockup.connect(b).delegate('2', delegatee);
    let vault = await lockup.votingVaults(2);
    expect(await token.delegates(vault)).to.eq(delegatee);
    expect(await token.balanceOf(vault)).to.eq(amount);
    await uniLst.fetchOrInitializeDepositForDelegatee(delegatee);
    let newDepositId = await uniLst.depositForDelegatee(delegatee);
    now = BigInt(await time.latest());
    calc = await lockup.balanceOfLockup('2', now + BigInt(1));
    let deadline = BigInt(1000) + now;
    const depositValues = {
      account: b.address,
      newDepositId,
      nonce: 0,
      deadline,
    };
    const depositSignature = await getSignatureBytes(b, depositDomain, C.deplositOnBehalfType, depositValues);
    await lockup.connect(b).unlockAndStake('2', 0, deadline, depositSignature);
    let surrogateAddress = await uniStaker.surrogates(delegatee);
    expect(await token.balanceOf(surrogateAddress)).to.eq(calc.unlockedBalance);
  });
  it('another wallet claims and unlocks with staking to the same delegatee', async () => {
    let proof = getProof('./test/trees/tree.json', c.address);
    const bytes = ethers.encodeBytes32String('blank');
    const delegationSig = {
      nonce: 0,
      expiry: 0,
      v: 0,
      r: bytes,
      s: bytes,
    };
    await claimContract.connect(c).claimAndDelegate(id, proof, claimC, c.address, delegationSig);
    let vault = await lockup.votingVaults(3);
    expect(await token.delegates(vault)).to.eq(c.address);
    expect(await token.balanceOf(vault)).to.eq(claimC);
    let now = BigInt(await time.latest());
    let calc = await lockup.balanceOfLockup('3', now + BigInt(1));
    let depositId = await uniLst.depositForDelegatee(c.address);
    let deadline = BigInt(1000) + now;
    const depositValues = {
      account: c.address,
      newDepositId: depositId,
      nonce: 0,
      deadline,
    };
    const depositSignature = await getSignatureBytes(c, depositDomain, C.deplositOnBehalfType, depositValues);
    let surrogateAddress = await uniStaker.surrogates(c.address);
    let preSurrogateBalance = await token.balanceOf(surrogateAddress);
    await lockup.connect(c).unlockAndStake('3', 0, deadline, depositSignature);
    expect(await token.balanceOf(surrogateAddress)).to.eq(calc.unlockedBalance + preSurrogateBalance);
  });
  it('wallet claims and delegates to the default address, then unlocks and stakes', async () => {
    let proof = getProof('./test/trees/tree.json', d.address);
    const bytes = ethers.encodeBytes32String('blank');
    const delegationSig = {
      nonce: 0,
      expiry: 0,
      v: 0,
      r: bytes,
      s: bytes,
    };
    let delegatee = defaultDelegate.address;
    console.log('default delegatee', delegatee);
    await claimContract.connect(d).claimAndDelegate(id, proof, claimD, delegatee, delegationSig);
    let vault = await lockup.votingVaults(4);
    expect(await token.delegates(vault)).to.eq(delegatee);
    expect(await token.balanceOf(vault)).to.eq(claimD);

    let defaultDepositId = await uniLst.DEFAULT_DEPOSIT_ID();
    console.log('default depositId', defaultDepositId);
    let now = BigInt(await time.latest());
    let calc = await lockup.balanceOfLockup('4', now + BigInt(1));
    let deadline = BigInt(1000) + now;
    const depositValues = {
      account: d.address,
      newDepositId: 0,
      nonce: 0,
      deadline,
    };
    const depositSignature = await getSignatureBytes(d, depositDomain, C.deplositOnBehalfType, depositValues);
    let surrogateAddress = await uniStaker.surrogates(delegatee);
    let preSurrogateBalance = await token.balanceOf(surrogateAddress);
    await lockup.connect(d).unlockAndStake('4', 0, deadline, depositSignature);
    expect(await token.balanceOf(surrogateAddress)).to.eq(calc.unlockedBalance + preSurrogateBalance);
  });
};

const stakingTests = (constructorParams) => {
  let deployed, admin, a, b, c, d, e, token, claimContract, lockup, depositDomain, uniLst, uniStaker;
  let start, cliff, period;
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
    depositDomain = deployed.depositDomain;
    uniLst = deployed.uniLst;
    uniStaker = deployed.uniStaker;
    start = await lockup.start();
    cliff = await lockup.cliff();
    period = await lockup.period();
    await lockup.setStakingContract(uniLst.target);
    await lockup.setClaimContract(claimContract.target);
    expect(await lockup.stakingContract()).to.eq(uniLst.target);
    await token.approve(lockup.target, C.E18_1000000 * BigInt(100000));
  });
  it('admin creates a batch of lockups with delegation', async () => {
    let recipients = [a.address, b.address, c.address, d.address, e.address];
    let amountA = C.randomBigNum(1000, 10, 18);
    let amountB = C.randomBigNum(1000, 10, 18);
    let amountC = C.randomBigNum(1000, 10, 18);
    let amountD = C.randomBigNum(1000, 10, 18);
    let amountE = C.randomBigNum(1000, 10, 18);
    let amounts = [amountA, amountB, amountC, amountD, amountE];
    let rateA = C.randomBigNum(700, 1, 15);
    let rateB = C.randomBigNum(700, 1, 15);
    let rateC = C.randomBigNum(700, 1, 15);
    let rateD = C.randomBigNum(700, 1, 15);
    let rateE = C.randomBigNum(700, 1, 15);
    let rates = [rateA, rateB, rateC, rateD, rateE];
    let delegatees = [a.address, d.address, e.address, d.address, d.address];
    await lockup.createLockupsWithDelegation(recipients, amounts, rates, delegatees);
    let initialUnlock = await lockup.initialUnlock();
    if (initialUnlock > BigInt(await time.latest())) {
      await time.increaseTo(initialUnlock + BigInt(1));
    }
    await uniLst.fetchOrInitializeDepositForDelegatee(a.address);
    let depositIdA = await uniLst.depositForDelegatee(a.address);
    let now = BigInt(await time.latest());
    let calcA = await lockup.balanceOfLockup('1', now + BigInt(1));
    let deadline = BigInt(1000) + now;
    let nonce = 0;
    let depositValues = {
      account: a.address,
      newDepositId: depositIdA,
      nonce,
      deadline,
    };
    let depositSignature = await getSignatureBytes(a, depositDomain, C.deplositOnBehalfType, depositValues);
    await lockup.connect(a).unlockAndStake('1', nonce, deadline, depositSignature);
    expect(await uniLst.balanceOf(a.address)).to.eq(calcA.unlockedBalance);
    expect(await uniLst.delegateeForHolder(a.address)).to.eq(a.address);
    let surrogateA = await uniStaker.surrogates(a.address);
    expect(await token.balanceOf(surrogateA)).to.eq(calcA.unlockedBalance);
    // unlock and stake for b
    await uniLst.fetchOrInitializeDepositForDelegatee(d.address);
    let depositIdD = await uniLst.depositForDelegatee(d.address);
    now = BigInt(await time.latest());
    let calcB = await lockup.balanceOfLockup('2', now + BigInt(1));
    depositValues = {
      account: b.address,
      newDepositId: depositIdD,
      nonce,
      deadline,
    };
    depositSignature = await getSignatureBytes(b, depositDomain, C.deplositOnBehalfType, depositValues);
    await lockup.connect(b).unlockAndStake('2', nonce, deadline, depositSignature);
    expect(await uniLst.balanceOf(b.address)).to.eq(calcB.unlockedBalance);
    expect(await uniLst.delegateeForHolder(b.address)).to.eq(d.address);
    let surrogateB = await uniStaker.surrogates(d.address);
    expect(await token.balanceOf(surrogateB)).to.eq(calcB.unlockedBalance);
    // unlock and stake for c
    await uniLst.fetchOrInitializeDepositForDelegatee(e.address);
    let depositIdE = await uniLst.depositForDelegatee(e.address);
    now = BigInt(await time.latest());
    let calcC = await lockup.balanceOfLockup('3', now + BigInt(1));
    depositValues = {
      account: c.address,
      newDepositId: depositIdE,
      nonce,
      deadline,
    };
    depositSignature = await getSignatureBytes(c, depositDomain, C.deplositOnBehalfType, depositValues);
    await lockup.connect(c).unlockAndStake('3', nonce, deadline, depositSignature);
    expect(await uniLst.balanceOf(c.address)).to.eq(calcC.unlockedBalance);
    expect(await uniLst.delegateeForHolder(c.address)).to.eq(e.address);
    let surrogateC = await uniStaker.surrogates(e.address);
    expect(await token.balanceOf(surrogateC)).to.eq(calcC.unlockedBalance);
    // unlock and stake for d
    await uniLst.fetchOrInitializeDepositForDelegatee(d.address);
    let depositIdD2 = await uniLst.depositForDelegatee(d.address);
    now = BigInt(await time.latest());
    let calcD = await lockup.balanceOfLockup('4', now + BigInt(1));
    depositValues = {
      account: d.address,
      newDepositId: depositIdD2,
      nonce,
      deadline,
    };
    depositSignature = await getSignatureBytes(d, depositDomain, C.deplositOnBehalfType, depositValues);
    let surrogateD = await uniStaker.surrogates(d.address);
    let preSurrogateBalance = await token.balanceOf(surrogateD);
    await lockup.connect(d).unlockAndStake('4', nonce, deadline, depositSignature);
    expect(await uniLst.balanceOf(d.address)).to.eq(calcD.unlockedBalance);
    expect(await uniLst.delegateeForHolder(d.address)).to.eq(d.address);
    expect(await token.balanceOf(surrogateD)).to.eq(calcD.unlockedBalance + preSurrogateBalance);
    // unlock and stake for e
    await uniLst.fetchOrInitializeDepositForDelegatee(d.address);
    let depositIdD3 = await uniLst.depositForDelegatee(d.address);
    now = BigInt(await time.latest());
    let calcE = await lockup.balanceOfLockup('5', now + BigInt(1));
    depositValues = {
      account: e.address,
      newDepositId: depositIdD3,
      nonce,
      deadline,
    };
    depositSignature = await getSignatureBytes(e, depositDomain, C.deplositOnBehalfType, depositValues);
    let surrogateE = await uniStaker.surrogates(d.address);
    preSurrogateBalance = await token.balanceOf(surrogateE);
    await lockup.connect(e).unlockAndStake('5', nonce, deadline, depositSignature);
    expect(await uniLst.balanceOf(e.address)).to.eq(calcE.unlockedBalance);
    expect(await uniLst.delegateeForHolder(e.address)).to.eq(d.address);
    expect(await token.balanceOf(surrogateE)).to.eq(calcE.unlockedBalance + preSurrogateBalance);
  });
  it('fails if a lockup has not delegated', async () => {
    await lockup.createLockup(a.address, C.E18_1000, C.E18_1000);
    await expect(lockup.connect(a).unlockAndStake('6', 0, 0, '0x')).to.be.revertedWith('vault error');
  });
};

module.exports = {
  claimStakingTests,
  stakingTests,
};
