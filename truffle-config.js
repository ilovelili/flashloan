require("dotenv").config();
const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");
const web3 = new Web3(
  new Web3.providers.WebsocketProvider(process.env.INFURA_URI)
);

module.exports = {
  networks: {
    mainnet: {
      provider: () =>
        new HDWalletProvider(process.env.PRIVATE_KEY, process.env.INFURA_URI),
      network_id: 1,
      gasPrice: web3.utils.toWei("25", "gwei"), // https://ethgasstation.info/
    },
    mainnetFork: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
      skipDryRun: true,
    },
    testnet: {
      provider: () =>
        new HDWalletProvider(
          process.env.PRIVATE_KEY,
          process.env.TESTNET_INFURA_URI
        ),
      network_id: 42,
      gasPrice: web3.utils.toWei("22", "gwei"),
    },
  },
};
