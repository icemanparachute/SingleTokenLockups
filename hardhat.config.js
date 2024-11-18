
require('@nomicfoundation/hardhat-ethers');
require('dotenv').config();
require('@nomicfoundation/hardhat-chai-matchers');
require('@nomicfoundation/hardhat-verify');

module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
    holesky: {
      url: process.env.HOLESKY_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY, process.env.TOKEN_DEPLOYER],
    },
    mainnet: {
      url: process.env.MAINNET_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY, process.env.TOKEN_DEPLOYER],
    },
  },
  etherscan: {
    customChains: [
      {
        network: 'holesky',
        chainId: 17000,
        urls: {
          apiURL: 'https://api-holesky.etherscan.io/api',
          browserURL: 'https://holesky.etherscan.io/',
        },
      },
    ],
    apiKey: {
      sepolia: process.env.ETHERSCAN_APIKEY,
      holesky: process.env.ETHERSCAN_APIKEY,
      mainnet: process.env.ETHERSCAN_APIKEY,
    },
  },
};
