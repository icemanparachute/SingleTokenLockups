const C = require('./constants');
const { happyPath } = require('./tests/happyPath');

const constructorParams = [
  {
    name: 'Not Set, Transferable, Linear',
    transferable: true,
    start: 0,
    cliff: 0,
    period: 1,
  },
];

const lockupParams = [
  // {
  //   name: 'Single Unlock',
  //   cliff: 0,
  //   period: 1,
  //   periods: 1,
  // },
  {
    name: 'Linear Unlock',
    cliff: 0,
    period: 1,
    periods: 100,
  },
];

describe('Testing the happy path', async () => {
  constructorParams.forEach((params) => {
    lockupParams.forEach((lockup) => {
      console.log(`Testing ${params.name} ${lockup.name}`);
      happyPath(params, lockup);
    });
  });
});
