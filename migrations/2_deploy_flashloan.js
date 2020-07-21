// const Flashloan = artifacts.require("Flashloan.sol");
const VaultManager = artifacts.require("VaultManager.sol");
const DaiFaucet = artifacts.require("DaiFaucet.sol");
const {mainnet: addresses} = require("../addresses");
const TestArbitrage = artifacts.require("TestArbitrage.sol");

module.exports = async function (deployer, _network, [beneficiaryAddress, _]) {
  await deployer.deploy(VaultManager);
  await deployer.deploy(DaiFaucet, addresses.tokens.dai);

  const daiFaucet = await DaiFaucet.deployed();
  await deployer.deploy(
    TestArbitrage,
    addresses.kyber.kyberNetworkProxy,
    addresses.uniswap.router,
    addresses.tokens.weth,
    addresses.tokens.dai,
    daiFaucet.address,
    beneficiaryAddress
  );
};
