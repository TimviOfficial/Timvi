# Timvi Ecosystem

Smart contracts are written in Solidity v0.5.11

- [Logic](contracts/TBoxManager.sol) ERC-721 Non-Fungible TBox Token contract. The main Timvi stablecoin logic contract.
- [TimviSettings](contracts/TimviSettings.sol) Settings store.
- [TimviToken](contracts/TimviToken.sol) ERC-20 Timvi stablecoin.
- [PriceGetter](oracle-contract/PriceGetter.sol) ETHUSD price oracle contract (using Oraclize).
- [Leverage](contracts/services/leverage-exchange/LeverageService.sol) Service that allows you to receive ETH for a collateral in ETH and also you can exchange ETH to TMV according to the system’s internal rate.
- [Bond](contracts/services/bond/BondService.sol) TBond is the service you can choose if you want to withdraw and sell TMV to get ETH fast and easy.


## Deploy

#### TBox

1. Deploy [TimviSettings.sol](contracts/TimviSettings.sol)
1. Deploy [TimviToken.sol](contracts/TimviToken.sol) with TimviSetttings address as constructor parameter
1. Set deployed ERC20 address in settings using `setTmvAddress` function
1. Deploy [PriceGetter.sol](oracle-contract/PriceGetter.sol)
1. Set deployed oracle address in settings using `setOracleAddress` function
1. Deploy [TBoxManager.sol](contracts/TBoxManager.sol) with TimviSetttings address as constructor parameter
1. Call `setContractManager` setting's function with deployed contract address


#### Leverage

- Deploy [LeverageService.sol](contracts/services/leverage-exchange/LeverageService.sol) with TimviSetttings address as constructor parameter


#### Bond

- Deploy [BondService.sol](contracts/services/bond/BondService.sol) with TimviSetttings address constructor parameter

#### Finish (for mainnet)

- Call `renounceSettingsManager` setting's function

## Test coverage and gas usage

1. Clone this repo & open in terminal
1. run ```npm run coverage```
