const C = require('./constants');
const { happyPath } = require('./tests/happyPath');
const { adminTests } = require('./tests/adminTests');
const { cancelTests } = require('./tests/cancelTests');
const { claimTests } = require('./tests/claimTests');
const { manualCreateTests } = require('./tests/manualCreateTests');
const { stakingTests } = require('./tests/stakingTests');
const { unlockTests } = require('./tests/unlockTests');
const { time } = require('@nomicfoundation/hardhat-network-helpers');


const constructorParams = [
  {
    name: 'Not Set, Transferable, Linear',
    transferable: true,
    start: 0,
    cliff: 0,
    period: 1,
  },
  {
    name: 'Set, transferable, periodic monthly, with 2 month cliff',
    transferable: true,
    start: 1,
    cliff: BigInt(60*60*24*30 * 2),
    period: BigInt(60*60*24*30),
  },
  {
    name: 'Set, transferable, linear, already started',
    transferable: true,
    start: BigInt(1),
    cliff: BigInt(1),
    period: BigInt(1),
  }
];

const lockupParams = [
  {
    name: 'Single Unlock',
    cliff: 0,
    period: 1,
    periods: 1,
  },
  {
    name: 'Linear Unlock',
    cliff: 0,
    period: 1,
    periods: BigInt(100),
  },
  {
    name: 'Monthly Unlock',
    cliff: BigInt(60*60*24*30),
    period: BigInt(60*60*24*30),
    periods: BigInt(6),
  }
];

// describe('Testing the happy path', async () => {
//   constructorParams.forEach((params) => {
//     lockupParams.forEach((lockup) => {
//       happyPath(params, lockup);
//     });
//   });
// });

// describe('Testing the admin functions', async () => {
//   adminTests(constructorParams[0]);
// })

// describe('Testing the cancel functions', async () => {
//   cancelTests();
// }) 


// describe('Testing the claim functions', async () => {
//   constructorParams.forEach((params) => {
//     lockupParams.forEach((lockup) => {
//       claimTests(params, lockup);
//     });
//   });
// });

describe('Testing the manual create functions', async () => {
  constructorParams.forEach((params) => {
    manualCreateTests(params);
  });
});