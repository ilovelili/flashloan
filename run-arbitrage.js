require("dotenv").config();
const chalk = require("chalk");
const fs = require("fs");
const config = require("./config.json");
const Web3 = require("web3");
const abis = require("./abis");
const {mainnet: addresses} = require("./addresses");
const {ChainId, Token, TokenAmount, Pair} = require("@uniswap/sdk");
const Flashloan = require("./build/contracts/Flashloan.json");

const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.INFURA_URI));

const ONE_ETH_WEI = web3.utils.toBN(web3.utils.toWei("1"));
const AMOUNT_ETH = config.amount_eth;

const DIRECTION = {
  KYBER_TO_UNISWAP: 0,
  UNISWAP_TO_KYBER: 1,
};

const {address: admin} = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);
const kyber = new web3.eth.Contract(abis.kyber.kyberNetworkProxy, addresses.kyber.kyberNetworkProxy);

const daiAddress = addresses.tokens.dai;
const wethAddress = addresses.tokens.weth;
const soloAddress = addresses.dydx.solo;

async function init() {
  const networkId = await web3.eth.net.getId().catch((err) => console.error("failed to get network id"));
  const flashloan = new web3.eth.Contract(Flashloan.abi, Flashloan.networks[networkId].address);
  console.log(`NetworkId is ${networkId}`);
  // update eth price
  let ethPrice;
  const updateEthPrice = async () => {
    const results = await kyber.methods
      .getExpectedRate("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", daiAddress, 1)
      .call()
      .catch((err) => console.error("failed to get eth price"));

    ethPrice = web3.utils.toBN("1").mul(web3.utils.toBN(results.expectedRate)).div(ONE_ETH_WEI);
    console.log(`eth price is ${ethPrice}`);
  };
  await updateEthPrice();
  setInterval(updateEthPrice, 15000);

  // https://web3js.readthedocs.io/en/v1.2.7/web3-eth-subscribe.html
  web3.eth
    .subscribe("newBlockHeaders")
    .on("data", async (block) => {
      console.log(`New block received. Block number: ${block.number}`);

      // uniswap uses weth
      const [dai, weth] = await Promise.all(
        [daiAddress, wethAddress].map((tokenAddress) => Token.fetchData(ChainId.MAINNET, tokenAddress))
      ).catch((err) => console.error("failed to fetch uniswap token data"));

      const daiWeth = await Pair.fetchData(dai, weth).catch((err) => console.error("failed to fetch uniswap pair data"));
      if (!daiWeth) return;

      const AMOUNT_DAI_WEI = web3.utils.toBN(web3.utils.toWei(parseInt(AMOUNT_ETH * ethPrice).toString()));
      console.log(`Amount dai wei: ${AMOUNT_DAI_WEI}`);

      // get eth from Kyber and Uniswap
      const amountsEth = await Promise.all([
        kyber.methods.getExpectedRate(daiAddress, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", AMOUNT_DAI_WEI).call(),
        daiWeth.getOutputAmount(new TokenAmount(dai, AMOUNT_DAI_WEI)),
      ]).catch((err) => console.error("failed to get eth expected rate"));

      const ethFromKyber = AMOUNT_DAI_WEI.mul(web3.utils.toBN(amountsEth[0].expectedRate)).div(ONE_ETH_WEI);
      const ethFromUniswap = web3.utils.toBN(amountsEth[1][0].raw.toString());

      // get dai from kyber and uniswap
      const amountsDai = await Promise.all([
        kyber.methods.getExpectedRate("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", daiAddress, ethFromUniswap.toString()).call(),
        daiWeth.getOutputAmount(new TokenAmount(weth, ethFromKyber.toString())),
      ]).catch((err) => console.error("failed to get dai expected rate"));

      const daiFromKyber = ethFromUniswap.mul(web3.utils.toBN(amountsDai[0].expectedRate)).div(ONE_ETH_WEI);
      const daiFromUniswap = web3.utils.toBN(amountsDai[1][0].raw.toString());
      console.log(`Kyber -> Uniswap. Dai input / output: ${AMOUNT_DAI_WEI.toString()} / ${daiFromUniswap.toString()}`);
      console.log(`Uniswap -> Kyber. Dai input / output: ${AMOUNT_DAI_WEI.toString()} / ${daiFromKyber.toString()}`);

      if (daiFromUniswap.gt(AMOUNT_DAI_WEI)) {
        const tx = flashloan.methods.initateFlashLoan(soloAddress, daiAddress, AMOUNT_DAI_WEI, DIRECTION.KYBER_TO_UNISWAP);
        const [gasPrice, gasCost] = await Promise.all([web3.eth.getGasPrice(), tx.estimateGas({from: admin})]).catch((err) =>
          console.error("failed to get gas price")
        );

        const txCost = web3.utils.toBN(gasCost).mul(web3.utils.toBN(gasPrice)).mul(ethPrice);
        const profit = daiFromUniswap.sub(AMOUNT_DAI_WEI).sub(txCost);

        if (profit > 0) {
          console.log(chalk.green("Arb opportunity found Kyber -> Uniswap!"));
          console.log(`Expected profit: ${profit} Dai`);
          const data = tx.encodeABI();
          const txData = {
            from: admin,
            to: flashloan.options.address,
            data,
            gas: gasCost,
            gasPrice,
          };
          const receipt = await web3.eth.sendTransaction(txData).catch((err) => console.error("failed to send transaction"));
          console.log(`Transaction hash: ${receipt.transactionHash}`);

          const record = `${new Date().getTime()}: Kyber -> Uniswap | Tx hash: ${receipt.transactionHash}\n`;
          fs.appendFile("oppertunity.json", record, (err) => {
            if (err) console.log(err);
          });
        }
      }

      if (daiFromKyber.gt(AMOUNT_DAI_WEI)) {
        const tx = flashloan.methods.initateFlashLoan(soloAddress, daiAddress, AMOUNT_DAI_WEI, DIRECTION.UNISWAP_TO_KYBER);
        const [gasPrice, gasCost] = await Promise.all([web3.eth.getGasPrice(), tx.estimateGas({from: admin})]).catch((err) =>
          console.error("failed to get gas price")
        );

        const txCost = web3.utils.toBN(gasCost).mul(web3.utils.toBN(gasPrice)).mul(ethPrice);
        const profit = daiFromKyber.sub(AMOUNT_DAI_WEI).sub(txCost);

        if (profit > 0) {
          console.log(chalk.green("Arb opportunity found Uniswap -> Kyber!"));
          console.log(`Expected profit: ${profit} Dai`);

          const data = tx.encodeABI();
          const txData = {
            from: admin,
            to: flashloan.options.address,
            data,
            gas: gasCost,
            gasPrice,
          };
          const receipt = await web3.eth.sendTransaction(txData).catch((err) => console.error("failed to send transaction"));
          console.log(`Transaction hash: ${receipt.transactionHash}`);

          const record = `${new Date().getTime()}: Uniswap -> Kyber | Tx hash: ${receipt.transactionHash}\n`;
          fs.appendFile("oppertunity.json", record, (err) => {
            if (err) console.log(err);
          });
        }
      }
    })
    .on("error", (err) => {
      // console.error(err);
    });
}

async function logChainEvent() {
  const networkId = await web3.eth.net.getId().catch((err) => console.error("failed to get network id"));
  const flashloan = new web3.eth.Contract(Flashloan.abi, Flashloan.networks[networkId].address);
  // log event
  flashloan.events
    .NewArbitrage()
    .on("data", (event) => {
      const direction = event.returnValues.direction;
      const profit = event.returnValues.profit;
      const date = event.returnValues.date;
      const record = `direction: ${direction}, profit: ${profit}, date: ${date}\n`;
      console.log(chalk.green(record));

      saveRecord(record);
      fs.appendFile("transaction.json", record, (err) => {
        if (err) console.log(err);
      });
    })
    .on("error", (err) => {
      console.error(err);
    });
}

function saveRecord(record) {
  // https://zellwk.com/blog/crud-express-mongodb/
  const MongoClient = require("mongodb").MongoClient;
  // mongodb atlas
  const ConnectString = `mongodb+srv://min:${process.env.MONGODB_PASSWORD}@cluster0-eosoe.mongodb.net/test?retryWrites=true&w=majority`;
  MongoClient.connect(ConnectString, {
    useUnifiedTopology: true,
  })
    .then((client) => {
      console.log("Connected to Database");
      const db = client.db("flashloan");
      const profits = db.collection("profits");
      profits
        .insertOne(record)
        .then((result) => {
          console.log(result);
        })
        .catch((err) => console.error(err));
    })
    .catch((err) => console.error(err));
}

// go
init();
logChainEvent();
