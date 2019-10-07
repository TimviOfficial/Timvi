const { shouldBehaveLikeERC20Burnable } = require('./behaviors/ERC20Burnable.behavior');
const ERC20BurnableMock = artifacts.require('ERC20BurnableMock');
const Settings = artifacts.require('TimviSettings');

const BN = web3.utils.BN;

contract('ERC20Burnable', function ([_, owner, ...otherAccounts]) {
    const initialBalance = new BN(1000);

    beforeEach(async function () {
        this.settings = await Settings.new({ from: owner });
        await this.settings.setContractManager(owner, {from: owner});
        this.token = await ERC20BurnableMock.new(owner, initialBalance, this.settings.address, { from: owner });
    });

    shouldBehaveLikeERC20Burnable(owner, initialBalance, otherAccounts);
});
