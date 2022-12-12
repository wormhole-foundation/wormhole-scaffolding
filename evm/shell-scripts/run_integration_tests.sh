#/bin/bash

pgrep anvil > /dev/null
if [ $? -eq 0 ]; then
    echo "anvil already running"
    exit 1;
fi

# avalanche mainnet fork
anvil \
    -m "myth like bonus scare over problem client lizard pioneer submit female collect" \
    --port 8545 \
    --fork-url $TESTING_AVAX_FORK_RPC > anvil_avax.log &

# ethereum mainnet fork
anvil \
    -m "myth like bonus scare over problem client lizard pioneer submit female collect" \
    --port 8546 \
    --fork-url $TESTING_ETH_FORK_RPC > anvil_eth.log &

sleep 2

## anvil's rpc
AVAX_RPC="http://localhost:8545"
ETH_RPC="http://localhost:8546"

## first key from mnemonic above
PRIVATE_KEY="0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d"

## override environment variables based on deployment network
export TESTING_WORMHOLE_ADDRESS=$TESTING_AVAX_WORMHOLE_ADDRESS
export TESTING_BRIDGE_ADDRESS=$TESTING_AVAX_BRIDGE_ADDRESS

echo "deploying contracts to Avalanche fork"
forge script forge-scripts/deploy_01_hello_world.sol \
    --rpc-url $AVAX_RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow > forge-scripts/deploy.out 2>&1

forge script forge-scripts/deploy_02_hello_token.sol \
    --rpc-url $AVAX_RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow > forge-scripts/deploy.out 2>&1

forge script forge-scripts/deploy_wormUSD.sol \
    --rpc-url $AVAX_RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow > forge-scripts/deploy.out 2>&1

## override environment variables based on deployment network
export TESTING_WORMHOLE_ADDRESS=$TESTING_ETH_WORMHOLE_ADDRESS
export TESTING_BRIDGE_ADDRESS=$TESTING_ETH_BRIDGE_ADDRESS

echo "deploying contracts to Ethereum fork"
forge script forge-scripts/deploy_01_hello_world.sol \
    --rpc-url $ETH_RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow > forge-scripts/deploy.out 2>&1

forge script forge-scripts/deploy_02_hello_token.sol \
    --rpc-url $ETH_RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow > forge-scripts/deploy.out 2>&1

forge script forge-scripts/deploy_wormUSD.sol \
    --rpc-url $ETH_RPC \
    --private-key $PRIVATE_KEY \
    --broadcast --slow > forge-scripts/deploy.out 2>&1

## run tests here
npx ts-mocha -t 1000000 ts-test/*.ts

# nuke
pkill anvil
