require("dotenv").config();

const Ganache = require("ganache-core");
const Web3 = require("web3");
const chalk = require("chalk");

// const abis = require("../abis");

// const {mainnet: addresses} = require("../addresses");
// const TestArbitrage = require("../build/contracts/TestArbitrage.json");
// const DaiFaucet = require("../build/contracts/DaiFaucet.json");

// const AMOUNT_ETH = 10;
// const RECENT_ETH_PRICE = 230;

// const AMOUNT_DAI_WEI = web3.utils.toWei(
//   (AMOUNT_ETH * RECENT_ETH_PRICE).toString()
// );

// const DIRECTION = {
//   KYBER_TO_UNISWAP: 0,
//   UNISWAP_TO_KYBER: 1,
// };

jest.setTimeout(100000);

// start chain (mainnet or mainnet fork)
async function startChain() {
  const useMainnet = process.env.MAINNET === "true";

  useMainnet
    ? console.log(chalk.red("Running on MAINNET!"))
    : console.log(chalk.green("Running on fork"));

  console.log(process.env.INFURA_URI);

  let provider;

  if (useMainnet) {
    provider = process.env.INFURA_URI;
  } else {
    provider = Ganache.provider({
      fork: process.env.INFURA_URI,
      network_id: 1,
      accounts: [
        {
          secretKey: process.env.PRIVATE_KEY,
          balance: Web3.utils.toHex(Web3.utils.toWei("1000")),
        },
      ],
      gasLimit: 2000000,
    });
  }

  const web3 = new Web3(provider);
  // returns account address
  return web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY).address;

  /***
   * const web3 = new Web3(new Web3.providers.WebsocketProvider(provider));

const AMOUNT_ETH = config.amount_eth;
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString());

const DIRECTION = {
  KYBER_TO_UNISWAP: 0,
  UNISWAP_TO_KYBER: 1,
};

const {address: admin} = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);

   * 
   * 
   */
}

describe("Flashloan testing", () => {
  let admin;

  beforeAll(async () => {
    admin = await startChain();
    console.log(`admin is ${admin}`);
  });

  test("admin should be initialized", () => {
    expect(admin).not.toBe(undefined);
    expect(admin).not.toBe("");
  });
});

// async function init() {
//   console.log(`Using mainnet: ${useMainnet}`);
//   const networkId = await web3.eth.net.getId();
//   console.log(`NetworkId is ${networkId}`);

//   const daiFaucetAddress = DaiFaucet.networks[networkId].address;
//   const flashloan = new web3.eth.Contract(
//     Flashloan.abi,
//     Flashloan.networks[networkId].address
//   );

//   const vaultManager = new web3.eth.Contract(
//     VaultManager.abi,
//     VaultManager.networks[networkId].address
//   );

//   const dai = new web3.eth.Contract(abis.tokens.erc20, addresses.tokens.dai);
//   const DAI_FROM_MAKER = web3.utils.toWei("10");

//   console.log(`Borrowing ${web3.utils.fromWei(DAI_FROM_MAKER)} DAI from Maker`);

//   // start chain
//   const admin = await startChain();
//   console.log(`admin is ${admin}`);

//   // await vaultManager.methods
//   //   .openVault(
//   //     addresses.makerdao.CDP_MANAGER,
//   //     addresses.makerdao.MCD_JUG,
//   //     addresses.makerdao.MCD_JOIN_ETH_A,
//   //     addresses.makerdao.MCD_JOIN_DAI,
//   //     DAI_FROM_MAKER
//   //   )
//   //   .send({
//   //     from: admin,
//   //     gas: 2000000,
//   //     gasPrice: 1,
//   //     value: web3.utils.toWei("10"),
//   //   });

//   // const daiAdminBalance = await dai.methods.balanceOf(admin).call();
//   // console.log(
//   //   `DAI balance of Your account: ${web3.utils.fromWei(daiAdminBalance)}`
//   // );

//   // const flashloan = new web3.eth.Contract(
//   //   TestArbitrage.abi,
//   //   TestArbitrage.networks[networkId].address
//   // );

//   // const dai = new web3.eth.Contract(abis.tokens.erc20, addresses.tokens.dai);
//   // const DAI_AMOUNT = web3.utils.toWei("10");

//   // console.log(`Transfering ${web3.utils.fromWei(DAI_AMOUNT)} DAI to DaiFaucet`);

//   // const daiFaucetAddress = DaiFaucet.networks[networkId].address;
//   // await dai.methods.transfer(daiFaucetAddress, DAI_AMOUNT).send({
//   //   from: admin,
//   //   gas: 200000,
//   //   gasPrice: 1,
//   // });
//   // const daiFaucetBalance = await dai.methods.balanceOf(daiFaucetAddress).call();
//   // console.log(
//   //   `DAI balance of DaiFaucet: ${web3.utils.fromWei(daiFaucetBalance)}`
//   // );

//   // const [tx1, tx2] = Object.keys(DIRECTION).map((direction) =>
//   //   flashloan.methods.initiateFlashloan(
//   //     addresses.dydx.solo,
//   //     addresses.tokens.dai,
//   //     AMOUNT_DAI_WEI,
//   //     DIRECTION[direction]
//   //   )
//   // );

//   // const gasPrice = await web3.eth.getGasPrice();
//   // const gasCost = 1000000;

//   // console.log("initiating flashloan Kyber => Uniswap");
//   // const r = await tx1.send({
//   //   from: admin,
//   //   gas: gasCost,
//   //   gasPrice,
//   // });

//   // console.log(chalk.yellow(r));
// }

// init();
