require("dotenv").config();
const isNode = require("detect-node");
const nodeFetch = require("node-fetch");
const fetch = isNode ? nodeFetch : window.fetch;
const fs = require("fs");

async function getRecentEthereumPrice() {
  const endpoint = `https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD&apikey=${process.env.CRYPRO_COMPARE_APIKEY}`;
  const result = await fetch(endpoint);
  const price = await result.json();
  console.log(price);
  fs.writeFile("price.json", JSON.stringify(price), (err) => {
    if (err) throw err;
  });
}

// get price at bootstrap
getRecentEthereumPrice();

// then set an interval
setInterval(getRecentEthereumPrice, 1000 * 60 /* 1 minute */);
