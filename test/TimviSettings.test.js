const {constants, expectRevert, ether } = require('openzeppelin-test-helpers');
const { expect } = require('chai');
const BN = web3.utils.BN;
const { ZERO_ADDRESS } = constants;
const Settings = artifacts.require('TimviSettings');

contract('TimviSettings', function ([]) {

    // deploy & initial settings
    beforeEach(async function () {
        this.settings = await Settings.new();
    });

    describe('Min deposit', function () {
        it('reverts when the value out of range', async function () {
            let minDeposit = ether("0");
            await expectRevert(this.settings.setMinDepo(minDeposit), 'Value out of range');
            minDeposit = ether("11");
            await expectRevert(this.settings.setMinDepo(minDeposit), 'Value out of range');

        });
        it('sets the correct value', async function () {
            let minDeposit = ether("1");
            await this.settings.setMinDepo(minDeposit);
            let result = await this.settings.minDeposit();
            expect(result).to.be.bignumber.equal(minDeposit);
        });
    });

    describe('System commission', function () {
        it('reverts when the value out of range', async function () {
            let commission = new BN(4000);
            await expectRevert(this.settings.setSysCom(commission), 'Value out of range');

        });
        it('sets the correct value', async function () {
            let feeTotal = await this.settings.totalFee();
            let commission = new BN(3000);
            await this.settings.setSysCom(commission);
            let sysRes = await this.settings.sysFee();
            let userRes = await this.settings.userFee();
            expect(sysRes).to.be.bignumber.equal(commission);
            expect(userRes).to.be.bignumber.equal(feeTotal.sub(commission));
        });
    });

    describe('Total commission', function () {
        it('reverts when the value out of range', async function () {
            let total = new BN(1000);
            let system = new BN(500);
            await expectRevert(this.settings.setFeeTotal(total, system), 'Value out of range');

            total = new BN(1001);
            system = new BN(501);
            await expectRevert(this.settings.setFeeTotal(total, system), 'Value out of range');

            total = new BN(6001);
            system = new BN(3000);
            await expectRevert(this.settings.setFeeTotal(total, system), 'Value out of range');

            total = new BN(6000);
            system = new BN(3001);
            await expectRevert(this.settings.setFeeTotal(total, system), 'Value out of range');

        });
        it('sets the correct value', async function () {
            let total = new BN(5000);
            let system = new BN(2500);
            let user = total.sub(system);

            await this.settings.setFeeTotal(total, system);

            let totalRes = await this.settings.totalFee();
            let sysRes = await this.settings.sysFee();
            let userRes = await this.settings.userFee();

            expect(userRes).to.be.bignumber.equal(user);
            expect(sysRes).to.be.bignumber.equal(system);
            expect(totalRes).to.be.bignumber.equal(total);
        });
    });

    describe('Setting the oracle', function () {
        it('reverts putting zero address', async function () {
            await expectRevert(this.settings.setOracleAddress(ZERO_ADDRESS), 'Zero address');
        });
        it('sets the correct value', async function () {
            let address = web3.utils.toChecksumAddress('0x4a2e3883d5f574178660998b05fc7211f5b2960e');
            await this.settings.setOracleAddress(address);
            let res = await this.settings.oracleAddress();
            expect(res).to.have.string(address);
        });
    });

    describe('Setting the token address', function () {
        it('reverts putting zero address', async function () {
            await expectRevert(this.settings.setTmvAddress(ZERO_ADDRESS), 'Zero address');
        });
        it('sets the correct value', async function () {
            let address = web3.utils.toChecksumAddress('0x4a2e3883d5f574178660998b05fc7211f5b2960e');
            await this.settings.setTmvAddress(address);
            let res = await this.settings.tmvAddress();
            expect(res).to.have.string(address);
        });
    });

    describe('Safety bag', function () {
        it('reverts when the value out of range', async function () {
            let value = new BN(100001);
            await expectRevert(this.settings.setSafetyBag(value), 'Value out of range');
        });
        it('sets the correct value', async function () {
            let value = new BN(100000);
            await this.settings.setSafetyBag(value);
            let res = await this.settings.globalSafetyBag();
            expect(res).to.be.bignumber.equal(value);
        });
    });
});

// Timvi Settings Ropsten 0x4a2e3883d5f574178660998b05fc7211f5b2960e
