require("dotenv").config();
const chalk = require("chalk");
const Web3 = require("web3");
const abis = require("./abis");
const useMainnet = process.env.MAINNET === "true";
const {mainnet: addresses} = require("./addresses");
const Flashloan = require("./build/contracts/Flashloan.json");
const VaultManager = require("./build/contracts/VaultManager.json");
const DaiFaucet = require("./build/contracts/DaiFaucet.json");

const provider = useMainnet
  ? process.env.INFURA_URI
  : process.env.LOCALHOST_URI;

const web3 = new Web3(new Web3.providers.WebsocketProvider(provider));

const AMOUNT_DAI_WEI = web3.utils.toWei((10 * 230).toString());
const DIRECTION = {
  KYBER_TO_UNISWAP: 0,
  UNISWAP_TO_KYBER: 1,
};

const {address: admin} = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);

async function init() {
  console.log(`Using mainnet: ${useMainnet}`);
  const networkId = await web3.eth.net.getId();
  console.log(`NetworkId is ${networkId}`);

  const daiFaucetAddress = DaiFaucet.networks[networkId].address;
  const flashloan = new web3.eth.Contract(
    Flashloan.abi,
    Flashloan.networks[networkId].address
  );

  const vaultManager = new web3.eth.Contract(
    VaultManager.abi,
    VaultManager.networks[networkId].address
  );

  const dai = new web3.eth.Contract(abis.tokens.erc20, addresses.tokens.dai);
  const DAI_FROM_MAKER = web3.utils.toWei("10");

  console.log(`Borrowing ${web3.utils.fromWei(DAI_FROM_MAKER)} DAI from Maker`);
  await vaultManager.methods
    .openVault(
      addresses.makerdao.CDP_MANAGER,
      addresses.makerdao.MCD_JUG,
      addresses.makerdao.MCD_JOIN_ETH_A,
      addresses.makerdao.MCD_JOIN_DAI,
      DAI_FROM_MAKER
    )
    .send({
      from: admin,
      gas: 1000000,
      gasPrice: 1,
      value: web3.utils.toWei("10"),
    });

  const daiAdminBalance = await dai.methods.balanceOf(admin).call();
  console.log(
    `DAI balance of Your account: ${web3.utils.fromWei(daiAdminBalance)}`
  );

  console.log(
    `Transfering ${web3.utils.fromWei(DAI_FROM_MAKER)} DAI to DaiFaucet`
  );
  await dai.methods.transfer(daiFaucetAddress, DAI_FROM_MAKER).send({
    from: admin,
    gas: 200000,
    gasPrice: 1,
  });
  const daiFaucetBalance = await dai.methods.balanceOf(daiFaucetAddress).call();
  console.log(
    `DAI balance of DaiFaucet: ${web3.utils.fromWei(daiFaucetBalance)}`
  );

  const [tx1, tx2] = Object.keys(DIRECTION).map((direction) =>
    flashloan.methods.initiateFlashloan(
      addresses.dydx.solo,
      addresses.tokens.dai,
      AMOUNT_DAI_WEI,
      DIRECTION[direction]
    )
  );

  const gasPrice = await web3.eth.getGasPrice();
  const gasCost = 1000000;

  console.log("initiating flashloan Kyber => Uniswap");
  const r = await tx2.send({
    from: admin,
    gas: gasCost,
    gasPrice,
  });

  console.log(chalk.yellow(r));
}

init();
