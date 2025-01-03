const { ethers, run } = require('hardhat');
const { setTimeout } = require('timers/promises');

async function deployLockups(admin, name, symbol) {
    // const Token = await ethers.getContractFactory('Token');
    // const supply = BigInt(10 ** 18) * BigInt(1000000);
    // const token = await Token.deploy('Wowza', 'WOWZA', supply, 18);
    // await token.waitForDeployment();
    // console.log('Token:', token.target);
    const token = {
        network: 'sepolia',
        target: '0x04Ce226c0A2cd9e987649ef9171a34d99c5D0D3e'
    }

    const Lockup = await ethers.getContractFactory('SingleTokenLockups');
    const lockup = await Lockup.deploy(token.target, admin, true, 0, 0, 1, name, symbol);
    await lockup.waitForDeployment();
    console.log('Lockup:', lockup.target);

    const claimHandler = (await ethers.getContractFactory('ClaimHandler')).attach(await lockup.claimHandler());
    console.log('ClaimHandler:', claimHandler.target);

    const ClaimContract = await ethers.getContractFactory('ClaimCampaigns');
    const claimName = 'ClaimCampaigns'
    const version = '1';
    const claimContract = await ClaimContract.deploy(admin, claimName, version, [claimHandler.target]);
    await claimContract.waitForDeployment();
    console.log('ClaimContract:', claimContract.target);

    const UniStaker = await ethers.getContractFactory('UniStaker');
    const uniStaker = await UniStaker.deploy(token.target, token.target, admin);
    await uniStaker.waitForDeployment();
    console.log('UniStaker:', uniStaker.target);

    const UniLST = await ethers.getContractFactory('UniLst');
    const uniLst = await UniLST.deploy('UNISLT', 'UNILST', uniStaker.target, '0x45B93b372c2D2071d99755d06925483F3ee95da6', admin, 0, admin);
    await uniLst.waitForDeployment();
    
    
    
    
    
    console.log('UniLST:', uniLst.target);
    setTimeout(15000);
    await run('verify:verify', {
        address: token.target,
        constructorArguments: ['Wowza', 'WOWZA', supply, 18]
    });
    await run('verify:verify', {
        address: lockup.target,
        constructorArguments: [token.target, admin, true, 0, 0, 1, name, symbol]
    });
    await run('verify:verify', {
        address: claimHandler.target,
        constructorArguments: [token.target]
    });
    await run('verify:verify', {
        address: claimContract.target,
        constructorArguments: [admin, claimName, version, [claimHandler.target]]
    });
    await run('verify:verify', {
        address: uniStaker.target,
        constructorArguments: [token.target, token.target, admin]
    });
    await run('verify:verify', {
        address: uniLst.target,
        constructorArguments: ['UNISLT', 'UNILST', uniStaker.target, '0x45B93b372c2D2071d99755d06925483F3ee95da6', admin, 0, admin]
    });
}


deployLockups('0x98457E13DDFFD3DbA645688EDBf3a159359b730d', 'WowzaLockups', 'WOZALOCK')