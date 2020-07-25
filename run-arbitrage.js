require("dotenv").config();
const chalk = require("chalk");
const config = require("./config.json");
const Web3 = require("web3");
const abis = require("./abis");
const {mainnet: addresses} = require("./addresses");
const {ChainId, Token, TokenAmount, Pair} = require("@uniswap/sdk");
const Flashloan = require("./build/contracts/Flashloan.json");

const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.INFURA_URI));

const AMOUNT_ETH = config.amount_eth;
const AMOUNT_ETH_WEI = web3.utils.toWei(AMOUNT_ETH.toString());

const DIRECTION = {
  KYBER_TO_UNISWAP: 0,
  UNISWAP_TO_KYBER: 1,
};

const {address: admin} = web3.eth.accounts.wallet.add(process.env.PRIVATE_KEY);
const kyber = new web3.eth.Contract(abis.kyber.kyberNetworkProxy, addresses.kyber.kyberNetworkProxy);
const flashloan = new web3.eth.Contract(Flashloan.abi, Flashloan.networks[networkId].address);

const daiAddress = addresses.tokens.dai;
const wethAddress = addresses.tokens.weth;
const soloAddress = addresses.dydx.solo;

async function init() {
  const networkId = await web3.eth.net.getId();
  console.log(`NetworkId is ${networkId}`);

  web3.eth
    .subscribe("newBlockHeaders")
    .on("data", async (block) => {
      console.log(`New block received. Block number: ${block.number}`);

      // uniswap uses weth
      const [dai, weth] = await Promise.all(
        [daiAddress, wethAddress].map((tokenAddress) => Token.fetchData(ChainId.MAINNET, tokenAddress))
      );

      const daiWeth = await Pair.fetchData(dai, weth);

      const RECENT_ETH_PRICE = getRecentEthereumPrice();
      console.log(`Recent eth price: ${RECENT_ETH_PRICE}`);

      const AMOUNT_DAI_WEI = web3.utils.toWei(parseInt(AMOUNT_ETH * RECENT_ETH_PRICE).toString());
      console.log(`Amount dai wei: ${AMOUNT_DAI_WEI}`);

      const kyberResults = await Promise.all([
        // from dai to ether
        // https://developer.kyber.network/docs/KyberNetworkProxy/#getexpectedrate
        // src	ERC20	source ERC20 token contract address
        // dest	ERC20	destination ERC20 token contract address
        // srcQty	uint wei amount of source ERC20 token
        kyber.methods.getExpectedRate(daiAddress, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", AMOUNT_DAI_WEI).call(),
        kyber.methods.getExpectedRate("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", daiAddress, AMOUNT_ETH_WEI).call(),
      ]);

      const kyberRates = {
        buy: parseFloat(1 / (kyberResults[0].expectedRate / 10 ** 18)),
        sell: parseFloat(kyberResults[1].expectedRate / 10 ** 18),
      };

      console.log("Kyber ETH/DAI");
      console.log(kyberRates);

      const uniswapResults = await Promise.all([
        daiWeth.getOutputAmount(new TokenAmount(dai, AMOUNT_DAI_WEI)),
        daiWeth.getOutputAmount(new TokenAmount(weth, AMOUNT_ETH_WEI)),
      ]);
      const uniswapRates = {
        buy: parseFloat(AMOUNT_DAI_WEI / (uniswapResults[0][0].toExact() * 10 ** 18)),
        sell: parseFloat(uniswapResults[1][0].toExact() / AMOUNT_ETH),
      };
      console.log("Uniswap ETH/DAI");
      console.log(uniswapRates);

      if (kyberRates.buy < uniswapRates.sell) {
        const tx = flashloan.methods.initateFlashLoan(soloAddress, daiAddress, AMOUNT_DAI_WEI, DIRECTION.KYBER_TO_UNISWAP);
        const [gasPrice, gasCost] = await Promise.all([web3.eth.getGasPrice(), tx.estimateGas({from: admin})]);
        const txCost = parseInt(gasCost) * parseInt(gasPrice);
        // get profit
        const profit =
          (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (uniswapRates.sell - kyberRates.buy) - (txCost / 10 ** 18) * RECENT_ETH_PRICE;

        console.log(`profit: ${profit}`);

        if (profit > 0) {
          console.log(chalk.green("Arbitrage opportunity found!"));
          console.log(`Buy ETH from Kyber at ${kyberRates.buy} dai`);
          console.log(`Sell ETH to Uniswap at ${uniswapRates.sell} dai`);
          console.log(`Expected profit: ${profit1} dai`);

          const data = tx.encodeABI();
          const txData = {
            from: admin,
            to: flashloan.options.address,
            data,
            gas: gasCost,
            gasPrice,
          };
          const receipt = await web3.eth.sendTransaction(txData);
          console.log(`Transaction hash: ${receipt.transactionHash}`);
        }
      }

      if (uniswapRates.buy < kyber.sell) {
        const tx = flashloan.methods.initateFlashLoan(soloAddress, daiAddress, AMOUNT_DAI_WEI, DIRECTION.UNISWAP_TO_KYBER);
        const [gasPrice, gasCost] = await Promise.all([web3.eth.getGasPrice(), tx.estimateGas({from: admin})]);
        const txCost = parseInt(gasCost) * parseInt(gasPrice);
        // get profit
        const profit =
          (parseInt(AMOUNT_ETH_WEI) / 10 ** 18) * (kyberRates.sell - uniswapRates.buy) - (txCost / 10 ** 18) * RECENT_ETH_PRICE;

        console.log(`profit: ${profit}`);

        if (profit > 0) {
          console.log(chalk.green("Arbitrage opportunity found!"));
          console.log(`Buy ETH from Uniswap at ${uniswapRates.buy} dai`);
          console.log(`Sell ETH to Kyber at ${kyberRates.sell} dai`);
          console.log(`Expected profit: ${profit2} dai`);

          const data = tx.encodeABI();
          const txData = {
            from: admin,
            to: flashloan.options.address,
            data,
            gas: gasCost,
            gasPrice,
          };
          const receipt = await web3.eth.sendTransaction(txData);
          console.log(`Transaction hash: ${receipt.transactionHash}`);
        }
      }
    })
    .on("error", (err) => {
      console.error(err);
    });
}

function getRecentEthereumPrice() {
  const fs = require("fs");
  const data = fs.readFileSync("price.json");
  const price = parseFloat(JSON.parse(data).USD);
  console.log(`ETH price: ${price}`);
  return price;
}

function logChainEvent() {
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
