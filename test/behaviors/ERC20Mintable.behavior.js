const {constants, expectEvent, expectRevert } = require('openzeppelin-test-helpers');
const { ZERO_ADDRESS } = constants;

const { expect } = require('chai');

const BN = web3.utils.BN;



function shouldBehaveLikeERC20Mintable (minter, [anyone]) {
    describe('as a mintable token', function () {
        describe('mint', function () {
            const amount = new BN(100);

            context('when the sender has minting permission', function () {
                const from = minter;

                context('for a zero amount', function () {
                    shouldMint(new BN(0));
                });

                context('for a non-zero amount', function () {
                    shouldMint(amount);
                });

                function shouldMint (amount) {
                    beforeEach(async function () {
                        ({ logs: this.logs } = await this.token.mint(anyone, amount, { from }));
                    });

                    it('mints the requested amount', async function () {
                        expect(await this.token.balanceOf(anyone)).to.be.bignumber.equal(amount);
                    });

                    it('emits a mint and a transfer event', async function () {
                        expectEvent.inLogs(this.logs, 'Transfer', {
                            from: ZERO_ADDRESS,
                            to: anyone,
                            value: amount,
                        });
                    });
                }
            });

            context('when the sender doesn\'t have minting permission', function () {
                const from = anyone;

                it('reverts', async function () {
                    await expectRevert.unspecified(this.token.mint(anyone, amount, { from }));
                });
            });
        });
    });
}

module.exports = {
    shouldBehaveLikeERC20Mintable,
};
