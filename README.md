# SingleTokenLockups  
Repository for the Token Lockups by Hedgey - where the escrow lockup contract is meant for usage of Only one token, and a uniform universal lockup schedule that all recipients adhere to. 
The lockup schedule can be adjusted by an Admin, set after the deployment of the contract, and interacts with the Hedgey ClaimCampaigns contract, as well as the UniStaker and UniLST contracts.  

For technical documentation please see [Single Lockup Technical Architecture](https://docs.google.com/document/d/1dizKFFMqDlNiJxmKUvy-JRX0_h7etV9DXYHsHUqmgM4/edit?usp=sharing)


## Testing

Clone repistory

``` bash
npm install
npx hardhat compile
npx hardhat test
```

## Deployment


``` bash
npx hardhat run scripts/deploy.js --network <network-name>
```

## Testnet Deployments
  
Sepolia address: ``
Holesky address: ``

## Mainnet Deployments

Deployed address: ``   
