require("dotenv").config();
const fs = require("fs");
const chalk = require("chalk");
const config = require("./config.json");
const Web3 = require("web3");
const abis = require("./abis");
const useTestnet = process.env.TESTNET == "true";
const {kovan, mainnet} = require("./addresses");
const {ChainId, Token, TokenAmount, Pair} = require("@uniswap/sdk");
const Flashloan = require("./build/contracts/Flashloan.json");

const addresses = useTestnet ? kovan : mainnet;
const daiAddress = addresses.tokens.dai;
const wethAddress = addresses.tokens.weth;
const gasLimit = config.gas_limit;

const provider = useTestnet
  ? process.env.TESTNET_INFURA_URI
  : process.env.INFURA_URI;
const chainId = useTestnet ? ChainId.KOVAN : ChainId.MAINNET;

// https://zellwk.com/blog/crud-express-mongodb/
const MongoClient = require("mongodb").MongoClient;
// mongodb atlas
const ConnectString = `mongodb+srv://min:${process.env.MONGODB_PASSWORD}@cluster0-eosoe.mongodb.net/test?retryWrites=true&w=majority`;

const web3 = new Web3(new Web3.providers.WebsocketProvider(provider));

const AMOUNT_ETH = config.amount_eth;
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString());

const DIRECTION = {
  KYBER_TO_UNISWAP: 0,
  UNISWAP_TO_KYBER: 1,
};

const {address: admin} = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);

const kyber = new web3.eth.Contract(
  abis.kyber.kyberNetworkProxy,
  addresses.kyber.kyberNetworkProxy
);

async function init() {
  console.log(`Using testnet: ${useTestnet}`);
  const networkId = await web3.eth.net.getId();
  console.log(`NetworkId is ${networkId}`);

  const flashloan = new web3.eth.Contract(
    Flashloan.abi,
    Flashloan.networks[networkId].address
  );

  // watch event
  // check uport-connect repo for referrence
  await flashloan.events
    .NewArbitrage()
    .on("data", (event) => {
      const direction = event.returnValues.direction;
      const profit = event.returnValues.profit;
      const date = event.returnValues.date;
      const record = `direction: ${direction}, profit: ${profit}, date: ${date}\n`;
      console.log(record);
      saveRecord(record);
    })
    .on("error", (err) => {
      throw err;
    });

  web3.eth
    .subscribe("newBlockHeaders")
    .on("data", async (block) => {
      console.log(`New block received. Block number: ${block.number}`);

      // uniswap uses weth
      const [dai, weth] = await Promise.all(
        [daiAddress, wethAddress].map((tokenAddress) =>
          Token.fetchData(chainId, tokenAddress)
        )
      );

      const daiWeth = await Pair.fetchData(dai, weth);

      const RECENT_ETH_PRICE = getRecentEthereumPrice();
      console.log(`Recent eth price: ${RECENT_ETH_PRICE}`);

      const AMOUNT_DAI_WEI = web3.utils.toWei(
        // since one DAI is one USD
        (AMOUNT_ETH * parseInt(RECENT_ETH_PRICE)).toString()
      );
      console.log(`Amount dai wei: ${AMOUNT_DAI_WEI}`);

      const kyberResults = await Promise.all([
        // from dai to ether
        // https://developer.kyber.network/docs/KyberNetworkProxy/#getexpectedrate
        // src	ERC20	source ERC20 token contract address
        // dest	ERC20	destination ERC20 token contract address
        // srcQty	uint wei amount of source ERC20 token
        kyber.methods
          .getExpectedRate(
            daiAddress,
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            AMOUNT_DAI_WEI
          )
          .call(),
        kyber.methods
          .getExpectedRate(
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            daiAddress,
            AMOUNT_ETH_WEI
          )
          .call(),
      ]);

      const kyberRates = {
        buy: parseFloat(1 / (kyberResults[0].expectedRate / 10 ** 18)),
        sell: parseFloat(kyberResults[1].expectedRate / 10 ** 18),
      };

      console.log("Kyber Rates");
      console.log(kyberRates);

      const uniswapResults = await Promise.all([
        daiWeth.getOutputAmount(new TokenAmount(dai, AMOUNT_DAI_WEI)),
        daiWeth.getOutputAmount(new TokenAmount(weth, AMOUNT_ETH_WEI)),
      ]);

      const uniswapRates = {
        buy: parseFloat(
          AMOUNT_DAI_WEI / (uniswapResults[0][0].toExact() * 10 ** 18)
        ),
        sell: parseFloat(uniswapResults[1][0].toExact() / AMOUNT_ETH),
      };

      console.log("Uniswap ETH/DAI");
      console.log(uniswapRates);

      // calc the tx cost
      const [tx1, tx2] = Object.keys(DIRECTION).map((direction) =>
        flashloan.methods.initateFlashLoan(
          addresses.dydx.solo,
          daiAddress,
          AMOUNT_DAI_WEI,
          DIRECTION[direction]
        )
      );

      const [gasPrice, gasCost1, gasCost2] = await Promise.all([
        web3.eth.getGasPrice(),
        web3.eth.estimateGas({from: admin}),
        web3.eth.estimateGas({from: admin}),
        // tx1.estimateGas({from: admin, gas: gasLimit}),
        // tx2.estimateGas({from: admin, gas: gasLimit}),
      ]);

      const txCost1 = gasCost1 * parseInt(gasPrice);
      const txCost2 = gasCost2 * parseInt(gasPrice);

      console.log(`txCost1: ${txCost1}`);
      console.log(`txCost2: ${txCost2}`);

      const profit1 =
        (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) *
          (uniswapRates.sell - kyberRates.buy) -
        (txCost1 / 10 ** 18) * RECENT_ETH_PRICE;

      const profit2 =
        (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) *
          (kyberRates.sell - uniswapRates.buy) -
        (txCost2 / 10 ** 18) * RECENT_ETH_PRICE;

      if (profit1 > 0) {
        console.log(chalk.blue("Arbitrage opportunity found!"));
        console.log(`Buy ETH on Kyber at ${kyberRates.buy} dai`);
        console.log(`Sell ETH on Uniswap at ${uniswapRates.sell} dai`);
        console.log(`Expected profit: ${profit1} dai`);

        // Execute arb Kyber <=> Uniswap
        const data = tx1.encodeABI();
        const txData = {
          from: admin,
          to: flashloan.options.address,
          data,
          gas: gasLimit,
          gasPrice,
        };

        const receipt = await web3.eth.sendTransaction(txData);
        console.log(`Transaction Hash: ${receipt.transactionHash}`);
      } else if (profit2 > 0) {
        console.log(chalk.blue("Arbitrage opportunity found!"));
        console.log(`Buy ETH from Uniswap at ${uniswapRates.buy} dai`);
        console.log(`Sell ETH from Kyber at ${kyberRates.sell} dai`);
        console.log(`Expected profit: ${profit2} dai`);

        // Execute arb Uniswap <=> Kyber
        const data = tx2.encodeABI();
        const txData = {
          from: admin,
          to: flashloan.options.address,
          data,
          gas: gasLimit,
          gasPrice,
        };

        const receipt = await web3.eth.sendTransaction(txData);
        console.log(`Transaction Hash: ${receipt.transactionHash}`);
      }
      /* just for testing! 
      else {
        console.log(
          chalk.red("Arbitrage opportunity found! JUST FOR TESTING!!!")
        );
        console.log(`Buy ETH from Uniswap at ${uniswapRates.buy} dai`);
        console.log(`Sell ETH from Kyber at ${kyberRates.sell} dai`);
        console.log(`Expected profit: ${profit2} dai`);

        // Execute arb Uniswap <=> Kyber
        const data = tx2.encodeABI();
        const txData = {
          from: admin,
          to: flashloan.options.address,
          data,
          gas: gasLimit,
          gasPrice,
        };

        console.log(txData);

        const receipt = await web3.eth.sendTransaction(txData);
        console.log(`Transaction Hash: ${receipt.transactionHash}`);
      } */
    })
    .on("error", (err) => {
      throw err;
    });
}

function getRecentEthereumPrice() {
  const data = fs.readFileSync("price.json");
  const price = parseFloat(JSON.parse(data).USD);
  console.log(price);
  return price;
}

function saveRecord(record) {
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

init();
