// Make sure eth has access to its env vars
require('dotenv').config({
    path: `${__dirname}/../../evm/testing.env`, 
    debug: true
});
import * as ethhw from '../../evm/ts-test/helpers/utils';