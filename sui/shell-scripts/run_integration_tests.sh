#/bin/bash

pgrep -f sui-test-validator > /dev/null
if [ $? -eq 0 ]; then
    echo "sui-test-validator already running"
    exit 1;
fi

TEST_DIR=$(dirname $0)/../ts/tests
SUI_CONFIG=$TEST_DIR/sui_config

### Remove databases generated by localnet
rm -rf $SUI_CONFIG/*_db

### Start local node
sui start \
    --network.config $TEST_DIR/sui_config/network.yaml > /dev/null 2>&1 &

sleep 1

echo "deploying wormhole contracts to localnet"
yarn deploy dependencies/wormhole \
    -c ts/tests/sui_config/client.yaml \
    -m dependencies/wormhole.Move.localnet.toml

yarn deploy dependencies/token_bridge \
    -c ts/tests/sui_config/client.yaml \
    -m dependencies/token_bridge.Move.localnet.toml

echo "deploying example coins"
yarn deploy contracts/example_coins \
    -c ts/tests/sui_config/client.yaml \
    -m contracts/example_coins/Move.localnet.toml

## run environment check here
npx ts-mocha -t 1000000 $TEST_DIR/00_environment.ts

## deploy scaffolding contracts
echo "deploying scaffolding examples"
yarn deploy contracts/02_hello_token \
    -c ts/tests/sui_config/client.yaml \
    -m contracts/02_hello_token/Move.localnet.toml

## run contract tests here
npx ts-mocha -t 1000000 $TEST_DIR/0[1-9]*.ts

# nuke
pkill sui

# remove databases generated by localnet
rm -rf $SUI_CONFIG/*_db
