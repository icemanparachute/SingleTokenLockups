const C = require('./constants');
const { lockedDelegatingTests } = require('./tests/lockedDelegatingTests');


describe('Testing the locked delegating tests', async () => {
    const lockupParams = {
        cliff: 0,
        period: 1,
        periods: 1,
    }
    lockedDelegatingTests();
})