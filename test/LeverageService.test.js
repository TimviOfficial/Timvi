const {constants, expectEvent, expectRevert, ether } = require('openzeppelin-test-helpers');
const balance = require('./helpers/balances');
const { expect } = require('chai');
const BN = web3.utils.BN;
const { ZERO_ADDRESS } = constants;

const Classic = artifacts.require('TBoxManager');
const Settings = artifacts.require('TimviSettings');
const Token = artifacts.require('TimviToken');
const Oracle = artifacts.require('OracleContractMock');
const LeverageService = artifacts.require('LeverageService');

contract('LeverageService', function ([_, owner, anotherAccount]) {

    // deploy & initial settings
    beforeEach(async function () {
        this.settings = await Settings.new();
        this.logic = await Classic.new(this.settings.address);
        this.token = await Token.new(this.settings.address);
        this.oracle = await Oracle.new();
        await this.settings.setTmvAddress(this.token.address);
        await this.settings.setOracleAddress(this.oracle.address);
        let tx = await this.settings.setContractManager(this.logic.address);
        this.service = await LeverageService.new(this.settings.address);

        tx = await web3.eth.getTransaction(tx.tx);
        this.gasPrice = new BN(tx.gasPrice);
    });

    describe('Order creating', function () {
        let deposit = ether("2");
        let percent = new BN('150000');
        it('reverts when deposit is very small', async function () {
            let deposit = ether("0.04");
            await expectRevert(this.service.create(percent, { from: owner, value: deposit}), "Too small funds");
        });
        it('reverts when specified percent is higher than available', async function () {
            let percent = 115900;
            await expectRevert(this.service.create(percent, { from: owner, value: deposit}), "Collateral percent out of range");
        });
        it('creates record about new Order', async function () {
            await this.service.create(percent, { from: owner,value: deposit});
            let order = await this.service.orders.call(0);
            expect(order[0]).to.have.string(owner);
            expect(order[1]).to.be.bignumber.equal(deposit);
            expect(order[2]).to.be.bignumber.equal(percent);
        });
        it('increases the contract balance', async function () {
            let tx = this.service.create(percent, { value: deposit});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a create event', async function () {
            const { logs } = await this.service.create(percent, { from: owner, value: deposit });
            expectEvent.inLogs(logs, 'OrderCreated', {
                id: new BN(0),
                owner: owner,
                pack: deposit,
            });
        });
    });
    describe('Closing', function () {

        let deposit = ether("1");
        let percent = new BN('150000');
        let orderId = new BN(0);

        beforeEach(async function () {
            await this.service.create(percent, { from: owner,value: deposit});
        });

        it("reverts closing by alien", async function () {
            await expectRevert(this.service.close(new BN(0), {from: anotherAccount}), 'Order isn\'t your');
        });
        it("removes a record about Order", async function () {
            await this.service.close(orderId, {from: owner});
            let order = await this.service.orders(orderId);
            expect(order[0]).to.have.string(ZERO_ADDRESS);
            expect(order[1]).to.be.bignumber.equal(new BN(0));
            expect(order[2]).to.be.bignumber.equal(new BN(0));
        });
        it("increases ETH user balance", async function () {
            let tx = this.service.close(orderId, {from: owner});
            let diff = await balance.differenceExcludeGas(owner, tx, this.gasPrice);
            expect(diff).to.be.bignumber.equal(deposit);
        });
        it("reduces ETH contract balance", async function () {
            let tx = this.service.close(orderId, {from: owner});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a close event', async function () {
            const { logs } = await this.service.close(0, { from: owner });
            expectEvent.inLogs(logs, 'OrderClosed', {
                id: new BN(0),
            });
        });
    });
    describe('Matching a leverage order', function () {

        let deposit = ether("1");
        deposit = new BN(deposit.toString());
        let percent = new BN(115217);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let orderId = new BN(0);

        beforeEach(async function () {
            await this.logic.create(1, { from: owner, value: deposit.mul(new BN(10)) });
            await this.service.create(percent, { from: owner,value: deposit});
        });

        it("reverts non-existent order", async function () {
            await this.service.create(percent, { from: owner,value: deposit});
            let orderId = 1;
            await this.service.close(orderId, { from: owner});

            await expectRevert(this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount}), 'Order doesn\'t exist');
        });
        it("returns when attached value isn't expected", async function () {
            await expectRevert(this.service.takeLeverageOrder(orderId, {value: matchDepo.add(new BN(1)),from: anotherAccount}), 'Incorrect ETH value');
            await expectRevert(this.service.takeLeverageOrder(orderId, {value: matchDepo.sub(new BN(1)),from: anotherAccount}), 'Incorrect ETH value');
        });
        it("returns when the percentage has become impossible", async function () {
            await this.logic.withdrawTmvMax(new BN(0), {from: owner});

            await expectRevert(this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount}), 'Token amount is more than available'); //reverts in ClassicCapitalized
        });
        it("mints 721 token to owner", async function () {
            await this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount});
            let tokenId = 1;
            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(owner, tokenId);

            expect(apprOrOwnr).to.be.true;
        });
        it("transfers mathcing ETH to owner", async function () {
            let tx = this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount});
            let diff = await balance.difference(owner, tx);
            let fee = matchDepo.mul(new BN(5)).div(new BN(1000)); //0.5%

            expect(diff).to.be.bignumber.equal(matchDepo.sub(fee));
        });
        it("mints TMV equivalent to matcher", async function () {
            let balanceBefore = await this.token.balanceOf(anotherAccount);
            await this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount});
            let rate = new BN(10000000);
            let precision = new BN(100000);
            let tmv = matchDepo.mul(rate).div(precision);
            let fee = tmv.mul(new BN(5)).div(new BN(1000)); //0.5%
            let balanceAfter= await this.token.balanceOf(anotherAccount);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tmv.sub(fee));
        });
        it("removes record about matched order", async function () {
            await this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount});
            let order = await this.service.orders(0);

            expect(order[0]).to.have.string(ZERO_ADDRESS);
            expect(order[1]).to.be.bignumber.equal(new BN(0));
            expect(order[2]).to.be.bignumber.equal(new BN(0));
        });
        it("mints TMV equivalent to matcher", async function () {
            let balanceBefore = await this.token.balanceOf(this.service.address);
            let packed = (await this.service.orders(0))[1];
            let tx = this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount});
            let diff = await balance.difference(this.service.address, tx);
            let rate = new BN(10000000);
            let precision = new BN(100000);
            let tmv = matchDepo.mul(rate).div(precision);
            let feeTMV = tmv.mul(new BN(5)).div(new BN(1000)); //0.5%
            let balanceAfter= await this.token.balanceOf(this.service.address);
            let feeETH = matchDepo.mul(new BN(5)).div(new BN(1000)); //0.5%

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(feeTMV);
            expect(diff).to.be.bignumber.equal(packed.sub(feeETH));
        });
        it("emits the matching event", async function () {
            let {logs} = await this.service.takeLeverageOrder(orderId, {value: matchDepo, from: anotherAccount});

            expectEvent.inLogs(logs, 'OrderMatched', {
                id: new BN(0),
                tBox: new BN(1),
            });
        });
    });

    describe('Matching an exchange order', function () {

        let deposit = ether("2");
        let rate, divider, tmv, precision;
        let matchDepo = ether("3");
        let orderId = new BN(0);

        beforeEach(async function () {
            await this.service.create(0, { from: owner, value: deposit});
        });

        it("reverts non-existent order", async function () {
            rate = await this.logic.rate();
            divider = new BN('100000');
            precision = new BN('100000');
            tmv = deposit.mul(rate).div(precision);
            await this.service.close(orderId, { from: owner});

            await expectRevert(this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount}), 'Order doesn\'t exist');
        });
        it("returns when attached value is out of range", async function () {
            let matchDepo = deposit.mul(new BN(115217)).div(divider);

            await expectRevert(this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount}), 'Token amount is more than available');
        });
        it("mints 721 token to owner", async function () {
            await this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount});
            let tokenId = 0;
            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(anotherAccount, tokenId);

            expect(apprOrOwnr).to.be.true;
        });
        it("transfers packed ETH to matcher", async function () {
            let tx = this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount});
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
            await this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount});
            let fee = tmv.mul(new BN(5)).div(new BN(1000)); //0.5%
            let balanceAfter = await this.token.balanceOf(owner);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tmv.sub(fee));
        });
        it("removes record about matched order", async function () {
            await this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount});
            let order = await this.service.orders(0);

            expect(order[0]).to.have.string(ZERO_ADDRESS);
            expect(order[1]).to.be.bignumber.equal(new BN(0));
        });
        it("mints TMV equivalent to matcher", async function () {
            let balanceBefore = await this.token.balanceOf(this.service.address);
            let packed = (await this.service.orders(0))[1];
            let tx = this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount});
            let diff = await balance.difference(this.service.address, tx);
            let tmv = deposit.mul(rate).div(precision);
            let feeTMV = tmv.mul(new BN(5)).div(new BN(1000)); //0.5%
            let balanceAfter = await this.token.balanceOf(this.service.address);
            let feeETH = deposit.mul(new BN(5)).div(new BN(1000)); //0.5%

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(feeTMV);
            expect(diff).to.be.bignumber.equal(packed.sub(feeETH));
        });
        it("emits the matching event", async function () {
            let {logs} = await this.service.takeExchangeOrder(orderId, {value: matchDepo, from: anotherAccount});

            expectEvent.inLogs(logs, 'OrderMatched', {
                id: new BN(0),
                tBox: new BN(0),
            });
        });
    });
    describe('ETH fee withdrawing', function () {

        let deposit = ether("1");
        let percent = new BN(151000);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let orderId = new BN(0);

        beforeEach(async function () {
            await this.service.create(percent, {from: owner, value: deposit});
            await this.service.takeLeverageOrder(orderId, {from: anotherAccount, value: matchDepo});
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
        let percent = new BN(151000);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let orderId = new BN(0);

        beforeEach(async function () {
            await this.service.create(percent, {from: owner, value: deposit});
            await this.service.takeLeverageOrder(orderId, {from: anotherAccount, value: matchDepo});
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
        let leverageFee = new BN(10000);
        let exchangeFee = new BN(10000);
        describe('reverts', function () {

            it("if setting value is higher than 10%", async function () {
                await expectRevert(this.service.setCommission(leverageFee.add(new BN(1)), exchangeFee), 'Too much');
                await expectRevert(this.service.setCommission(leverageFee, exchangeFee.add(new BN(1))), 'Too much');
            });
            it("setting by non-admin", async function () {
                await expectRevert(this.service.setCommission(leverageFee, exchangeFee, {from: anotherAccount}), 'You have no access');
            });
        });
        describe('success', function () {
            it("changes the commission", async function () {
                await this.service.setCommission(leverageFee, exchangeFee);
                let newLeverageFee = await this.service.feeLeverage();
                expect(newLeverageFee).to.be.bignumber.equal(leverageFee);
                let newExchangeFee = await this.service.feeExchange();
                expect(newExchangeFee).to.be.bignumber.equal(exchangeFee);
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
