// SPDX-License-Identifier: ISC
pragma solidity ^0.5.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DaiFaucet {
  IERC20 dai;

  constructor(address daiAddress) public {
    dai = IERC20(daiAddress);
  }

  function sendDai(uint256 amount) external {
    // IERC20 transfer(recipient, amount)
    dai.transfer(msg.sender, amount);
  }
}
