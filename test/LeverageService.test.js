const {constants, expectEvent, expectRevert, ether } = require('openzeppelin-test-helpers');
const balance = require('./helpers/balances');
const { expect } = require('chai');
const BN = web3.utils.BN;
const { ZERO_ADDRESS } = constants;

const Classic = artifacts.require('Logic');
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

    describe('Bid creating', function () {
        let deposit = ether("2");
        let percent = new BN('150000');
        it('reverts when deposit is very small', async function () {
            let deposit = ether("0.04");
            await expectRevert(this.service.create(percent, { from: owner, value: deposit}), "Too small funds");
        });
        it('reverts when specified percent is higher than available', async function () {
            let percent = 115900;
            await expectRevert(this.service.create(percent, { from: owner, value: deposit}), "Collateralization is not enough");
        });
        it('creates record about new Bid', async function () {
            await this.service.create(percent, { from: owner,value: deposit});
            let bid = await this.service.bids.call(0);
            expect(bid[0]).to.have.string(owner);
            expect(bid[1]).to.be.bignumber.equal(deposit);
            expect(bid[2]).to.be.bignumber.equal(percent);
        });
        it('increases the contract balance', async function () {
            let tx = this.service.create(percent, { value: deposit});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a create event', async function () {
            const { logs } = await this.service.create(percent, { from: owner, value: deposit });
            expectEvent.inLogs(logs, 'BidCreated', {
                id: new BN(0),
                owner: owner,
                pack: deposit,
            });
        });
    });
    describe('Closing', function () {

        let deposit = ether("1");
        let percent = new BN('150000');
        let bidId = new BN(0);

        beforeEach(async function () {
            await this.service.create(percent, { from: owner,value: deposit});
        });

        it("reverts closing by alien", async function () {
            await expectRevert(this.service.close(new BN(0), {from: anotherAccount}), 'Bid isn\'t your');
        });
        it("removes a record about Bid", async function () {
            await this.service.close(bidId, {from: owner});
            let bid = await this.service.bids(bidId);
            expect(bid[0]).to.have.string(ZERO_ADDRESS);
            expect(bid[1]).to.be.bignumber.equal(new BN(0));
            expect(bid[2]).to.be.bignumber.equal(new BN(0));
        });
        it("increases ETH user balance", async function () {
            let tx = this.service.close(bidId, {from: owner});
            let diff = await balance.differenceExcludeGas(owner, tx, this.gasPrice);
            expect(diff).to.be.bignumber.equal(deposit);
        });
        it("reduces ETH contract balance", async function () {
            let tx = this.service.close(bidId, {from: owner});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a close event', async function () {
            const { logs } = await this.service.close(0, { from: owner });
            expectEvent.inLogs(logs, 'BidClosed', {
                id: new BN(0),
            });
        });
    });
    describe('Matching', function () {

        let deposit = ether("1");
        deposit = new BN(deposit.toString());
        let percent = new BN(115217);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let bidId = new BN(0);

        beforeEach(async function () {
            await this.logic.create(1, { from: owner, value: deposit.mul(new BN(10)) });
            await this.service.create(percent, { from: owner,value: deposit});
        });

        it("reverts non-existent bid", async function () {
            await this.service.create(percent, { from: owner,value: deposit});
            let bidId = 1;
            await this.service.close(bidId, { from: owner});

            await expectRevert(this.service.take(bidId, {value: matchDepo, from: anotherAccount}), 'Bid doesn\'t exist');
        });
        it("returns when attached value isn't expected", async function () {
            await expectRevert(this.service.take(bidId, {value: matchDepo.add(new BN(1)),from: anotherAccount}), 'Incorrect ETH value');
            await expectRevert(this.service.take(bidId, {value: matchDepo.sub(new BN(1)),from: anotherAccount}), 'Incorrect ETH value');
        });
        it("returns when the percentage has become impossible", async function () {
            await this.logic.withdrawTmvMax(new BN(0), {from: owner});

            await expectRevert(this.service.take(bidId, {value: matchDepo, from: anotherAccount}), 'Token amount is more than available'); //reverts in ClassicCapitalized
        });
        it("mints 721 token to owner", async function () {
            await this.service.take(bidId, {value: matchDepo, from: anotherAccount});
            let tokenId = 1;
            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(owner, tokenId);

            expect(apprOrOwnr).to.be.true;
        });
        it("transfers mathcing ETH to owner", async function () {
            let tx = this.service.take(bidId, {value: matchDepo, from: anotherAccount});
            let diff = await balance.difference(owner, tx);
            let fee = matchDepo.mul(new BN(5)).div(new BN(1000)); //0.5%

            expect(diff).to.be.bignumber.equal(matchDepo.sub(fee));
        });
        it("mints TMV equivalent to matcher", async function () {
            let balanceBefore = await this.token.balanceOf(anotherAccount);
            await this.service.take(bidId, {value: matchDepo, from: anotherAccount});
            let rate = new BN(10000000);
            let precision = new BN(100000);
            let tmv = matchDepo.mul(rate).div(precision);
            let fee = tmv.mul(new BN(5)).div(new BN(1000)); //0.5%
            let balanceAfter= await this.token.balanceOf(anotherAccount);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tmv.sub(fee));
        });
        it("removes record about matched bid", async function () {
            await this.service.take(bidId, {value: matchDepo, from: anotherAccount});
            let bid = await this.service.bids(0);

            expect(bid[0]).to.have.string(ZERO_ADDRESS);
            expect(bid[1]).to.be.bignumber.equal(new BN(0));
            expect(bid[2]).to.be.bignumber.equal(new BN(0));
        });
        it("mints TMV equivalent to matcher", async function () {
            let balanceBefore = await this.token.balanceOf(this.service.address);
            let packed = (await this.service.bids(0))[1];
            let tx = this.service.take(bidId, {value: matchDepo, from: anotherAccount});
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
            let {logs} = await this.service.take(bidId, {value: matchDepo, from: anotherAccount});

            expectEvent.inLogs(logs, 'BidMatched', {
                id: new BN(0),
                tBox: new BN(1),
            });
        });
    });
    describe('ETH fee withdrawing', function () {

        let deposit = ether("1");
        let percent = new BN(151000);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let bidId = new BN(0);

        beforeEach(async function () {
            await this.service.create(percent, {from: owner, value: deposit});
            await this.service.take(bidId, {from: anotherAccount, value: matchDepo});
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
        let bidId = new BN(0);

        beforeEach(async function () {
            await this.service.create(percent, {from: owner, value: deposit});
            await this.service.take(bidId, {from: anotherAccount, value: matchDepo});
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
