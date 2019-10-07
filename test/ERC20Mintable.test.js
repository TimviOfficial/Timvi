const { shouldBehaveLikeERC20Mintable } = require('./behaviors/ERC20Mintable.behavior');
const ERC20MintableMock = artifacts.require('ERC20MintableMock');
const Settings = artifacts.require('TimviSettings');

contract('ERC20Mintable', function ([_, minter, otherMinter, ...otherAccounts]) {
    beforeEach(async function () {
        this.settings = await Settings.new({ from: minter });
        await this.settings.setContractManager(minter, {from: minter});
        this.token = await ERC20MintableMock.new(this.settings.address, { from: minter });
    });

    describe('minter role', function () {
        beforeEach(async function () {
            this.contract = this.token;
        });
    });

    shouldBehaveLikeERC20Mintable(minter, otherAccounts);
});