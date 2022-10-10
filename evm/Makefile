.PHONY: dependencies unit-test integration-test clean all

all: build

.PHONY: clean
clean:
	rm -rf anvil.log node_modules lib out

.PHONY: dependencies
dependencies: node_modules lib/forge-std

node_modules:
	yarn

lib/forge-std:
	forge install foundry-rs/forge-std@2c7cbfc6fbede6d7c9e6b17afe997e3fdfe22fef --no-git --no-commit

build: dependencies
	forge build

.PHONY: unit-test
forge-test: dependencies build
	forge test --fork-url https://api.avax.network/ext/bc/C/rpc -vv

#.PHONY: integration-test
#integration-test: dependencies build
#	npm run integration-test

.PHONY: test
test: forge-test integration-test

