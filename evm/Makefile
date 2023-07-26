include testing.env

.DEFAULT_GOAL = build
.PHONY: test unit-test forge-test integration-test build dependencies clean

test: unit-test integration-test

unit-test: forge-test

forge-test: build
	forge test --fork-url ${TESTING_AVAX_FORK_RPC} -vv

integration-test: build
	bash shell-scripts/run_integration_tests.sh

build: dependencies
	forge build
	yarn typechain --target=ethers-v5 --out-dir=ethers-contracts out/*/*.json

dependencies: node_modules \
    lib/forge-std lib/openzeppelin-contracts

clean:
	forge clean
	rm -rf node_modules anvil*.log lib ethers-contracts broadcast cache


node_modules:
	yarn

lib/forge-std:
	forge install foundry-rs/forge-std@v1.4.0 --no-git --no-commit

lib/openzeppelin-contracts:
	forge install openzeppelin/openzeppelin-contracts@v4.8.1 --no-git --no-commit
