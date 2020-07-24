require("dotenv").config();

const Web3 = require("web3");

const Flashloan = require("../build/contracts/Flashloan.json");
const DaiFaucet = require("../build/contracts/DaiFaucet.json");
const VaultManager = require("../build/contracts/VaultManager.json");

const abis = require("../abis");
const {mainnet: addresses} = require("../addresses");
const chalk = require("chalk");

const web3 = new Web3("http://localhost:8545"); // mainnet fork

jest.setTimeout(100000);

// start chain (mainnet or mainnet fork)
const startChain = async () => {
  // returns account address
  return web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY).address;
};

describe("Flashloan testing", () => {
  const AMOUNT_ETH = 1;
  const RECENT_ETH_PRICE = 230;

  const DAI_AMOUNT = web3.utils.toWei(
    (AMOUNT_ETH * RECENT_ETH_PRICE).toString()
  );

  const TWICE_DAI_AMOUNT = web3.utils.toWei(
    (AMOUNT_ETH * RECENT_ETH_PRICE * 2).toString()
  );

  const DIRECTION = {
    KYBER_TO_UNISWAP: 0,
    UNISWAP_TO_KYBER: 1,
  };

  let admin;
  let networkId;

  beforeAll(async () => {
    admin = await startChain();
    console.log(`Address is ${admin}`);

    networkId = await web3.eth.net.getId();
    console.log(`NetworkId is ${networkId}`);
  });

  test("admin should be initialized", () => {
    expect(admin).not.toBe(undefined);
    expect(admin).not.toBe("");
  });

  test("borrowing DAI from Maker", async () => {
    const dai = new web3.eth.Contract(abis.tokens.erc20, addresses.tokens.dai);
    const vaultManager = new web3.eth.Contract(
      VaultManager.abi,
      VaultManager.networks[networkId].address
    );

    console.log(`Borrowing ${web3.utils.fromWei(DAI_AMOUNT)} DAI from Maker`);

    // the minimum amount of DAI is 20 when you create a vault.
    await vaultManager.methods
      .openVault(
        addresses.makerdao.CDP_MANAGER,
        addresses.makerdao.MCD_JUG,
        addresses.makerdao.MCD_JOIN_ETH_A,
        addresses.makerdao.MCD_JOIN_DAI,
        TWICE_DAI_AMOUNT
      )
      .send({
        from: admin,
        gas: 2000000,
        gasPrice: 1,
        value: TWICE_DAI_AMOUNT,
      });

    const daiAdminBalance = await dai.methods.balanceOf(admin).call();
    console.log(
      `DAI balance of Your account: ${web3.utils.fromWei(daiAdminBalance)}`
    );

    expect(daiAdminBalance).toBe(TWICE_DAI_AMOUNT);
  });

  test("transfer half of DAI to faucet", async () => {
    const dai = new web3.eth.Contract(abis.tokens.erc20, addresses.tokens.dai);
    const daiFaucetAddress = DaiFaucet.networks[networkId].address;

    // transfer half to faucet while keep half
    await dai.methods.transfer(daiFaucetAddress, DAI_AMOUNT).send({
      from: admin,
      gas: 2000000,
      gasPrice: 1,
    });

    const daiFaucetBalance = await dai.methods
      .balanceOf(daiFaucetAddress)
      .call();

    console.log(
      `DAI balance of DaiFaucet: ${web3.utils.fromWei(daiFaucetBalance)}`
    );
    expect(daiFaucetBalance).toBe(DAI_AMOUNT);

    const daiAdminBalance = await dai.methods.balanceOf(admin).call();
    console.log(
      `DAI balance of Your account: ${web3.utils.fromWei(daiAdminBalance)}`
    );
    expect(daiAdminBalance).toBe(DAI_AMOUNT);
  });

  test("initiate Flashloan", async () => {
    const flashloan = new web3.eth.Contract(
      Flashloan.abi,
      Flashloan.networks[networkId].address
    );

    console.log("initiating flashloan Kyber => Uniswap");
    await flashloan.methods
      .initateFlashLoan(
        addresses.dydx.solo,
        addresses.tokens.dai,
        DAI_AMOUNT,
        DIRECTION.KYBER_TO_UNISWAP
      )
      .send({
        from: admin,
        gas: 2000000,
        gasPrice: 1,
      });

    // event listener
    // https://www.pauric.blog/How-to-Query-and-Monitor-Ethereum-Contract-Events-with-Web3/
    // event Hit(uint256 balanceDai, uint256 repayAmount);
    const logs = await flashloan.getPastEvents("allEvents", {
      toBlock: "latest",
    });

    logs.forEach((log) => {
      const record = `Event: ${log.event}, Return values: ${JSON.stringify(
        log.returnValues
      )}`;
      console.log(chalk.green(record));
    });
  });
});
