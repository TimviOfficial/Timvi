const {constants, expectEvent, expectRevert, time, ether} = require('openzeppelin-test-helpers');
const balance = require('./helpers/balances');
const BN = web3.utils.BN;
const { expect } = require('chai');

const { ZERO_ADDRESS } = constants;

const Classic = artifacts.require('TBoxManager');
const Settings = artifacts.require('TimviSettings');
const Token = artifacts.require('TimviToken');
const Oracle = artifacts.require('OracleContractMock');
const BondService = artifacts.require('BondService');

contract('BondService', function ([_, issuer, holder, anotherAccount]) {

    // deploy & initial settings
    beforeEach(async function () {
        this.settings = await Settings.new();
        this.logic = await Classic.new(this.settings.address);
        this.token = await Token.new(this.settings.address);
        this.oracle = await Oracle.new();
        await this.settings.setTmvAddress(this.token.address);
        await this.settings.setOracleAddress(this.oracle.address);
        const receipt = await this.settings.setContractManager(this.logic.address);
        this.service = await BondService.new(this.settings.address);

        const tx = await web3.eth.getTransaction(receipt.tx);
        this.gasPrice = new BN(tx.gasPrice);
    });

    describe('Apply leverage creating', function () {
        let deposit = ether("1");
        let percent = new BN('150000');
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        describe('reverts', function () {
            it('when deposit is very small', async function () {
                let deposit = ether("1").div(new BN(20));

                await expectRevert(this.service.leverage(percent, expiration, yearFee, { from: issuer, value: deposit}), "Too small funds");
            });
            it('when specified percent is higher than available', async function () {
                let percent = 115900;

                await expectRevert(this.service.leverage(percent, expiration, yearFee, { from: issuer, value: deposit}), "Collateralization is not enough");
            });
            it('when year fee is higher than 25%', async function () {
                let yearFee = new BN('25001');

                await expectRevert(this.service.leverage(percent, expiration, yearFee, { from: issuer, value: deposit}), "Fee out of range");
            });
            it('when expiration out of range', async function () {
                let expiration1 = new BN(24 * 60 * 60 - 1);
                let expiration2 = new BN(365 * 24 * 60 * 60 + 1);

                await expectRevert(this.service.leverage(percent, expiration1, yearFee, { from: issuer, value: deposit}), "Expiration out of range");
                await expectRevert(this.service.leverage(percent, expiration2, yearFee, { from: issuer, value: deposit}), "Expiration out of range");
            });
        });
        describe('success', function () {
            it('creates record about new Bond', async function () {
                await this.service.leverage(percent, expiration, yearFee, { from: issuer, value: deposit});
                let bond = await this.service.bonds.call(0);
                expect(bond[0]).to.have.string(issuer);
                expect(bond[1]).to.have.string(ZERO_ADDRESS);
                expect(bond[2]).to.be.bignumber.equal(deposit);
                expect(bond[3]).to.be.bignumber.equal(percent);
                expect(bond[4]).to.be.bignumber.equal(new BN(0));
                expect(bond[5]).to.be.bignumber.equal(expiration);
                expect(bond[6]).to.be.bignumber.equal(yearFee);
                expect(bond[7]).to.be.bignumber.equal(new BN(0));
                expect(bond[8]).to.be.bignumber.equal(new BN(0));
                expect(bond[9]).to.be.bignumber.equal(new BN(0));
            });
            it('increases the contract balance', async function () {
                let tx = this.service.leverage(percent, expiration, yearFee, { value: deposit});
                expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
            });
            it('emits a create event', async function () {
                const { logs } = await this.service.leverage(percent, expiration, yearFee, { from: issuer, value: deposit });
                expectEvent.inLogs(logs, 'BondCreated', {
                    id: new BN(0),
                    who: issuer,
                    deposit: deposit,
                    percent: percent,
                });
            });
        });
    });

    describe('Apply exchange creating', function () {
        let deposit = ether("1");
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        describe('reverts', function () {
            it('when deposit is very small', async function () {
                let deposit = ether("1").div(new BN(20));

                await expectRevert(this.service.exchange(expiration, yearFee, { from: issuer, value: deposit}), "Too small funds");
            });
            it('when year fee is higher than 25%', async function () {
                let yearFee = new BN('25001');

                await expectRevert(this.service.exchange(expiration, yearFee, { from: issuer, value: deposit}), "Fee out of range");
            });
            it('when expiration out of range', async function () {
                let expiration1 = new BN(24 * 60 * 60 - 1);
                let expiration2 = new BN(365 * 24 * 60 * 60 + 1);

                await expectRevert(this.service.exchange(expiration1, yearFee, { from: issuer, value: deposit}), "Expiration out of range");
                await expectRevert(this.service.exchange(expiration2, yearFee, { from: issuer, value: deposit}), "Expiration out of range");
            });
        });
        describe('success', function () {
            it('creates record about new Bond', async function () {
                await this.service.exchange(expiration, yearFee, { from: issuer, value: deposit});
                let bond = await this.service.bonds(0);
                expect(bond[0]).to.have.string(ZERO_ADDRESS);
                expect(bond[1]).to.have.string(issuer);
                expect(bond[2]).to.be.bignumber.equal(deposit);
                expect(bond[3]).to.be.bignumber.equal(new BN(0));
                expect(bond[4]).to.be.bignumber.equal(new BN(0));
                expect(bond[5]).to.be.bignumber.equal(expiration);
                expect(bond[6]).to.be.bignumber.equal(yearFee);
                expect(bond[7]).to.be.bignumber.equal(new BN(0));
                expect(bond[8]).to.be.bignumber.equal(new BN(0));
                expect(bond[9]).to.be.bignumber.equal(new BN(0));
            });
            it('increases the contract balance', async function () {
                let tx = this.service.exchange(expiration, yearFee, { value: deposit});
                expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
            });
            it('emits a create event', async function () {
                const { logs } = await this.service.exchange(expiration, yearFee, { from: issuer, value: deposit });
                expectEvent.inLogs(logs, 'BondCreated', {
                    id: new BN(0),
                    who: issuer,
                    deposit: deposit,
                    percent: new BN(0),
                });
            });
        });
    });

    describe('Changing bond', function () {

        let deposit = ether("1");
        let newDeposit = ether("2");
        let deltaDeposit = newDeposit.sub(deposit);
        let percent = new BN('150000');
        let yearFee = new BN('9000');
        let expiration = new BN(30*24*60*60);
        let bondId = new BN(0);

        beforeEach(async function () {
            let percent = new BN('150232');
            let yearFee = new BN('10000');
            let expiration = new BN(60*24*60*60);
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
        });

        describe('reverts', function () {
            it('when deposit is very small', async function () {
                let newDeposit = ether("1").div(new BN(20));

                await expectRevert(this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer, value: deltaDeposit}), "Too small funds");
            });
            it("when deposit isn't matched", async function () {
                let deltaDeposit = ether("1").div(new BN(2));

                await expectRevert(this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer, value: deltaDeposit.sub(new BN(1))}), "Incorrect value");
                await expectRevert(this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer, value: deltaDeposit.add(new BN(1))}), "Incorrect value");
            });
            it('when specified percent is higher than available', async function () {
                let percent = 115900;

                await expectRevert(this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer, value: deltaDeposit}), "Collateralization is not enough");
            });
            it('when year fee is higher than 25%', async function () {
                let yearFee = new BN('25001');

                await expectRevert(this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer, value: deltaDeposit}), "Fee out of range");
            });
            it('when expiration out of range', async function () {
                let expiration1 = new BN(24 * 60 * 60 - 1);
                let expiration2 = new BN(365 * 24 * 60 * 60 + 1);

                await expectRevert(this.service.issuerChange(bondId, newDeposit, percent, expiration1, yearFee, { from: issuer, value: deltaDeposit}), "Expiration out of range");
                await expectRevert(this.service.issuerChange(bondId, newDeposit, percent, expiration2, yearFee, { from: issuer, value: deltaDeposit}), "Expiration out of range");
            });
            it('changes by non-holder', async function () {
                await this.service.exchange(expiration, yearFee, { from: holder,value: deposit});
                let bondId = new BN(1);
                await expectRevert(this.service.holderChange(bondId, newDeposit, expiration, yearFee, { from: anotherAccount, value: deltaDeposit}), 'You are not the holder');
            });
        });
        describe('success', function () {
            it('updates record about the Bond', async function () {
                await this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer, value: deltaDeposit});
                let bond = await this.service.bonds(0);
                expect(bond[0]).to.have.string(issuer);
                expect(bond[1]).to.have.string(ZERO_ADDRESS);
                expect(bond[2]).to.be.bignumber.equal(newDeposit);
                expect(bond[3]).to.be.bignumber.equal(percent);
                expect(bond[4]).to.be.bignumber.equal(new BN(0));
                expect(bond[5]).to.be.bignumber.equal(expiration);
                expect(bond[6]).to.be.bignumber.equal(yearFee);
                expect(bond[7]).to.be.bignumber.equal(new BN(0));
                expect(bond[8]).to.be.bignumber.equal(new BN(0));
                expect(bond[9]).to.be.bignumber.equal(new BN(0));
            });
            it('not changes old values', async function () {
                let percent = new BN('150232');
                let yearFee = new BN(10000);
                let expiration = new BN(60*24*60*60);
                await this.service.issuerChange(bondId, deposit, percent, expiration, yearFee, { from: issuer});
                let bond = await this.service.bonds(0);
                expect(bond[0]).to.have.string(issuer);
                expect(bond[1]).to.have.string(ZERO_ADDRESS);
                expect(bond[2]).to.be.bignumber.equal(deposit);
                expect(bond[3]).to.be.bignumber.equal(percent);
                expect(bond[4]).to.be.bignumber.equal(new BN(0));
                expect(bond[5]).to.be.bignumber.equal(expiration);
                expect(bond[6]).to.be.bignumber.equal(yearFee);
                expect(bond[7]).to.be.bignumber.equal(new BN(0));
                expect(bond[8]).to.be.bignumber.equal(new BN(0));
                expect(bond[9]).to.be.bignumber.equal(new BN(0));
            });
            it('when old deposit is higher than new', async function () {
                let deposit = ether("2");
                let newDeposit = ether("1");
                await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
                let bondId = 1;
                let tx = this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer});
                let diff = await balance.differenceExcludeGas(issuer, tx, this.gasPrice);
                expect(diff).to.be.bignumber.equal(deltaDeposit);
            });
            it('changes by holder', async function () {
                await this.service.exchange(expiration, yearFee, { from: holder,value: deposit});
                let bondId = new BN(1);
                await this.service.holderChange(bondId, newDeposit, expiration, yearFee, { from: holder, value: deltaDeposit});
            });
            it('increases the contract balance', async function () {
                let tx = this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, {from: issuer,  value: deposit});
                expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deltaDeposit);
            });
            it('reduces the user balance', async function () {
                let tx = this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, {from: issuer,  value: deposit});
                expect((await balance.differenceExcludeGas(issuer, tx, this.gasPrice))).to.be.bignumber.equal(deltaDeposit);
            });
            it('emits a change event', async function () {
                const { logs } = await this.service.issuerChange(bondId, newDeposit, percent, expiration, yearFee, { from: issuer, value: deposit });
                expectEvent.inLogs(logs, 'BondChanged', {
                    id: new BN(0),
                    deposit: newDeposit,
                    percent: percent,
                    expiration: expiration,
                    yearFee: yearFee,
                });
            });
        });
    });
    describe('Closing leverage', function () {

        let deposit = ether("1");
        let percent = new BN('150000');
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        let bondId = new BN(0);

        beforeEach(async function () {
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
        });

        it("reverts closing by alien", async function () {
            await expectRevert(this.service.close(new BN(0), {from: anotherAccount}), 'You are not the single owner');
        });
        it("removes a record about Bond", async function () {
            await this.service.close(bondId, {from: issuer});
            let bond = await this.service.bonds(0);
            expect(bond[0]).to.have.string(ZERO_ADDRESS);
            expect(bond[1]).to.have.string(ZERO_ADDRESS);
            expect(bond[2]).to.be.bignumber.equal(new BN(0));
            expect(bond[3]).to.be.bignumber.equal(new BN(0));
            expect(bond[4]).to.be.bignumber.equal(new BN(0));
            expect(bond[5]).to.be.bignumber.equal(new BN(0));
            expect(bond[6]).to.be.bignumber.equal(new BN(0));
            expect(bond[7]).to.be.bignumber.equal(new BN(0));
            expect(bond[8]).to.be.bignumber.equal(new BN(0));
            expect(bond[9]).to.be.bignumber.equal(new BN(0));
        });
        it("increases ETH user balance", async function () {
            let tx = this.service.close(bondId, {from: issuer});
            let diff = await balance.differenceExcludeGas(issuer, tx, this.gasPrice);
            expect(diff).to.be.bignumber.equal(deposit);
        });
        it("reduces ETH contract balance", async function () {
            let tx = this.service.close(bondId, {from: issuer});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a close event', async function () {
            const { logs } = await this.service.close(0, { from: issuer });
            expectEvent.inLogs(logs, 'BondClosed', {
                id: new BN(0),
            });
        });
    });
    describe('Closing exchange', function () {

        let deposit = ether("1");
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        let bondId = new BN(0);

        beforeEach(async function () {
            await this.service.exchange(expiration, yearFee, { from: issuer,value: deposit});
        });

        it("reverts closing by alien", async function () {
            await expectRevert(this.service.close(new BN(0), {from: anotherAccount}), 'You are not the single owner');
        });
        it("removes a record about Bond", async function () {
            await this.service.close(bondId, {from: issuer});
            let bond = await this.service.bonds(0);
            expect(bond[0]).to.have.string(ZERO_ADDRESS);
            expect(bond[1]).to.have.string(ZERO_ADDRESS);
            expect(bond[2]).to.be.bignumber.equal(new BN(0));
            expect(bond[3]).to.be.bignumber.equal(new BN(0));
            expect(bond[4]).to.be.bignumber.equal(new BN(0));
            expect(bond[5]).to.be.bignumber.equal(new BN(0));
            expect(bond[6]).to.be.bignumber.equal(new BN(0));
            expect(bond[7]).to.be.bignumber.equal(new BN(0));
            expect(bond[8]).to.be.bignumber.equal(new BN(0));
            expect(bond[9]).to.be.bignumber.equal(new BN(0));
        });
        it("increases ETH user balance", async function () {
            let tx = this.service.close(bondId, {from: issuer});
            let diff = await balance.differenceExcludeGas(issuer, tx, this.gasPrice);
            expect(diff).to.be.bignumber.equal(deposit);
        });
        it("reduces ETH contract balance", async function () {
            let tx = this.service.close(bondId, {from: issuer});
            expect((await balance.difference(this.service.address, tx))).to.be.bignumber.equal(deposit);
        });
        it('emits a close event', async function () {
            const { logs } = await this.service.close(0, { from: issuer });
            expectEvent.inLogs(logs, 'BondClosed', {
                id: new BN(0),
            });
        });
    });
    describe('Matching leverage', function () {

        let deposit = new BN(ether("1").toString());
        let percent = new BN(115217);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        let bondId = new BN(0);
        let tmv;

        beforeEach(async function () {
            await this.logic.create(1, { from: issuer, value: deposit.mul(new BN(10)) });
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
        });

        it('reverts on front-running attack attempt', async function () {
            await expectRevert(this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder, gasPrice: new BN("21000000000")}), "Gas price is greater than allowed");
        });
        it("reverts non-existent bid", async function () {
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
            let bondId = 1;
            await this.service.close(bondId, { from: issuer});

            await expectRevert(this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder}), 'The bond isn\'t an emit request');
        });
        it("returns when attached value isn't expected", async function () {
            await expectRevert(this.service.takeIssueRequest(bondId, {value: matchDepo.add(new BN(1)),from: holder}), 'Incorrect ETH value');
            await expectRevert(this.service.takeIssueRequest(bondId, {value: matchDepo.sub(new BN(1)),from: holder}), 'Incorrect ETH value');
        });
        it("returns when the percentage has become impossible", async function () {
            await this.logic.withdrawTmvMax(new BN(0), {from: issuer});



            await expectRevert(this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder}), 'Token amount is more than available'); //reverts in ClassicCapitalized

        });
        it("mints 721 token to service contract", async function () {
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});
            let tBoxId = new BN(1);
            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(this.service.address, tBoxId);

            expect(apprOrOwnr).to.be.true;
        });
        it("transfers mathcing ETH to issuer", async function () {
            let tx = this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});
            let diff = await balance.difference(issuer, tx);
            let fee = matchDepo.mul(new BN(5)).div(new BN(1000)); //0.5%

            expect(diff).to.be.bignumber.equal(matchDepo.sub(fee));
        });
        it("mints TMV equivalent to matcher", async function () {
            let balanceBefore = await this.token.balanceOf(holder);
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});
            let rate = new BN(10000000);
            let precision = new BN(100000);
            tmv = matchDepo.mul(rate).div(precision);
            let balanceAfter= await this.token.balanceOf(holder);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tmv);
        });
        it("updates record about matched bond", async function () {
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});
            let timestamp = await time.latest();
            let bond = await this.service.bonds(bondId);

            expect(bond[0]).to.have.string(issuer);
            expect(bond[1]).to.have.string(holder);
            expect(bond[2]).to.be.bignumber.equal(deposit);
            expect(bond[3]).to.be.bignumber.equal(percent);
            expect(bond[4]).to.be.bignumber.equal(tmv);
            expect(bond[5]).to.be.bignumber.equal(expiration.add(timestamp));
            expect(bond[6]).to.be.bignumber.equal(yearFee);
            expect(bond[7]).to.be.bignumber.equal(new BN(10000));
            expect(bond[8]).to.be.bignumber.equal(new BN(1));
            expect(bond[9]).to.be.bignumber.equal(timestamp);
        });
        it("emits the matching event", async function () {
            let {logs} = await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});

            expectEvent.inLogs(logs, 'BondMatched', {
                id: new BN(0),
                tBox: new BN(1),
            });
        });
    });
    describe('Matching exchange', function () {

        let deposit = ether("1");
        let matchDepo = deposit.mul(new BN(2));
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        let bondId = new BN(0);
        let tmv;

        beforeEach(async function () {
            await this.logic.create(1, { from: holder, value: deposit.mul(new BN(10)) });
            await this.service.exchange(expiration, yearFee, { from: holder,value: deposit});
        });

        it('reverts on front-running attack attempt', async function () {
            await expectRevert(this.service.takeBuyRequest(bondId, {value: matchDepo, from: issuer, gasPrice: new BN("21000000000")}), "Gas price is greater than allowed");
        });
        it("reverts non-existent order", async function () {
            await this.service.exchange(expiration, yearFee, { from: holder, value: deposit});
            let bondId = 1;
            await this.service.close(bondId, { from: holder});

            await expectRevert(this.service.takeBuyRequest(bondId, {value: matchDepo, from: issuer}), 'The bond isn\'t a buy request');
        });
        it("returns when attached value is less than possible", async function () {
            await expectRevert(this.service.takeBuyRequest(bondId, {value: matchDepo.div(new BN(2)),from: issuer}), 'Token amount is more than available');
        });
        it("mints 721 token to service contract", async function () {
            await this.service.takeBuyRequest(bondId, {value: matchDepo, from: issuer});
            let tBoxId = 1;
            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(this.service.address, tBoxId);

            expect(apprOrOwnr).to.be.true;
        });
        it("transfers packed ETH to matcher", async function () {
            let tx = this.service.takeBuyRequest(bondId, {value: matchDepo, from: issuer});
            let diff = await balance.differenceExcludeGas(issuer, tx, this.gasPrice);
            let fee = deposit.mul(new BN(5)).div(new BN(1000)); //0.5%
            let calculatedDiff = matchDepo.sub(deposit).add(fee);

            expect(diff).to.be.bignumber.equal(calculatedDiff);
        });
        it("mints TMV equivalent to holder", async function () {
            let balanceBefore = await this.token.balanceOf(holder);
            await this.service.takeBuyRequest(bondId, {value: matchDepo, from: issuer});
            let rate = new BN(10000000);
            let precision = new BN(100000);
            tmv = deposit.mul(rate).div(precision);
            let balanceAfter= await this.token.balanceOf(holder);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tmv);
        });
        it("updates record about matched bond", async function () {
            await this.service.takeBuyRequest(bondId, {value: matchDepo, from: issuer});
            let timestamp = await time.latest();
            let bond = await this.service.bonds(bondId);

            expect(bond[0]).to.have.string(issuer);
            expect(bond[1]).to.have.string(holder);
            expect(bond[2]).to.be.bignumber.equal(deposit);
            expect(bond[3]).to.be.bignumber.equal(new BN(0));
            expect(bond[4]).to.be.bignumber.equal(tmv);
            expect(bond[5]).to.be.bignumber.equal(expiration.add(timestamp));
            expect(bond[6]).to.be.bignumber.equal(yearFee);
            expect(bond[7]).to.be.bignumber.equal(new BN(10000));
            expect(bond[8]).to.be.bignumber.equal(new BN(1));
            expect(bond[9]).to.be.bignumber.equal(timestamp);
        });
        it("emits the matching event", async function () {
            let {logs} = await this.service.takeBuyRequest(bondId, {value: matchDepo, from: issuer});

            expectEvent.inLogs(logs, 'BondMatched', {
                id: new BN(0),
                tBox: new BN(1),
            });
        });
    });
    describe('Finishing', function () {

        let deposit = ether("1");
        let percent = new BN(155217);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let yearFee = new BN('10000');
        let divivder = new BN('100000');
        let expiration = new BN(30*24*60*60);
        let tmv, commission, sysCom, createdAt, boxId, bondId;

        beforeEach(async function () {
            let rate = new BN(10000000);
            let precision = new BN(100000);
            tmv = matchDepo.mul(rate).div(precision);
            const { logs } = await this.service.leverage(percent, expiration, yearFee, { from: issuer, value: deposit });
            bondId = logs[0].args.id;
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder });
            boxId = (await this.service.bonds(bondId)).tBoxId;
            createdAt = await time.latest();
            await this.token.transfer(issuer, tmv, {from: holder});
            await this.logic.create(1000, {from: issuer, value: deposit.mul(new BN(10))});
            await this.logic.withdrawTmvMax(1, {from: issuer});
            await this.token.approve(this.service.address, constants.MAX_INT256, {from: issuer});
        });

        it('reverts on front-running attack attempt', async function () {
            await expectRevert(this.service.finish(bondId, {from: issuer, gasPrice: new BN("21000000000")}), "Gas price is greater than allowed");
        });
        it("reverts finishing from alien", async function () {
            await expectRevert(this.service.finish(bondId, {from: anotherAccount}), 'You are not the issuer');
        });

        it("reverts expired bond", async function () {
            await time.increase(expiration);
            await expectRevert(this.service.finish(bondId, {from: issuer}), 'Bond expired');
        });
        it("reverts when approved token amount is less than need to close", async function () {
            await time.increase(expiration.div(new BN(2)));
            await this.token.approve(this.service.address, 0, {from: issuer});
            await expectRevert.unspecified(this.service.finish(bondId, {from: issuer}));
        });
        it("reverts when approved token amount is less than need to pay commission", async function () {
            await time.increase(expiration.div(new BN(2)));
            let secondsPast = expiration.div(new BN(2));
            let year = new BN(365*24*60*60);
            commission = tmv.mul(secondsPast).mul(yearFee).div(year).div(divivder);
            await this.token.approve(this.service.address, commission.sub(new BN(1)), {from: issuer});
            await expectRevert.unspecified(this.service.finish(bondId, {from: issuer}));
        });
        it("removes bond when tbox doesn't exist", async function () {
            await this.oracle.setPrice(7000000);
            await this.logic.create(0, {from: anotherAccount, value: deposit.mul(new BN(10))});
            await this.logic.withdrawTmvMax(2, {from: anotherAccount});

            await this.logic.capitalizeMax(0, {from: anotherAccount});
            await this.oracle.setPrice(6500000);

            await this.logic.capitalizeMax(0, {from: anotherAccount});
            await this.logic.closeDust(0, {from: anotherAccount});

            await this.service.finish(bondId, {from: issuer});

            let bond = await this.service.bonds(bondId);
            expect(bond[0]).to.have.string(ZERO_ADDRESS);
            expect(bond[1]).to.have.string(ZERO_ADDRESS);
            expect(bond[2]).to.be.bignumber.equal(new BN(0));
            expect(bond[3]).to.be.bignumber.equal(new BN(0));
            expect(bond[4]).to.be.bignumber.equal(new BN(0));
            expect(bond[5]).to.be.bignumber.equal(new BN(0));
            expect(bond[6]).to.be.bignumber.equal(new BN(0));
            expect(bond[7]).to.be.bignumber.equal(new BN(0));
            expect(bond[8]).to.be.bignumber.equal(new BN(0));
            expect(bond[9]).to.be.bignumber.equal(new BN(0));
        });
        it("0 commission", async function () {
            await this.service.setHolderFee(0);
            let bondId = 1;

            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});

            await this.logic.addTmv(2, tmv, {from: issuer});

            await this.service.finish(bondId, {from: issuer});
        });
        it("removes record about Bond", async function () {
            await this.service.finish(bondId, {from: issuer});

            let bond = await this.service.bonds(bondId);
            expect(bond[0]).to.have.string(ZERO_ADDRESS);
            expect(bond[1]).to.have.string(ZERO_ADDRESS);
            expect(bond[2]).to.be.bignumber.equal(new BN(0));
            expect(bond[3]).to.be.bignumber.equal(new BN(0));
            expect(bond[4]).to.be.bignumber.equal(new BN(0));
            expect(bond[5]).to.be.bignumber.equal(new BN(0));
            expect(bond[6]).to.be.bignumber.equal(new BN(0));
            expect(bond[7]).to.be.bignumber.equal(new BN(0));
            expect(bond[8]).to.be.bignumber.equal(new BN(0));
            expect(bond[9]).to.be.bignumber.equal(new BN(0));
        });
        it("success finishes after past time", async function () {
            await time.increase(expiration.div(new BN(2)));
            let secondsPast = expiration.div(new BN(2));
            let year = new BN(365*24*60*60);
            commission = tmv.mul(secondsPast).mul(yearFee).div(year).div(divivder);
            sysCom = commission.mul(new BN('10000')).div(divivder);
            await this.service.finish(bondId, {from: issuer});
            // console.log((await this.token.balanceOf(issuer)).sub(new BN('68450026049437784229')).toString())
        });
        it('sends TBox to issuer', async function() {
            await this.service.finish(bondId, { from: issuer });
            const boxOwner = await this.logic.ownerOf(boxId);
            expect(boxOwner).to.equal(issuer);
        });
        it("emits a finish event", async function () {
            let {logs} = await this.service.finish(bondId, {from: issuer});

            expectEvent.inLogs(logs, 'BondFinished', {
                id: new BN(0),
            });
        });
        it("commission stays on the contract", async function () {

            await time.increase(expiration.div(new BN(2)));

            let balanceBefore = await this.token.balanceOf(this.service.address);

            await this.service.finish(bondId, {from: issuer});

            let finishTime = await time.latest();
            let secondsPast = finishTime.sub(createdAt);
            let year = new BN(365*24*60*60);
            commission = tmv.mul(secondsPast).mul(yearFee).div(year).div(divivder);
            sysCom = commission.mul(new BN('10000')).div(divivder);

            let balanceAfter = await this.token.balanceOf(this.service.address);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(sysCom);
        });
        it("sends year fee to holder", async function () {

            await time.increase(expiration.div(new BN(2)));

            let balanceBefore = await this.token.balanceOf(holder);

            await this.service.finish(bondId, {from: issuer});

            let finishTime = await time.latest();
            let secondsPast = finishTime.sub(createdAt);
            let year = new BN(365*24*60*60);
            commission = tmv.mul(secondsPast).mul(yearFee).div(year).div(divivder);
            sysCom = commission.mul(new BN('10000')).div(divivder);

            let balanceAfter = await this.token.balanceOf(holder);

            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(commission.sub(sysCom));
        });
    });
    describe('Expiration', function () {

        let deposit = ether("1");
        let percent = new BN(155217);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        let bondId = new BN(0);
        let tmv, createdAt, rate;

        beforeEach(async function () {
            rate = new BN(10000000);
            let precision = new BN(100000);
            tmv = matchDepo.mul(rate).div(precision);
            await this.service.leverage(percent, expiration, yearFee, {from: issuer,value: deposit});
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});
            createdAt = await time.latest();
            await time.increase(expiration.add(new BN(1)));
        });

        it('reverts on front-running attack attempt', async function () {
            await expectRevert(this.service.expire(bondId, {from: issuer, gasPrice: new BN("21000000000")}), "Gas price is greater than allowed");
        });
        it("reverts not expired bond", async function () {
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
            let bondId = 1;
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});

            await expectRevert(this.service.expire(bondId, {from: anotherAccount}), 'Bond hasn\'t expired');
        });
        it("reverts not matched bond", async function () {
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
            let bondId = 1;

            await expectRevert(this.service.expire(bondId, {from: anotherAccount}), 'Bond isn\'t matched');
        });
        it("removes bond when tbox doesn't exist", async function () {
            await this.oracle.setPrice(7000000);
            await this.logic.create(0, {from: anotherAccount, value: deposit.mul(new BN(10))});
            await this.logic.withdrawTmvMax(1, {from: anotherAccount});

            await this.logic.capitalizeMax(0, {from: anotherAccount});
            await this.oracle.setPrice(6500000);

            await this.logic.capitalizeMax(0, {from: anotherAccount});
            await this.logic.closeDust(0, {from: anotherAccount});

            await this.service.expire(bondId, {from: issuer});

            let bond = await this.service.bonds(bondId);
            expect(bond[0]).to.have.string(ZERO_ADDRESS);
            expect(bond[1]).to.have.string(ZERO_ADDRESS);
            expect(bond[2]).to.be.bignumber.equal(new BN(0));
            expect(bond[3]).to.be.bignumber.equal(new BN(0));
            expect(bond[4]).to.be.bignumber.equal(new BN(0));
            expect(bond[5]).to.be.bignumber.equal(new BN(0));
            expect(bond[6]).to.be.bignumber.equal(new BN(0));
            expect(bond[7]).to.be.bignumber.equal(new BN(0));
            expect(bond[8]).to.be.bignumber.equal(new BN(0));
            expect(bond[9]).to.be.bignumber.equal(new BN(0));
        });
        it("transfers TBox ownership to Bond holder", async function () {

            let tBox = await this.logic.boxes(0);
            let tmv = tBox.tmvReleased;
            await this.logic.create(0, {from: anotherAccount, value: deposit.mul(new BN(10))});
            await this.logic.withdrawTmvMax(1, {from: anotherAccount});
            await this.logic.addTmv(0, tmv, {from: anotherAccount});
            await this.service.expire(bondId, {from: holder});
        });
        it("0-TMV TBox", async function () {
            await this.service.expire(bondId, {from: holder});

            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(holder, 0);

            expect(apprOrOwnr).to.be.true;
        });
        it("removes bond", async function () {
            await this.service.expire(bondId, {from: holder});

            let bond = await this.service.bonds(bondId);
            expect(bond[0]).to.have.string(ZERO_ADDRESS);
            expect(bond[1]).to.have.string(ZERO_ADDRESS);
            expect(bond[2]).to.be.bignumber.equal(new BN(0));
            expect(bond[3]).to.be.bignumber.equal(new BN(0));
            expect(bond[4]).to.be.bignumber.equal(new BN(0));
            expect(bond[5]).to.be.bignumber.equal(new BN(0));
            expect(bond[6]).to.be.bignumber.equal(new BN(0));
            expect(bond[7]).to.be.bignumber.equal(new BN(0));
            expect(bond[8]).to.be.bignumber.equal(new BN(0));
            expect(bond[9]).to.be.bignumber.equal(new BN(0));
        });
        it("emits a expiration event", async function () {
            let {logs} = await this.service.expire(bondId, {from: holder});

            expectEvent.inLogs(logs, 'BondExpired', {
                id: new BN(0),
            });
        });
        it("expiration with 0 commission", async function () {

            await this.service.setHolderFee(0);
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
            let bondId = new BN(1);
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});
            await time.increase(expiration.add(new BN(1)));
            await this.service.expire(bondId, {from: holder});
        });
        it("Returns overcollateralization to the issuer", async function () {
            let gtc = await this.settings.globalTargetCollateralization();
            let ethNeedToCollateral = tmv.mul(gtc).div(rate);
            let calculatedOvercol = deposit.sub(ethNeedToCollateral);

            let tx = this.service.expire(bondId, {from: holder});
            let diff = await balance.difference(issuer, tx);

            expect(diff).to.be.bignumber.equal(calculatedOvercol);
        });
    });
    describe('ETH fee withdrawing', function () {

        let deposit = ether("1");
        let percent = new BN(155217);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        let bidId = new BN(0);

        beforeEach(async function () {
            await this.service.leverage(percent, expiration, yearFee, {from: issuer, value: deposit});
            await this.service.takeIssueRequest(bidId, {from: holder, value: matchDepo});
        });

        describe('reverts', function () {

            it("withdrawing to zero address", async function () {
                await expectRevert(this.service.withdrawSystemETH(ZERO_ADDRESS), 'Zero address, be careful');
            });
            it("withdrawing by non-admin", async function () {
                await expectRevert(this.service.withdrawSystemETH(holder, {from: holder}), 'You have no access');
            });
            it("when there are no fees nor rewards", async function () {
                await this.service.withdrawSystemETH(holder);
                await expectRevert(this.service.withdrawSystemETH(holder), 'There is no available ETH');
            });
        });
        describe('success', function () {
            it("zeroes fee counter", async function () {
                await this.service.withdrawSystemETH(holder);
            });
            it("reduces the contract balance", async function () {
                this.service.withdrawSystemETH(holder);
            });
            it("increases the user balance", async function () {
                this.service.withdrawSystemETH(holder);
            });
        });
    });
    describe('TMV fee withdrawing', function () {

        let deposit = ether("1");
        let percent = new BN(155217);
        let matchDepo = deposit.mul(new BN(100000)).div(percent);
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);
        let bondId = new BN(0);
        let tmv, createdAt;

        beforeEach(async function () {
            let rate = new BN(10000000);
            let precision = new BN(100000);
            tmv = matchDepo.mul(rate).div(precision);
            await this.service.leverage(percent, expiration, yearFee, { from: issuer,value: deposit});
            await this.service.takeIssueRequest(bondId, {value: matchDepo, from: holder});
            createdAt = await time.latest();
            await this.token.transfer(issuer, tmv, {from: holder});
            await this.token.approve(this.service.address, constants.MAX_INT256, {from: issuer});
            await this.logic.create(0, {from: issuer, value: deposit});
            await this.logic.withdrawTmvMax(1, {from: issuer});
            await time.increase(expiration.div(new BN(2)));
            await this.service.finish(bondId, {from: issuer});
        });

        describe('reverts', function () {

            it("withdrawing to zero address", async function () {
                await expectRevert(this.service.reclaimERC20(this.token.address, ZERO_ADDRESS), 'Zero address, be careful');
            });
            it("withdrawing by non-admin", async function () {
                await expectRevert(this.service.reclaimERC20(this.token.address, anotherAccount, {from: anotherAccount}), 'You have no access');
            });
            it("when there are no fees nor rewards", async function () {
                await this.service.reclaimERC20(this.token.address,  anotherAccount);
                await expectRevert(this.service.reclaimERC20(this.token.address, anotherAccount), 'There are no tokens');
            });
        });
        describe('success', function () {
            it("zeroes fee counter", async function () {
                let fee = await this.token.balanceOf(this.service.address);
                expect(fee).to.be.bignumber.gt(new BN(0));
                await this.service.reclaimERC20(this.token.address,  anotherAccount);
                fee = await this.token.balanceOf(this.service.address);
                expect(fee).to.be.bignumber.equal(new BN(0));
            });
            it("increases the user balance", async function () {
                let before = await this.token.balanceOf(anotherAccount);
                let reward = await this.token.balanceOf(this.service.address);
                await this.service.reclaimERC20(this.token.address,  anotherAccount);
                let after = await this.token.balanceOf(anotherAccount);
                expect(after.sub(before)).to.be.bignumber.equal(reward);

            });
        });
    });
    describe('Order transferring', function () {

        let deposit = ether("1");
        let percent = new BN(151000);
        let issuerOrderId = new BN(0);
        let holderOrderId = new BN(1);
        let yearFee = new BN('10000');
        let expiration = new BN(30*24*60*60);

        beforeEach(async function () {
            await this.service.leverage(percent, expiration, yearFee, {from: issuer, value: deposit});
            await this.service.exchange(expiration, yearFee, {from: holder, value: deposit});
        });

        describe('issuer rights', function () {
            describe('reverts', function () {

                it("to zero address", async function () {
                    await expectRevert(this.service.transferIssuerRights(ZERO_ADDRESS, issuerOrderId, {from: issuer}), 'Zero address, be careful');
                });
                it("by non-owner", async function () {
                    await expectRevert(this.service.transferIssuerRights(anotherAccount, issuerOrderId, {from: anotherAccount}), 'You are not the issuer');
                });
            });
            describe('success', function () {
                it("emits an event", async function () {
                    let {logs} = await this.service.transferIssuerRights(anotherAccount, issuerOrderId, {from: issuer});
                    expectEvent.inLogs(logs, 'IssuerRightsTransferred', {
                        from: issuer,
                        to: anotherAccount,
                        id: issuerOrderId,
                    });
                });
                it("changes storage value", async function () {
                    await this.service.transferIssuerRights(anotherAccount, issuerOrderId, {from: issuer});
                    let order = await this.service.bonds(issuerOrderId);
                    expect(order.issuer).to.equal(anotherAccount);
                });
            });
        });

        describe('holder rights', function () {
            describe('reverts', function () {

                it("to zero address", async function () {
                    await expectRevert(this.service.transferHolderRights(ZERO_ADDRESS, holderOrderId, {from: holder}), 'Zero address, be careful');
                });
                it("by non-owner", async function () {
                    await expectRevert(this.service.transferHolderRights(anotherAccount, holderOrderId, {from: anotherAccount}), 'You are not the holder');
                });
            });
            describe('success', function () {
                it("emits an event", async function () {
                    let {logs} = await this.service.transferHolderRights(anotherAccount, holderOrderId, {from: holder});
                    expectEvent.inLogs(logs, 'HolderRightsTransferred', {
                        from: holder,
                        to: anotherAccount,
                        id: holderOrderId,
                    });
                });
                it("changes storage value", async function () {
                    await this.service.transferHolderRights(anotherAccount, holderOrderId, {from: holder});
                    let order = await this.service.bonds(holderOrderId);
                    expect(order.holder).to.equal(anotherAccount);
                });
            });
        });
    });
    describe('Settings the issuer commission', function () {
        let commission = new BN(10000);
        describe('reverts', function () {

            it("if setting value is higher than 10%", async function () {
                await expectRevert(this.service.setIssuerFee(commission.add(new BN(1))), 'Too much');
            });
            it("setting by non-admin", async function () {
                await expectRevert(this.service.setIssuerFee(commission, {from: holder}), 'You have no access');
            });
        });
        describe('success', function () {
            it("changes the commission", async function () {
                await this.service.setIssuerFee(commission);
                let newCom = await this.service.issuerFee();
                expect(newCom).to.be.bignumber.equal(commission);
            });
        });
    });
    describe('Settings the holder commission', function () {
        let commission = new BN(50000);
        describe('reverts', function () {

            it("if setting value is higher than 10%", async function () {
                await expectRevert(this.service.setHolderFee(commission.add(new BN(1))), 'Too much');
            });
            it("setting by non-admin", async function () {
                await expectRevert(this.service.setHolderFee(commission, {from: holder}), 'You have no access');
            });
        });
        describe('success', function () {
            it("changes the commission", async function () {
                await this.service.setHolderFee(commission);
                let newCom = await this.service.holderFee();
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
                await expectRevert(this.service.setMinEther(value, {from: holder}), 'You have no access');
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
                await expectRevert(this.service.changeAdmin(holder, {from: holder}), 'You have no access');
            });
        });
        describe('success', function () {
            it("changes the admin address", async function () {
                await this.service.changeAdmin(holder);
                let newAdmin = await this.service.admin();
                expect(newAdmin).to.have.string(holder);
            });
        });
    });
});
