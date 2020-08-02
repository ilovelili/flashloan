require("dotenv").config();
const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.INFURA_URI));

module.exports = {
  networks: {
    mainnet: {
      networkCheckTimeout: 10000,
      provider: () => new HDWalletProvider(process.env.PRIVATE_KEY, process.env.INFURA_URI),
      network_id: 1,
      gasPrice: web3.utils.toWei("41", "gwei"), // https://ethgasstation.info/
      gas: 6000000,
    },
    testnet: {
      networkCheckTimeout: 10000,
      provider: () => new HDWalletProvider(process.env.PRIVATE_KEY, process.env.INFURA_TESTNET_URI),
      network_id: 42,
      gasPrice: web3.utils.toWei("56", "gwei"),
    },
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
    },
    mainnetFork: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      skipDryRun: true,
    },
    tenderly: {
      host: "127.0.0.1",
      port: 9545,
      network_id: "*",
      gasPrice: 0,
    },
  },
};
