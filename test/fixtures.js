const { ethers } = require('hardhat');
const C = require('./constants');

module.exports = async (params) => {
    const [admin, a, b, c, d, e] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('Token');
    const supply = BigInt(10 ** 18) * BigInt(1000000);
    const token = await Token.deploy('Token', 'TKN', supply, 18);
    await token.waitForDeployment();
    

    const Staking = await ethers.getContractFactory('TestStaking');
    const staking = await Staking.deploy(token.target);
    await staking.waitForDeployment();

    const Lockup = await ethers.getContractFactory('SingleTokenLockups');
    const lockup = await Lockup.deploy(token.target, admin.address, params.transferable, params.start, params.cliff, params.period, 'TokenLockups', 'TL');
    await lockup.waitForDeployment();
    const claimHandler = (await ethers.getContractFactory('ClaimHandler')).attach(await lockup.claimHandler());

    const ClaimContract = await ethers.getContractFactory('ClaimCampaigns');
    const claimName = 'ClaimCampaigns'
    const version = '1';
    const claimContract = await ClaimContract.deploy(admin.address, claimName, version, [claimHandler.target]);
    await claimContract.waitForDeployment();

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
    return {
        admin,
        a,
        b,
        c,
        d,
        e,
        claimContract,
        token,
        staking,
        lockup,
        claimHandler,
        tokenDomain,
        claimDomain,
    }
}