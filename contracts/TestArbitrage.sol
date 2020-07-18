// SPDX-License-Identifier: ISC
pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import {KyberNetworkProxy as IKyberNetworkProxy} from "@studydefi/money-legos/kyber/contracts/KyberNetworkProxy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IUniswapV2Router02.sol";
import "./IWeth.sol";

contract TestAribitrage {
  IKyberNetworkProxy kyber;
  IUniswapV2Router02 uniswap;
  IWeth weth;
  IERC20 dai;

  address beneficiary;
  address constant KYBER_ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(
    address kyberAddress,
    address uniswapAddress,
    address wethAddress,
    address daiAddress,
    address beneficiaryAddress
  ) public {
    kyber = IKyberNetworkProxy(kyberAddress);
    uniswap = IUniswapV2Router02(uniswapAddress);
    weth = IWeth(wethAddress);
    dai = IERC20(daiAddress);
    beneficiary = beneficiaryAddress;
  }

  function KyberToUniswap(uint256 daiAmount) external {
    // transferFrom(sender, recipient, amount)
    dai.transferFrom(msg.sender, address(this), daiAmount);
    // balanceOf(address account)
    uint256 balanceDai = dai.balanceOf(address(this));

    // Buy ETH on Kyber
    // approve(address spender, uint256 amount) → bool external
    // Sets amount as the allowance of spender over the caller’s tokens.
    // Returns a boolean value indicating whether the operation succeeded.
    dai.approve(address(kyber), balanceDai);

    (uint256 expectedRate, ) = kyber.getExpectedRate(dai, IERC20(KYBER_ETH_ADDRESS), balanceDai);
    kyber.swapTokenToEther(dai, balanceDai, expectedRate);

    // // Sell ETH on Uniswap
    // address[] memory path = new address[](2);
    // path[0] = address(weth);
    // path[1] = address(dai);
    // uint256[] memory minOuts = uniswap.getAmountsOut(address(this).balance, path);
    // uniswap.swapExactETHForTokens.value(address(this).balance)(minOuts[0], path, address(this), now);
  }

  function uniswapToKyber(uint256 daiAmount) external {
    dai.transferFrom(msg.sender, address(this), daiAmount);
    uint256 balanceDai = dai.balanceOf(address(this));

    // Buy ETH on Uniswap
    dai.approve(address(uniswap), balanceDai);
    address[] memory path = new address[](2);
    path[0] = address(dai);
    path[1] = address(weth);
    uint256[] memory minOuts = uniswap.getAmountsOut(balanceDai, path);
    uniswap.swapExactTokensForETH(balanceDai, minOuts[0], path, address(this), now);

    // Sell ETH on Kyber
    (uint256 expectedRate, ) = kyber.getExpectedRate(IERC20(KYBER_ETH_ADDRESS), dai, address(this).balance - 2);
    kyber.swapEtherToToken.value(address(this).balance - 2)(dai, expectedRate);
  }
}
