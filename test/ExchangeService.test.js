const {constants, expectEvent, expectRevert, ether } = require('openzeppelin-test-helpers');
const balance = require('./helpers/balances');
const { expect } = require('chai');
const BN = web3.utils.BN;
const { ZERO_ADDRESS } = constants;

const Logic = artifacts.require('Logic');
const Settings = artifacts.require('TimviSettings');
const Token = artifacts.require('TimviToken');
const Oracle = artifacts.require('OracleContractMock');
const ExchangeService = artifacts.require('ExchangeService');

contract('ExchangeService', function ([owner, anotherAccount]) {

    // deploy & initial settings
    beforeEach(async function () {
        this.settings = await Settings.new();
        this.logic = await Logic.new(this.settings.address);
        this.token = await Token.new(this.settings.address);
        this.oracle = await Oracle.new();
        await this.settings.setTmvAddress(this.token.address);
        await this.settings.setOracleAddress(this.oracle.address);
        const receipt = await this.settings.setContractManager(this.logic.address);
        this.service = await ExchangeService.new(this.settings.address);

        const tx = await web3.eth.getTransaction(receipt.tx);
        this.gasPrice = new BN(tx.gasPrice);
    });

    describe('Ask creating', function () {
        let deposit = ether("1");
        it('reverts when deposit is very small', async function () {
            let deposit = ether("0.04");
            await expectRevert(this.service.create({ from: owner, value: deposit}), "Too small funds");
        });
        it('creates record about new ask', async function () {
            await this.service.create({ from: owner, value: deposit});
            let ask = await this.service.asks(0);
            expect(ask[0]).to.have.string(owner);
            expect(ask[1]).to.be.bignumber.equal(deposit);
        });
        it('increases the contract balance', async function () {
            let tx = this.service.create({ value: deposit});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a create event', async function () {
            const { logs } = await this.service.create({ from: owner, value: deposit });
            expectEvent.inLogs(logs, 'AskCreated', {
                id: new BN(0),
                owner: owner,
                pack: deposit,
            });
        });
    });
    describe('Closing', function () {

        let deposit = ether("1");
        let askId = new BN(0);

        beforeEach(async function () {
            await this.service.create({ from: owner, value: deposit});
        });

        it("reverts closing by alien", async function () {
            await expectRevert(this.service.close(askId, {from: anotherAccount}), 'Ask isn\'t your');
        });
        it("removes a record about Ask", async function () {
            await this.service.close(askId, {from: owner});
            let ask = await this.service.asks(askId);
            expect(ask[0]).to.have.string(ZERO_ADDRESS);
            expect(ask[1]).to.be.bignumber.equal(new BN(0));
        });
        it("increases ETH user balance", async function () {
            let tx = this.service.close(askId, {from: owner});
            let diff = await balance.differenceExcludeGas(owner, tx, this.gasPrice);
            expect(diff).to.be.bignumber.equal(deposit);
        });
        it("reduces ETH contract balance", async function () {
            let tx = this.service.close(askId, {from: owner});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a close event', async function () {
            const { logs } = await this.service.close(askId, { from: owner });
            expectEvent.inLogs(logs, 'AskClosed', {
                id: new BN(0),
            });
        });
    });
    describe('Matching', function () {

        let deposit = ether("2");
        let rate, divider, tmv, precision;
        let matchDepo = ether("3");
        let askId = new BN(0);

        beforeEach(async function () {
            await this.service.create({ from: owner, value: deposit});
        });

        it("reverts non-existent ask", async function () {
            rate = await this.logic.rate();
            divider = new BN('100000');
            precision = new BN('100000');
            tmv = deposit.mul(rate).div(precision);
            await this.service.close(askId, { from: owner});


            await expectRevert(this.service.take(askId, {value: matchDepo, from: anotherAccount}), 'Ask doesn\'t exist');
        });
        it("returns when attached value is out of range", async function () {
            let matchDepo = deposit.mul(new BN(115217)).div(divider);

            await expectRevert(this.service.take(askId, {value: matchDepo, from: anotherAccount}), 'Token amount is more than available');
        });
        it("mints 721 token to owner", async function () {
            await this.service.take(askId, {value: matchDepo, from: anotherAccount});
            let tokenId = 0;
            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(anotherAccount, tokenId);

            expect(apprOrOwnr).to.be.true;
        });
        it("transfers packed ETH to matcher", async function () {
            let tx = this.service.take(askId, {value: matchDepo, from: anotherAccount});
            let diff = await balance.differenceExcludeGas(anotherAccount, tx, this.gasPrice);
            let fee = deposit.mul(new BN(5)).div(new BN(1000)); //0.5%
            let calculatedDiff = matchDepo.sub(deposit).add(fee);

            expect(diff).to.be.bignumber.equal(calculatedDiff);
        });
        it("mints TMV equivalent to owner", async function () {
            rate = await this.logic.rate();
            precision = new BN(100000);
            divider = new BN(100000);
            tmv = deposit.mul(rate).div(precision);
            let balanceBefore = await this.token.balanceOf(owner);
            await this.service.take(askId, {value: matchDepo, from: anotherAccount});
            let fee = tmv.mul(new BN(5)).div(new BN(1000)); //0.5%
            let balanceAfter = await this.token.balanceOf(owner);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tmv.sub(fee));
        });
        it("removes record about matched ask", async function () {
            await this.service.take(askId, {value: matchDepo, from: anotherAccount});
            let ask = await this.service.asks(0);

            expect(ask[0]).to.have.string(ZERO_ADDRESS);
            expect(ask[1]).to.be.bignumber.equal(new BN(0));
        });
        it("mints TMV equivalent to matcher", async function () {
            let balanceBefore = await this.token.balanceOf(this.service.address);
            let packed = (await this.service.asks(0))[1];
            let tx = this.service.take(askId, {value: matchDepo, from: anotherAccount});
            let diff = await balance.difference(this.service.address, tx);
            let tmv = deposit.mul(rate).div(precision);
            let feeTMV = tmv.mul(new BN(5)).div(new BN(1000)); //0.5%
            let balanceAfter = await this.token.balanceOf(this.service.address);
            let feeETH = deposit.mul(new BN(5)).div(new BN(1000)); //0.5%

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(feeTMV);
            expect(diff).to.be.bignumber.equal(packed.sub(feeETH));
        });
        it("emits the matching event", async function () {
            let {logs} = await this.service.take(askId, {value: matchDepo, from: anotherAccount});

            expectEvent.inLogs(logs, 'AskMatched', {
                id: new BN(0),
                tBox: new BN(0),
            });
        });
    });
    describe('ETH fee withdrawing', function () {

        let deposit = ether("1");
        let matchDepo = deposit.mul(new BN(2));
        let askId = new BN(0);

        beforeEach(async function () {
            await this.service.create({from: owner, value: deposit});
            await this.service.take(askId, {from: anotherAccount, value: matchDepo});
        });

        describe('reverts', function () {

            it("withdrawing to zero address", async function () {
                await expectRevert(this.service.withdrawSystemETH(ZERO_ADDRESS), 'Zero address, be careful');
            });
            it("withdrawing by non-admin", async function () {
                await expectRevert(this.service.withdrawSystemETH(anotherAccount, {from: anotherAccount}), 'You have no access');
            });
            it("when there are no fees nor rewards", async function () {
                await this.service.withdrawSystemETH(anotherAccount);
                await expectRevert(this.service.withdrawSystemETH(anotherAccount), 'There is no available ETH');
            });
        });
        describe('success', function () {
            it("zeroes fee counter", async function () {
                await this.service.withdrawSystemETH(anotherAccount);
                let fee = await this.service.systemETH();
                expect(fee).to.be.bignumber.equal(new BN(0));
            });
            it("reduces the contract balance", async function () {
                let reward = await this.service.systemETH();
                let tx = this.service.withdrawSystemETH(anotherAccount);
                let diff = await balance.difference(this.service.address, tx);
                expect(diff).to.be.bignumber.equal(reward);
            });
            it("increases the user balance", async function () {
                let reward = await this.service.systemETH();
                let tx = this.service.withdrawSystemETH(anotherAccount);
                let diff = await balance.difference(anotherAccount, tx);
                expect(diff).to.be.bignumber.equal(reward);
            });
        });
    });
    describe('TMV fee withdrawing', function () {

        let deposit = ether("1");
        let matchDepo = deposit.mul(new BN(2));
        let askId = new BN(0);

        beforeEach(async function () {
            await this.service.create( {from: owner, value: deposit});
            await this.service.take(askId, {from: anotherAccount, value: matchDepo});
        });

        describe('reverts', function () {

            it("withdrawing to zero address", async function () {
                await expectRevert(this.service.reclaimERC20(this.token.address, ZERO_ADDRESS), 'Zero address, be careful');
            });
            it("withdrawing by non-admin", async function () {
                await expectRevert(this.service.reclaimERC20(this.token.address, anotherAccount, {from: anotherAccount}), 'You have no access');
            });
            it("when there are no fees nor rewards", async function () {
                await this.service.reclaimERC20(this.token.address, anotherAccount);
                await expectRevert(this.service.reclaimERC20(this.token.address, anotherAccount), 'There are no tokens');
            });
        });
        describe('success', function () {
            it("zeroes fee counter", async function () {
                let fee = await this.token.balanceOf(this.service.address);
                expect(fee).to.be.bignumber.gt(new BN(0));
                await this.service.reclaimERC20(this.token.address, anotherAccount);
                fee = await this.token.balanceOf(this.service.address);
                expect(fee).to.be.bignumber.equal(new BN(0));
            });
            it("increases the user balance", async function () {
                let before = await this.token.balanceOf(anotherAccount);
                let reward = await this.token.balanceOf(this.service.address);
                await this.service.reclaimERC20(this.token.address, anotherAccount);
                let after = await this.token.balanceOf(anotherAccount);
                expect(after.sub(before)).to.be.bignumber.equal(reward);

            });
        });
    });
    describe('Settings the commission', function () {
        let commission = new BN(10000);
        describe('reverts', function () {

            it("if setting value is higher than 10%", async function () {
                await expectRevert(this.service.setCommission(commission.add(new BN(1))), 'Too much');
            });
            it("setting by non-admin", async function () {
                await expectRevert(this.service.setCommission(commission, {from: anotherAccount}), 'You have no access');
            });
        });
        describe('success', function () {
            it("changes the commission", async function () {
                await this.service.setCommission(commission);
                let newCom = await this.service.commission();
                expect(newCom).to.be.bignumber.equal(commission);
            });
        });
    });
    describe('Settings the min deposit amount', function () {

        let value = ether("100");
        describe('reverts', function () {

            it("if setting value is higher than 100 ether", async function () {
                await expectRevert(this.service.setMinEther(value.add(new BN(1))), 'Too much');
            });
            it("setting by non-admin", async function () {
                await expectRevert(this.service.setMinEther(value, {from: anotherAccount}), 'You have no access');
            });
        });
        describe('success', function () {
            it("changes the commission", async function () {
                await this.service.setMinEther(value);
                let newMin = await this.service.minEther();
                expect(newMin).to.be.bignumber.equal(value);
            });
        });
    });
    describe('Change the admin address', function () {
        describe('reverts', function () {

            it("zero address", async function () {
                await expectRevert(this.service.changeAdmin(ZERO_ADDRESS), 'Zero address, be careful');
            });
            it("setting by non-admin", async function () {
                await expectRevert(this.service.changeAdmin(anotherAccount, {from: anotherAccount}), 'You have no access');
            });
        });
        describe('success', function () {
            it("changes the admin address", async function () {
                await this.service.changeAdmin(anotherAccount);
                let newAdmin = await this.service.admin();
                expect(newAdmin).to.have.string(anotherAccount);
            });
        });
    });
});

// Timvi Settings Ropsten 0x4a2e3883d5f574178660998b05fc7211f5b2960e
