include testing.env

.PHONY: dependencies unit-test forge-test integration-test clean all

all: build

.PHONY: clean
clean:
	rm -rf anvil.log node_modules lib out

.PHONY: dependencies
dependencies: node_modules lib/forge-std

node_modules:
	yarn

lib/forge-std:
	forge install foundry-rs/forge-std --no-git --no-commit

build: dependencies
	forge build
	yarn build-types

.PHONY: unit-test
unit-test: forge-test

.PHONY: forge-test
forge-test: dependencies
	forge test --fork-url ${TESTING_AVAX_FORK_RPC} -vv

.PHONY: integration-test
integration-test: dependencies build
	bash shell-scripts/run_integration_tests.sh

.PHONY: test
test: forge-test integration-test

