const TimviToken = artifacts.require('TimviToken');
const { expect } = require('chai');
const {constants } = require('openzeppelin-test-helpers');
const { ZERO_ADDRESS } = constants;
const BN = web3.utils.BN;

contract('TimviToken', function ([_, creator]) {
    beforeEach(async function () {
        this.token = await TimviToken.new(ZERO_ADDRESS, { from: creator });
    });

    it('has a name', async function () {
        expect(await this.token.name()).to.equal('TimviToken');
    });

    it('has a symbol', async function () {
        expect(await this.token.symbol()).to.equal('TMV');
    });

    it('has 18 decimals', async function () {
        expect(await this.token.decimals()).to.be.bignumber.equal(new BN(18));
    });
});
