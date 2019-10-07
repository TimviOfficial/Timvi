# Timvi Ecosystem

- [Logic](contracts/Logic.sol) ERC-721 Non-Fungible TBox Token contract. The main Timvi stablecoin logic.
- [TimviSettings](contracts/TimviSettings.sol) Settings store.
- [TimviToken](contracts/TimviToken.sol) ERC-20 Timvi stablecoin.
- [PriceGetter](oracle-contract/PriceGetter.sol) ETHUSD price oracle contract (using Oraclize).
- [1by1](contracts/services/leverage-exchange/ServiceExchange.sol) With 1by1 you can exchange ETH to TMV according to the system’s internal rate.
- [Leverage](contracts/services/leverage-exchange/ServiceToGetEtherLeverage.sol) Service that allows you to receive ETH for a collateral in ETH. 
- [BondService.sol](contracts/services/bond/BondService.sol) TBond is the service you can choose if you want to withdraw and sell TMV to get ETH fast and easy.


## Deploy

#### TBox

1. Deploy [TimviSettings.sol](contracts/TimviSettings.sol)
1. Deploy [TimviToken.sol](contracts/TimviToken.sol) with TimviSetttings address as constructor parameter
1. Set deployed ERC20 address in settings using `setTmvAddress` function
1. Deploy [PriceGetter.sol](docs/PriceGetter.sol)
1. Set deployed oracle address in settings using `setOracleAddress` function
1. Deploy [Logic.sol](contracts/Logic.sol) with TimviSetttings address as constructor parameter
1. Call `setContractManager` setting's function with deployed contract address


#### Exchange / Leverage

- Deploy [ServiceExchange.sol](contracts/services/leverage-exchange/ServiceExchange.sol) with TimviSetttings address as constructor parameter
- Deploy [ServiceToGetEtherLeverage.sol](contracts/services/leverage-exchange/ServiceToGetEtherLeverage.sol) with TimviSetttings address as constructor parameter


#### Bond

- Deploy [BondService.sol](contracts/services/bond/BondService.sol) with TimviSetttings address constructor parameter

#### Finish (for mainnet)

- Call `renounceSettingsManager` setting's function

## Test coverage and gas usage

1. Clone this repo & open in terminal
1. run ```npm run coverage```
