const {constants, expectEvent, expectRevert, ether } = require('openzeppelin-test-helpers');
const balance = require('./helpers/balances');

const BN = web3.utils.BN;
const { expect } = require('chai');

const { ZERO_ADDRESS } = constants;

const Classic = artifacts.require('Logic');
const Settings = artifacts.require('TimviSettings');
const Token = artifacts.require('TimviToken');
const Oracle = artifacts.require('OracleContractMock');

contract('Logic', function ([manager, owner, anotherAccount]) {

    // deploy & initial settings
    beforeEach(async function () {
        this.settings = await Settings.new();
        this.logic = await Classic.new(this.settings.address);
        this.token = await Token.new(this.settings.address);
        this.oracle = await Oracle.new();
        await this.settings.setTmvAddress(this.token.address);
        const receipt = await this.settings.setOracleAddress(this.oracle.address);
        const tx = await web3.eth.getTransaction(receipt.tx);
        this.gasPrice = new BN(tx.gasPrice);
        await this.settings.setContractManager(this.logic.address);
    });

    describe('Creating', function () {
        let deposit = ether("1");
        let released = ether("1");
        it('reverts when token amount more than available', async function () {
            let targetCollaterization = '150000';
            let price = await this.logic.rate.call();
            let withdraw = deposit.mul(new BN('100000')).mul(new BN(price.toString())).div(new BN(targetCollaterization)).add(new BN(1));
            await expectRevert(this.logic.create(withdraw, { from: owner, value: deposit}), 'Token amount is more than available');

        });
        it('reverts when deposit is very small', async function () {
            let deposit = ether("0.04");
            await expectRevert(this.logic.create(0, { from: owner, value: deposit}), "Deposit is very small");
        });
        it('creates record about new TBox', async function () {
            await this.logic.create(released, { value: deposit});
            let tBox = await this.logic.boxes(0);
            var result = new BN('1').add(new BN(1));
            var expected = new BN('2');
            expect(result).to.be.bignumber.equal(expected);
            expect(tBox[0]).to.be.bignumber.equal(deposit);
            expect(tBox[1]).to.be.bignumber.equal(released);
        });
        it('increases the contract balance', async function () {
            let tx = this.logic.create(released, { value: deposit});
            expect(await balance.difference(this.logic.address, tx)).to.be.bignumber.equal(deposit);
        });
        it('mints ERC721 token to creator', async function () {
            await this.logic.create(released, { value: deposit, from: owner});
            let tokenId = new BN(0);
            let apprOrOwnr = await this.logic.isApprovedOrOwner.call(owner, tokenId);
            expect(apprOrOwnr).to.be.true;
        });
        it('emits a create event', async function () {
            const { logs } = await this.logic.create(released, { from: owner, value: deposit });
            expectEvent.inLogs(logs, 'Created', {
                id: new BN(0),
                owner: owner,
                collateral: deposit,
                tmvReleased: released,
            });
        });
        it("ETH user balance should reduce", async function () {
            let balanceBefore = await balance.current(owner);
            let tx = await this.logic.create(0, {from: owner, value: deposit});
            let gasUsed = tx.receipt.gasUsed;
            let txCost = deposit.add(new BN(gasUsed).mul(this.gasPrice));
            let balanceAfter = await balance.current(owner);
            expect(balanceBefore.sub(balanceAfter)).to.be.bignumber.equal(txCost);
        });
        describe('Fallback', function () {
            it('accepts funds and creates TBox', async function () {
                let address = this.logic.address;
                await web3.eth.sendTransaction({ from: owner,to: address, value : deposit, gas: 1000000 });
                let tBox = await this.logic.boxes(0);
                expect(tBox[0]).to.be.bignumber.equal(deposit);
                expect(tBox[1]).to.be.bignumber.equal(new BN(0));
            });
        });
    });
    describe('Closing', function () {
        it("reverts if TBox doesn't exist", async function () {
            // await this.logic.create(web3.utils.toWei(0, "ether"), {from: owner, value: deposit});
            await expectRevert.unspecified(this.logic.close(2)); // it calls default ERC721 token function 'ownerOf' which doesn't provide revert message
        });
        it("reverts closing by alien", async function () {
            let deposit = ether("5");
            await this.logic.create(ether("0"), {from: owner, value: deposit});
            await expectRevert(this.logic.close(new BN(0), {from: anotherAccount}), 'Box isn\'t your');
        });
        it("reverts if TMV balance not enough", async function () {
            let deposit = ether("5");
            await this.logic.create(ether("4"), {from: owner, value: deposit});
            await this.token.transfer(anotherAccount, ether("4"), {from: owner});
            await expectRevert(this.logic.close(0,  {from: owner}), 'You don\'t have tokens enough');
        });
        it("when tokens doesn't need to close TMV balance should not change", async function () {
            let deposit = ether("5");
            let release = ether("1");
            await this.logic.create(release, {from: owner, value: deposit});
            await this.logic.create(0, {from: owner, value: deposit});
            let balanceBefore = await this.token.balanceOf(owner);
            expect(balanceBefore).to.be.bignumber.equal(release);
            await this.logic.close(1, {from: owner});
            let balanceAfter = await this.token.balanceOf(owner);
            expect(balanceAfter).to.be.bignumber.equal(release);
        });
        it("burns tokens for closing", async function () {
            let deposit = ether("5");
            let release = ether("1");
            await this.logic.create(release, {from: owner, value: deposit});
            await this.logic.close(0, {from: owner});
            let balanceAfter = await this.token.balanceOf(owner);
            expect(balanceAfter).to.be.bignumber.equal(new BN(0));
        });
        it("removes a record about TBox", async function () {
            let deposit = ether("5");
            let release = ether("1");
            await this.logic.create(release, {from: owner, value: deposit});
            await this.logic.close(0, {from: owner});
            let tBox = await this.logic.boxes(0);
            expect(tBox[0]).to.be.bignumber.equal(new BN(0));
            expect(tBox[1]).to.be.bignumber.equal(new BN(0));
        });
        it("increases ETH user balance", async function () {
            let deposit = ether("5");
            let release = ether("1");
            await this.logic.create(release, {from: owner, value: deposit});
            let balanceBefore = await balance.current(owner);
            let tx = await this.logic.close(0, {from: owner});
            let gasUsed = tx.receipt.gasUsed;
            let change = deposit.sub(new BN(new BN(gasUsed).mul(this.gasPrice)));
            let balanceAfter = await balance.current(owner);
            expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(change);
        });
        it("reduces ETH contract balance", async function () {
            let deposit = ether("5");
            let release = ether("1");
            await this.logic.create(release, {from: owner, value: deposit});
            let tx = this.logic.close(0, {from: owner});
            expect(await balance.difference(this.logic.address, tx)).to.be.bignumber.equal(deposit);
        });
        it("burns ERC721", async function () {
            let deposit = ether("5");
            let release = ether("1");
            await this.logic.create(release, {from: owner, value: deposit});
            await this.logic.close(0, {from: owner});

            await expectRevert.unspecified(this.logic.isApprovedOrOwner(ZERO_ADDRESS, 0));
        });
        it('emits a close event', async function () {
            let deposit = ether("5");
            await this.logic.create(0, { from: owner, value: deposit });
            const { logs } = await this.logic.close(0, { from: owner });
            expectEvent.inLogs(logs, 'Closed', {
                id: new BN(0),
                owner: owner,
                closer: owner,
            });
        });
    });
    describe('Capitalization', function () {
        let capitalization = ether("32");
        let deposit = ether("1");
        let release = ether("66");

        beforeEach(async function () {
            await this.logic.create(release, {from: owner, value: deposit});
            await this.oracle.setPrice(7000000);
        });

        describe('reverts', function () {
            it("if TBox doesn't exist", async function () {
                await expectRevert(this.logic.capitalize(100, capitalization, {from: owner}), 'Box does not exist');
            });
            it("when user TMV balance not enough", async function () {
                await this.token.transfer(anotherAccount, release, {from: owner});
                await expectRevert(this.logic.capitalize(0, capitalization, {from: owner}), 'You don\'t have tokens enough');
            });
            it("when collateral percent less than min", async function () {
                await this.oracle.setPrice(1999000);
                await expectRevert(this.logic.capitalize(0, capitalization, {from: owner}), 'It\'s possible to capitalize only toxic Boxes');
            });
            it("when collateral is large than max", async function () {
                await this.oracle.setPrice(15000000);
                await expectRevert(this.logic.capitalize(0, capitalization, {from: owner}), 'It\'s possible to capitalize only toxic Boxes');
            });
            it("when collateral after capitalization is higher than 160%", async function () {
                let maxCapAmount = new BN('65566019312140609742');
                await expectRevert(this.logic.capitalize(0, maxCapAmount.add(new BN(1)), {from: owner}), 'Tokens amount out of range');
            });
            it("when capitalization amount is less than 0,1 TMV", async function () {
                await expectRevert(this.logic.capitalize(0, capitalization.div(new BN(10000)), {from: owner}), 'Tokens amount out of range');
            });
        });
        describe('success', function () {
            it("transfer 103% of capitalization amount to user", async function () {
                let userCom = await this.settings.userFee();
                let divider = await this.logic.precision.call();
                let equivalentETH = capitalization.mul(new BN(100000)).div(await this.oracle.ethUsdPrice());
                let ether = capitalization.mul(new BN(100000)).mul(new BN(userCom)).div(new BN(divider)).div(await this.oracle.ethUsdPrice());
                ether = ether.add(equivalentETH);
                let balanceBefore = await balance.current(owner);
                let tx = await this.logic.capitalize(0, capitalization, {from: owner});
                let txCost = new BN(tx.receipt.gasUsed).mul(this.gasPrice);
                let balanceAfter = await balance.current(owner);
                let balanceDelta = balanceAfter.sub(balanceBefore);
                let profit = ether.sub(txCost);
                expect(balanceDelta).to.be.bignumber.equal(profit);
            });
            it("reduced TBox deposit by 106% of capitalization amount", async function () {  let userCom = await this.settings.userFee();
                let divider = await this.logic.precision.call();
                let equivalentETH = capitalization.mul(new BN(100000)).div(await this.oracle.ethUsdPrice());
                let ether = capitalization.mul(new BN(100000)).mul(new BN(userCom)).div(new BN(divider)).div(await this.oracle.ethUsdPrice());
                ether = equivalentETH.add(ether).add(ether);
                let depoBefore = (await this.logic.boxes(0))[0];
                await this.logic.capitalize(0, capitalization, {from: owner});
                let depoAfter = (await this.logic.boxes(0))[0];
                expect(depoBefore.sub(ether)).to.be.bignumber.equal(depoAfter);
            });
            it("reduced TBox TMV released amount by capitalization amount", async function () {
                let before = (await this.logic.boxes(0))[1];
                await this.logic.capitalize(0, capitalization, {from: owner});
                let after = (await this.logic.boxes(0))[1];
                expect(before.sub(capitalization)).to.be.bignumber.equal(after);
            });
            it("increases collateral percent", async function () {
                let eth = (await this.logic.boxes(0))[0];
                let tmv = (await this.logic.boxes(0))[1];
                let userCom = await this.settings.userFee();
                let divider = await this.logic.precision.call();
                await this.logic.capitalize(0, capitalization, {from: owner});
                let equivalent = capitalization.mul(new BN(100000)).div(await this.oracle.ethUsdPrice());
                let reward = capitalization.mul(new BN(100000)).mul(userCom).div(await this.oracle.ethUsdPrice()).div(divider);
                eth = eth.sub(equivalent).sub(reward).sub(reward);
                tmv = tmv.sub(capitalization);
                let calculated = (await this.oracle.ethUsdPrice()).mul(eth).div(tmv);
                let after = await this.logic.collateralPercent.call(0);
                expect(after).to.be.bignumber.equal(calculated);
            });
            it("increases system reward", async function () {
                let balanceBefore = await balance.current(this.logic.address);
                let userCom = await this.settings.userFee();
                let divider = await this.logic.precision.call();
                await this.logic.capitalize(0, capitalization, {from: owner});
                let reward = capitalization.mul(new BN(100000)).mul(userCom).div(await this.oracle.ethUsdPrice()).div(divider);
                let equivalent = capitalization.mul(new BN(100000)).div(await this.oracle.ethUsdPrice());
                let ether = equivalent.add(reward);
                let balanceAfter = await balance.current(this.logic.address);
                expect(balanceBefore.sub(ether)).to.be.bignumber.equal(balanceAfter);
            });
            it("maximum capitalization", async function () {
                await this.logic.capitalizeMax(0, {from: owner});
            });
            it('emits a capitalization event', async function () {
                const { logs } = await this.logic.capitalize(0, capitalization, {from: owner});
                expectEvent.inLogs(logs, 'Capitalized', {
                    id: new BN(0),
                    owner: owner,
                    who: owner,
                    tmvAmount: capitalization,
                });
            });
        });
    });
    describe('ETH withdrawing', function () {
        let deposit = ether("20");
        let release = ether("500");
        let withdraw = ether("1");

        beforeEach(async function () {
            await this.logic.create(release, {from: owner, value: deposit});
        });

        describe('reverts', function () {
            it("withdrawing zero", async function () {
                await expectRevert(this.logic.withdrawEth(0, 0, {from: owner}), "Withdrawing zero doesn't help you buy lamba");
            });
            it("if TBox doesn't exist", async function () {
                await expectRevert.unspecified(this.logic.withdrawEth(100, withdraw, {from: owner}));
            });
            it("if rest of deposit after withdraw is smaller than min", async function () {
                let withdraw = ether("20");
                await this.logic.create(0, {from: owner, value: deposit});
                await expectRevert(this.logic.withdrawEth(1, withdraw, {from: owner}), 'You can\'t withdraw so much');
            });
            it("when collateral after withdrawing lower than 150%", async function () {
                let withdraw = ether("19");
                await expectRevert(this.logic.withdrawEth(0, withdraw, {from: owner}), 'You can\'t withdraw so much');
            });
            it("when non owner (non approved) trying to withdraw", async function () {
                await expectRevert(this.logic.withdrawEth(0, withdraw, {from: anotherAccount}), 'Box isn\'t your');
            });
        });
        describe('success', function () {
            it("reduces contract balance by withdrawing ETH amount", async function () {
                let before = await balance.current(this.logic.address);
                await this.logic.withdrawEth(0, withdraw, {from: owner});
                let after = await balance.current(this.logic.address);
                expect(before.sub(withdraw)).to.be.bignumber.equal(after);
            });
            it("reduces TBox deposit", async function () {
                let before = (await this.logic.boxes(0))[0];
                await this.logic.withdrawEth(0, withdraw, {from: owner});
                let after = (await this.logic.boxes(0))[0];
                expect(before.sub(withdraw)).to.be.bignumber.equal(after);
            });
            it("increases user balance", async function () {
                let before = await balance.current(owner);
                let tx = await this.logic.withdrawEth(0, withdraw, {from: owner});
                let gasUsed = new BN(tx.receipt.gasUsed);
                let after = await balance.current(owner);
                expect(before.add(withdraw.sub(gasUsed))).to.be.bignumber.equal(after);
            });
            it("maximum withdrawing", async function () {
                await this.logic.withdrawEthMax(0, {from: owner});
            });
            it('emits an ETH withdrawing event', async function () {
                const { logs } = await this.logic.withdrawEth(0, withdraw, {from: owner});
                expectEvent.inLogs(logs, 'EthWithdrawn', {
                    id: new BN(0),
                    value: withdraw,
                    who: owner,
                });
            });
        });
    });
    describe('TMV withdrawing', function () {
        let deposit = ether("1");
        let release = ether("50");
        let withdraw = ether("10");

        beforeEach(async function () {
            await this.logic.create(release, {from: owner, value: deposit});
        });

        describe('reverts', function () {
            it("withdrawing zero", async function () {
                await expectRevert(this.logic.withdrawTmv(0, 0, {from: owner}), "Withdrawing zero doesn't help you buy lamba");
            });
            it("if TBox doesn't exist", async function () {
                await expectRevert.unspecified(this.logic.withdrawTmv(100, withdraw, {from: owner}));
            });
            it("when collateral after withdrawing is lower than 150%", async function () {
                let withdraw = ether("60");
                await expectRevert(this.logic.withdrawTmv(0, withdraw, {from: owner}), 'You can\'t withdraw so much');
            });
            it("when non owner (non approved) trying to withdraw", async function () {
                await expectRevert(this.logic.withdrawTmv(0, withdraw, {from: anotherAccount}), 'Box isn\'t your');
            });
        });
        describe('success', function () {
            it("increases TBox released TMV counter", async function () {
                let before = (await this.logic.boxes(0))[1];
                await this.logic.withdrawTmv(0, withdraw, {from: owner});
                let after = (await this.logic.boxes(0))[1];
                expect(before.add(withdraw)).to.be.bignumber.equal(after);
            });
            it("increases user TMV balance", async function () {
                let before = await this.token.balanceOf(owner);
                await this.logic.withdrawTmv(0, withdraw, {from: owner});
                let after = await this.token.balanceOf(owner);
                expect(before.add(withdraw)).to.be.bignumber.equal(after);
            });
            it("increases supply", async function () {
                let supplyBefore =  await this.token.totalSupply();
                await this.logic.withdrawTmv(0, withdraw, {from: owner});
                let supplyAfter = await this.token.totalSupply();
                expect(supplyBefore.add(withdraw)).to.be.bignumber.equal(supplyAfter);
            });
            it("maximum withdrawing", async function () {
                await this.logic.withdrawTmvMax(0, {from: owner});
            });
            it('emits a TMV withdrawing event', async function () {
                const { logs } = await this.logic.withdrawTmv(0, withdraw, {from: owner});
                expectEvent.inLogs(logs, 'TmvWithdrawn', {
                    id: new BN(0),
                    value: withdraw,
                    who: owner,
                });
            });
        });
    });
    describe('ETH adding', function () {
        let deposit = ether("1");
        let release = ether("66");

        beforeEach(async function () {
            await this.logic.create(release, {from: owner, value: deposit});
        });

        describe('reverts', function () {
            it("add 0", async function () {
                await expectRevert(this.logic.addEth(0, {from: owner}), "Don't add 0");
            });
            it("if TBox doesn't exist", async function () {
                await expectRevert(this.logic.addEth(100, {from: owner, value: deposit}), 'Box does not exist');
            });
        });
        describe('success', function () {
            it("adds ETH from alien", async function () {
                await this.logic.addEth(0, {from: anotherAccount, value: deposit});
            });
            it("increases contract balance by adding ETH amount", async function () {
                let before = await balance.current(this.logic.address);
                await this.logic.addEth(0, {from: anotherAccount, value: deposit});
                let after = await balance.current(this.logic.address);
                expect(before.add(deposit)).to.be.bignumber.equal(after);
            });
            it("increases TBox deposit", async function () {
                let before = (await this.logic.boxes(0))[0];
                await this.logic.addEth(0, {from: anotherAccount, value: deposit});
                let after = (await this.logic.boxes(0))[0];
                expect(before.add(deposit)).to.be.bignumber.equal(after);
            });
            it("increases collateral percent", async function () {
                let eth = (await this.logic.boxes(0))[0];
                let tmv = (await this.logic.boxes(0))[1];
                await this.logic.addEth(0, {from: anotherAccount, value: deposit});
                eth = eth.mul(new BN(2));
                let calculated = (await this.oracle.ethUsdPrice()).mul(eth).div(tmv);
                let after = await this.logic.collateralPercent.call(0);
                expect(after).to.be.bignumber.equal(calculated);
            });
            it("increases TMV amount available for withdraw", async function () {
                let baseRatio = '150000';
                let divider = await this.logic.precision.call();
                await this.logic.addEth(0, {from: anotherAccount, value: deposit});
                let calculated = (await this.oracle.ethUsdPrice.call()).mul(deposit).mul(new BN(2)).mul(divider).div(new BN(baseRatio)).div(new BN(100000));

                let after = await this.logic.boxWithdrawableTmv.call(0);
                expect(calculated.sub(release)).to.be.bignumber.equal(after);
            });
            it('emits an ETH adding event', async function () {
                const { logs } = await this.logic.addEth(0, {from: anotherAccount, value: deposit});
                expectEvent.inLogs(logs, 'EthAdded', {
                    id: new BN(0),
                    value: deposit,
                    who: anotherAccount,
                });
            });
        });
    });
    describe('TMV adding', function () {
        let deposit = ether("1");
        let release = ether("50");
        let addingTMV = ether("25");

        beforeEach(async function () {
            await this.logic.create(release, {from: owner, value: deposit});
        });

        describe('reverts', function () {
            it("if TBox doesn't exist", async function () {
                await expectRevert(this.logic.addTmv(100, addingTMV, {from: owner}), 'Box does not exist');
            });
            it("when adding zero TMV", async function () {
                let addingTMV = 0;
                await expectRevert(this.logic.addTmv(0, addingTMV, {from: owner}), 'Don\'t add 0');
            });
            it("when adding TMV amount is more than released", async function () {
                await this.logic.create(release, {from: owner, value: deposit});
                let addingTMV = ether("51");
                await expectRevert(this.logic.addTmv(0, addingTMV, {from: owner}), 'Too much tokens');
            });
            it("when user has no tokens enough", async function () {
                let addingTMV = ether("26");
                await this.token.transfer(anotherAccount, addingTMV, {from: owner});
                await expectRevert(this.logic.addTmv(0, addingTMV, {from: owner}), 'You don\'t have tokens enough');
            });
        });
        describe('success', function () {
            it("adds ETH from alien", async function () {
                await this.logic.create(release, {from: anotherAccount, value: deposit});
                await this.logic.addTmv(0, addingTMV, {from: anotherAccount});
            });
            it("reduces a TBox TMV withdrawing counter", async function () {
                let before = (await this.logic.boxes(0))[1];
                await this.logic.addTmv(0, addingTMV, {from: owner});
                let after = (await this.logic.boxes(0))[1];
                expect(before.sub(addingTMV)).to.be.bignumber.equal(after);
            });
            it("increases collateral percent", async function () {
                let eth = (await this.logic.boxes(0))[0];
                let tmv = (await this.logic.boxes(0))[1];
                await this.logic.addTmv(0, addingTMV, {from: owner});
                tmv = tmv.sub(addingTMV);
                let calculated = (await this.oracle.ethUsdPrice()).mul(eth).div(tmv);
                let after = await this.logic.collateralPercent.call(0);
                expect(after).to.be.bignumber.equal(calculated);
            });
            it("increases TMV amount available for withdraw", async function () {
                let before = await this.logic.boxWithdrawableTmv.call(0);
                await this.logic.addTmv(0, addingTMV, {from: owner});
                let after = await this.logic.boxWithdrawableTmv.call(0);
                expect(before.add(addingTMV)).to.be.bignumber.equal(after);
            });
            it('emits a TMV adding event', async function () {
                const { logs } = await this.logic.addTmv(0, addingTMV, {from: owner});
                expectEvent.inLogs(logs, 'TmvAdded', {
                    id: new BN(0),
                    value: addingTMV,
                    who: owner,
                });
            });
        });
    });

    describe('Reward withdrawing', function () {
        let deposit = ether("1");
        let release = ether("66");
        let capitalization = ether("11");

        beforeEach(async function () {
            await this.logic.create(release, {from: owner, value: deposit});
            await this.logic.create(release, {from: anotherAccount, value: deposit});
            await this.oracle.setPrice(7000000);
            await this.logic.capitalize(0, capitalization, {from: anotherAccount});
        });

        describe('reverts', function () {

            it("withdrawing to zero address", async function () {
                await expectRevert(this.logic.withdrawFee(ZERO_ADDRESS), 'Zero address, be careful');
            });
            it("withdrawing by non admin", async function () {
                await expectRevert(this.logic.withdrawFee(anotherAccount, {from: anotherAccount}), 'You have no access');
            });
            it("when there are no fees nor rewards", async function () {
                await this.logic.withdrawFee(anotherAccount);
                await expectRevert(this.logic.withdrawFee(anotherAccount), 'There is no available fees');
            });
        });
        describe('success', function () {
            it("reduces the contract balance", async function () {
                await this.logic.withdrawFee(anotherAccount);
            });
            it("increases the user balance", async function () {
                await this.logic.withdrawFee(anotherAccount);
            });
        });
    });
    describe('Global collateralization', function () {
        let deposit = ether("1");
        describe('when there are no any Boxes', function () {
            it('reverts when withdrawing tokens amount is more than available', async function () {
                let divider = await this.logic.precision.call();
                let targetCollaterization = new BN('150000');
                let price = await this.logic.rate.call();
                let precision = await this.logic.precision.call();
                await expectRevert(this.logic.create(deposit.mul(divider).mul(price).div(targetCollaterization).div(precision).add(new BN(1)), { from: owner, value: deposit}), 'Token amount is more than available');

            });
            it('withdrawing up to target collateralization limit', async function () {
                let divider = await this.logic.precision.call();
                let targetCollaterization = new BN('150000');
                let price = await this.logic.rate.call();
                let precision = await this.logic.precision.call();
                await this.logic.create(deposit.mul(divider).mul(price).div(targetCollaterization).div(precision), { from: owner, value: deposit});
            });
        });
        describe('when global collateralization is less than the target', function () {
            it('reverts when withdrawing tokens amount is more than available', async function () {

                let divider = await this.logic.precision.call();
                let targetCollaterization = new BN('150000');
                let price = await this.logic.rate.call();
                let precision = await this.logic.precision.call();
                let withdraw = deposit.mul(divider).mul(price).div(targetCollaterization).div(precision);

                await this.logic.create(0, { from: owner, value: deposit.mul(new BN(10))});
                await this.logic.create(withdraw, { from: owner, value: deposit});
                await this.logic.close(0,  { from: owner});

                await expectRevert(this.logic.create(withdraw.add(new BN(1)) , { from: owner, value: deposit}), 'Token amount is more than available');

            });
            it('withdrawing up to target local default limit', async function () {
                let divider = await this.logic.precision.call();
                let targetCollaterization = new BN('150000');
                let price = await this.logic.rate.call();
                let precision = await this.logic.precision.call();

                await this.logic.create(0, { from: owner, value: deposit.mul(new BN(10))});
                await this.logic.create(deposit.mul(divider).mul(price).div(targetCollaterization).div(precision), { from: owner, value: deposit});
                await this.logic.close(0,  { from: owner});

                await this.logic.create(deposit.mul(divider).mul(price).div(targetCollaterization).div(precision), { from: owner, value: deposit});
            });
        });
        describe('when global collateralization is more than the target', function () {
            it('reverts when withdrawing tokens amount is more than available', async function () {

                let divider = await this.logic.precision.call();
                let ratio = new BN('115217');
                let price = await this.logic.rate.call();
                let precision = await this.logic.precision.call();

                await this.logic.create(1, { from: owner, value: deposit.mul(new BN(10))});

                await expectRevert(this.logic.create(deposit.mul(divider).mul(price).div(ratio).div(precision).add(new BN(1)), { from: owner, value: deposit}), 'Token amount is more than available');

            });
            it('withdrawing up to base ratio limit', async function () {
                let divider = await this.logic.precision.call();
                let price = await this.logic.rate.call();
                let ratio = new BN('115217');
                let precision = await this.logic.precision.call();

                await this.logic.create(1, { from: owner, value: deposit.mul(new BN(10))});

                await this.logic.create(deposit.mul(divider).mul(price).div(ratio).div(precision), { from: owner, value: deposit});
            });
        });
    });
    describe('Dust collapse', function () {
        let deposit = ether("1").div(new BN(20));
        let release = ether("66").div(new BN(20));

        beforeEach(async function () {
            await this.logic.create(release, {from: owner, value: deposit});
            await this.logic.create(release, {value: deposit});
            await this.oracle.setPrice(7000000);
            await this.logic.capitalizeMax(0);
        });

        describe('reverts', function () {
            it('when collateral percent is less than min', async function () {
                await this.oracle.setPrice(70000);
                await expectRevert(this.logic.closeDust(0), 'This Box isn\'t collapsable');
            });
            it('when collateral deposit is larger than min deposit', async function () {
                await this.logic.addEth(0, {from:owner,value: deposit});
                await expectRevert(this.logic.closeDust(0), 'It\'s possible to collapse only dust');
            });
        });
        describe('success', function () {
            it('increases user balance, system reward and globalETH parameter', async function () {
                let tBox = await this.logic.boxes(0);
                let tmv = tBox[1];
                let deposit = tBox[0];
                let precision = new BN(100000);
                let rate = new BN(7000000);
                let equivalent = tmv.mul(precision).div(rate);
                let reward = tmv.mul(precision).mul(new BN(3000)).div(rate).div(new BN(100000));
                let calculatedUserEth = equivalent.add(reward);

                let globalEthBefore = await this.logic.globalETH();
                let contractBalanceBefore = await balance.current(this.logic.address);
                let tx = this.logic.closeDust(0);

                let balanceDifference = await balance.differenceExcludeGas(manager, tx, this.gasPrice);
                let globalEthAfter = await this.logic.globalETH();
                let contractBalanceAfter = await balance.current(this.logic.address);

                expect(balanceDifference).to.be.bignumber.equal(calculatedUserEth);
                expect(globalEthBefore.sub(globalEthAfter)).to.be.bignumber.equal(deposit);
                expect(contractBalanceBefore.sub(contractBalanceAfter)).to.be.bignumber.equal(calculatedUserEth);
            });
            it('emits a close event', async function () {
                const {logs} = await this.logic.closeDust(0);
                expectEvent.inLogs(logs, 'Closed', {
                    id: new BN(0),
                    owner: owner,
                    closer: manager,
                });
            });
        });
    });
    describe('Others', function () {

        describe('withdrawable TMV', function () {
            it('allowed amount is less than max global', async function () {
                await this.logic.create(3, {value: ether("10")});
                await this.logic.create(0, {value: ether("1")});
                await this.logic.boxWithdrawableTmv(1);
            });
            it('released amount is larger than allowed', async function () {
                await this.logic.create(ether("66"), {value: ether("1")});
                await this.oracle.setPrice(50000);
                await this.logic.boxWithdrawableTmv(0);
            });
        });

        describe('withdrawable ETH', function () {
            it('max global is 0', async function () {
                await this.logic.create(ether("5"), {value: ether("1")});
                await this.logic.withdrawEthMax(0);
                await this.logic.withdrawableEth(0);
            });
            it('collateral less than needs for overcap', async function () {
                await this.logic.create(ether("5"), {value: ether("1")});
                await this.logic.create(3, {value: ether("100")});
                await this.logic.withdrawEthMax(0);
                await this.oracle.setPrice(5000000);
                await this.logic.withdrawableEth(0);
            });
        });

        describe('collateral percent', function () {
            it('when there are no TMV released', async function () {
                await this.logic.create(0, {value: ether("1")});
                let col = await this.logic.collateralPercent.call(0);
                expect(col).to.be.bignumber.equal(new BN('1000000000000000000000000000'));
            });
        });

        describe('global withdrawable ETH', function () {
            it('when globalCollateralization is less than target', async function () {
                await this.logic.create(ether("15"), {value: ether("1")});
                await this.logic.create(3, {value: ether("100")});
                await this.logic.withdrawEthMax(0);
                await this.logic.close(1);
                let gwe = await this.logic.globalWithdrawableEth.call();
                expect(gwe).to.be.bignumber.equal(new BN('0'));
            });
        });
    });
});
