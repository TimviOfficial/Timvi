module.exports = {
    skipFiles: ['helpers/', 'mocks/', 'services/gate/'],
    deepSkip: true,
    port: 8555,
    // norpc: true,
    testrpcOptions: '-p 8555 -e 10000',
    mocha: {
        reporter: 'eth-gas-reporter',
        reporterOptions: {
            currency: 'USD',
            gasPrice: 10
        }
    }
};
