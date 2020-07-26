pragma solidity ^0.5.0;
pragma experimental ABIEncoderV2;

import "@studydefi/money-legos/dydx/contracts/DydxFlashloanBase.sol";
import "@studydefi/money-legos/dydx/contracts/ICallee.sol";
import {KyberNetworkProxy as IKyberNetworkProxy} from "@studydefi/money-legos/kyber/contracts/KyberNetworkProxy.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IUniswapV2Router02.sol";
import "./IWeth.sol";
import "./DaiFaucet.sol";

contract TestableFlashloan is ICallee, DydxFlashloanBase {
  enum Direction {KyberToUniswap, UniswapToKyber}
  struct ArbInfo {
    Direction direction;
    uint256 repayAmount;
  }

  event NewArbitrage(Direction indexed direction, uint256 indexed profit, uint256 indexed date);

  // for debugging
  event GetKyberExpectedRate(uint256 indexed expectedRate);
  event GetBalanceDAI(uint256 indexed balance);
  event GetProfit(int256 indexed profit);
  event GetMinOuts(uint256[] minOuts);

  IKyberNetworkProxy kyber;
  IUniswapV2Router02 uniswap;
  IWeth weth;
  IERC20 dai;
  DaiFaucet daiFaucet;
  address beneficiary;
  address constant KYBER_ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(
    address kyberAddress,
    address uniswapAddress,
    address wethAddress,
    address daiAddress,
    address daiFaucetAddress,
    address beneficiaryAddress
  ) public {
    kyber = IKyberNetworkProxy(kyberAddress);
    uniswap = IUniswapV2Router02(uniswapAddress);
    weth = IWeth(wethAddress);
    dai = IERC20(daiAddress);
    daiFaucet = DaiFaucet(daiFaucetAddress);
    beneficiary = beneficiaryAddress;
  }

  // This is the function that will be called postLoan
  // i.e. Encode the logic to handle your flashloaned funds here
  function callFunction(
    address sender,
    Account.Info memory account,
    bytes memory data
  ) public {
    ArbInfo memory arbInfo = abi.decode(data, (ArbInfo));
    uint256 balanceDai = dai.balanceOf(address(this));
    uint256 deadline = now + 300;

    emit GetBalanceDAI(balanceDai);

    if (arbInfo.direction == Direction.KyberToUniswap) {
      // Buy ETH on Kyber
      require(dai.approve(address(kyber), balanceDai), "Could not approve reserve asset sell");
      (uint256 expectedRate, ) = kyber.getExpectedRate(dai, IERC20(KYBER_ETH_ADDRESS), balanceDai);

      emit GetKyberExpectedRate(expectedRate);

      kyber.swapTokenToEther(dai, balanceDai, expectedRate);

      // Sell ETH on Uniswap
      address[] memory path = new address[](2);
      path[0] = address(weth);
      path[1] = address(dai);

      // https://uniswap.org/docs/v2/smart-contracts/library#getamountsout
      // Given an input asset amount and an array of token addresses, calculates all subsequent maximum output token amounts
      uint256[] memory minOuts = uniswap.getAmountsOut(address(this).balance, path);

      // just for testing
      uint256[] memory minOutsTest = uniswap.getAmountsOut(1 ether, path);
      emit GetMinOuts(minOutsTest);

      // https://uniswap.org/docs/v2/smart-contracts/router02/
      // Swaps an exact amount of ETH for as many output tokens as possible, along the route determined by the path.
      // The first element of path must be WETH, the last is the output token
      uniswap.swapExactETHForTokens.value(address(this).balance)(minOuts[1], path, address(this), deadline);
    } else {
      // Buy ETH on Uniswap
      require(dai.approve(address(uniswap), balanceDai), "Could not approve reserve asset sell");
      address[] memory path = new address[](2);
      path[0] = address(dai);
      path[1] = address(weth);
      uint256[] memory minOuts = uniswap.getAmountsOut(balanceDai, path);
      uniswap.swapExactTokensForETH(balanceDai, minOuts[1], path, address(this), deadline);

      // Sell ETH on Kyber
      (uint256 expectedRate, ) = kyber.getExpectedRate(IERC20(KYBER_ETH_ADDRESS), dai, address(this).balance);
      kyber.swapEtherToToken.value(address(this).balance)(dai, expectedRate);
    }

    balanceDai = dai.balanceOf(address(this));
    int256 profit = int256(dai.balanceOf(address(this)) - arbInfo.repayAmount);

    emit GetBalanceDAI(balanceDai);
    emit GetProfit(profit);

    if (balanceDai < arbInfo.repayAmount) {
      daiFaucet.sendDai(arbInfo.repayAmount - balanceDai);
    }

    uint256 positiveProfit = dai.balanceOf(address(this)) - arbInfo.repayAmount;
    dai.transfer(beneficiary, positiveProfit);
    emit NewArbitrage(arbInfo.direction, positiveProfit, now);
  }

  function initateFlashLoan(
    address _solo,
    address _token,
    uint256 _amount,
    Direction _direction
  ) external {
    // Calculate repay amount (_amount + (2 wei))
    // Approve transfer from
    uint256 repayAmount = _getRepaymentAmountInternal(_amount);
    IERC20(_token).approve(_solo, repayAmount);

    // 1. Withdraw $
    // 2. Call callFunction(...)
    // 3. Deposit back $
    Actions.ActionArgs[] memory operations = new Actions.ActionArgs[](3);

    // Get marketId from token address
    uint256 marketId = _getMarketIdFromTokenAddress(_solo, _token);

    operations[0] = _getWithdrawAction(marketId, _amount);
    operations[1] = _getCallAction(
      // Encode MyCustomData for callFunction
      abi.encode(ArbInfo({direction: _direction, repayAmount: repayAmount}))
    );
    operations[2] = _getDepositAction(marketId, repayAmount);

    Account.Info[] memory accountInfos = new Account.Info[](1);
    accountInfos[0] = _getAccountInfo();

    ISoloMargin(_solo).operate(accountInfos, operations);
  }

  function() external payable {}
}
