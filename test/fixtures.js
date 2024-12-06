const { ethers } = require('hardhat');
const C = require('./constants');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

module.exports = async (params) => {
    const [admin, a, b, c, d, e, defaultDelegate] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('Token');
    const supply = BigInt(10 ** 18) * BigInt(1000000);
    const token = await Token.deploy('Token', 'TKN', supply, 18);
    await token.waitForDeployment();
    

    const Staking = await ethers.getContractFactory('TestStaking');
    const staking = await Staking.deploy(token.target);
    await staking.waitForDeployment();

    let now = BigInt(await time.latest());
    let start = params.start == 0 ? 0 : now + BigInt(params.start);
    let cliff = params.cliff == 0 ? 0 : now + BigInt(params.cliff);
    const Lockup = await ethers.getContractFactory('SingleTokenLockups');
    const lockup = await Lockup.deploy(token.target, admin.address, params.transferable, start, cliff, params.period, 'TokenLockups', 'TL');
    await lockup.waitForDeployment();
    const claimHandler = (await ethers.getContractFactory('ClaimHandler')).attach(await lockup.claimHandler());

    const ClaimContract = await ethers.getContractFactory('ClaimCampaigns');
    const claimName = 'ClaimCampaigns'
    const version = '1';
    const claimContract = await ClaimContract.deploy(admin.address, claimName, version, [claimHandler.target]);
    await claimContract.waitForDeployment();

    const UniStaker = await ethers.getContractFactory('UniStaker');
    const uniStaker = await UniStaker.deploy(token.target, token.target, admin.address);
    await uniStaker.waitForDeployment();

    const UniLST = await ethers.getContractFactory('UniLst');
    const uniLst = await UniLST.deploy('UNISLT', 'UNILST', uniStaker.target, defaultDelegate.address, admin.address, 0, admin.address);

    const tokenDomain = {
        name: 'Token',
        version,
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: token.target,
    }
    const claimDomain = {
        name: claimName,
        version,
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: claimContract.target,
    }
    const depositDomain = {
        name: 'UniLst',
        version,
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: uniLst.target,
    }
    return {
        admin,
        a,
        b,
        c,
        d,
        e,
        defaultDelegate,
        claimContract,
        token,
        staking,
        lockup,
        claimHandler,
        tokenDomain,
        claimDomain,
        depositDomain,
        uniStaker,
        uniLst,
    }
}