require("dotenv").config();

const Web3 = require("web3");

const Flashloan = require("../build/contracts/TestableFlashloan.json");
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

  const WETH_AMOUNT = web3.utils.toWei(AMOUNT_ETH.toString());
  const DAI_AMOUNT = web3.utils.toWei((AMOUNT_ETH * RECENT_ETH_PRICE).toString());

  const DOUBLE_DAI_AMOUNT = web3.utils.toWei((AMOUNT_ETH * RECENT_ETH_PRICE * 2).toString());

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

  test("admin should be initialized", async () => {
    expect(admin).not.toBe(undefined);
    expect(admin).not.toBe("");
    console.log(`admin balance: ${await web3.eth.getBalance(admin)}`);
  });

  test("should get kayber expected rate", async () => {
    const kyber = new web3.eth.Contract(abis.kyber.kyberNetworkProxy, addresses.kyber.kyberNetworkProxy);
    const daiAddress = addresses.tokens.dai;

    const daiEthRate = await kyber.methods.getExpectedRate(daiAddress, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", DAI_AMOUNT).call();
    const ethDaiRate = await kyber.methods.getExpectedRate("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", daiAddress, DAI_AMOUNT).call();

    console.log(`Kyber DAI-ETH expectedRate: ${daiEthRate.expectedRate}, slippageRate: ${daiEthRate.slippageRate}`);
    console.log(`Kyber ETH-DAI expectedRate: ${ethDaiRate.expectedRate}, slippageRate: ${ethDaiRate.slippageRate}`);
    expect(daiEthRate).not.toBe(null);
    expect(ethDaiRate).not.toBe(null);
  });

  test("should get uniswap amount out", async () => {
    const {ChainId, Token, TokenAmount, Pair} = require("@uniswap/sdk");
    const daiAddress = addresses.tokens.dai;
    const wethAddress = addresses.tokens.weth;

    const [dai, weth] = await Promise.all([daiAddress, wethAddress].map((tokenAddress) => Token.fetchData(ChainId.MAINNET, tokenAddress)));
    const daiWeth = await Pair.fetchData(dai, weth);

    // input weth, get dai
    const amountOutDai = daiWeth.getOutputAmount(new TokenAmount(weth, WETH_AMOUNT));
    const amountOutDaiExact = amountOutDai[0].toExact();
    console.log(`AmountOut Dai(Exact): ${web3.utils.toWei(amountOutDaiExact)}`);
    expect(amountOutDai).not.toBe(null);
  });

  test("should get eth price", async () => {
    const kyber = new web3.eth.Contract(abis.kyber.kyberNetworkProxy, addresses.kyber.kyberNetworkProxy);
    const daiAddress = addresses.tokens.dai;
    const ONE_ETH_WEI = web3.utils.toBN(web3.utils.toWei("1"));

    const results = await kyber.methods.getExpectedRate("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", daiAddress, 1).call();
    const ethPrice = web3.utils.toBN("1").mul(web3.utils.toBN(results.expectedRate)).div(ONE_ETH_WEI);
    console.log(`eth price is ${ethPrice}`);
  });

  test("borrowing DAI from Maker", async () => {
    const dai = new web3.eth.Contract(abis.tokens.erc20, addresses.tokens.dai);
    const vaultManager = new web3.eth.Contract(VaultManager.abi, VaultManager.networks[networkId].address);

    console.log(`Borrowing ${web3.utils.fromWei(DOUBLE_DAI_AMOUNT)} DAI from Maker`);

    // the minimum amount of DAI is 20 when you create a vault.
    await vaultManager.methods
      .openVault(
        addresses.makerdao.CDP_MANAGER,
        addresses.makerdao.MCD_JUG,
        addresses.makerdao.MCD_JOIN_ETH_A,
        addresses.makerdao.MCD_JOIN_DAI,
        DOUBLE_DAI_AMOUNT
      )
      .send({
        from: admin,
        gas: 2000000,
        gasPrice: 1,
        value: DOUBLE_DAI_AMOUNT,
      });

    const daiAdminBalance = await dai.methods.balanceOf(admin).call();
    console.log(`DAI balance of Your account: ${web3.utils.fromWei(daiAdminBalance)}`);

    expect(daiAdminBalance).toBe(DOUBLE_DAI_AMOUNT);
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

    const daiFaucetBalance = await dai.methods.balanceOf(daiFaucetAddress).call();

    console.log(`DAI balance of DaiFaucet: ${web3.utils.fromWei(daiFaucetBalance)}`);
    expect(daiFaucetBalance).toBe(DAI_AMOUNT);

    const daiAdminBalance = await dai.methods.balanceOf(admin).call();
    console.log(`DAI balance of Your account: ${web3.utils.fromWei(daiAdminBalance)}`);
    expect(daiAdminBalance).toBe(DAI_AMOUNT);
  });

  test("initiate Flashloan", async () => {
    const flashloan = new web3.eth.Contract(Flashloan.abi, Flashloan.networks[networkId].address);
    console.log("initiating flashloan Kyber => Uniswap");

    const logs = await flashloan.methods
      .initateFlashLoan(addresses.dydx.solo, addresses.tokens.dai, DAI_AMOUNT, DIRECTION.KYBER_TO_UNISWAP)
      .send({
        from: admin,
        gas: 2000000,
        gasPrice: 1,
      });

    // console.log(logs);
    await logChainEvent(flashloan);
  });

  async function logChainEvent(flashloan) {
    // event listener
    // https://www.pauric.blog/How-to-Query-and-Monitor-Ethereum-Contract-Events-with-Web3/
    await flashloan
      .getPastEvents("allEvents", {
        toBlock: "latest",
      })
      .then((logs) => {
        logs.forEach((log) => {
          const record = `Event: ${log.event}, Return values: ${JSON.stringify(log.returnValues)}`;
          console.log(chalk.green(record));
        });
      })
      .catch((err) => {
        console.error(err);
      });
  }
});
