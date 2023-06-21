include env/testing.env

CONTRACTS := $(wildcard contracts/*/.)

.PHONY: dependencies all clean build test integration-test $(CONTRACTS)

all:

.PHONY: clean
clean:
	rm -rf node_modules dependencies/wormhole dependencies/token_bridge ts/tests/sui_config/*_db/

dependencies: node_modules dependencies/wormhole/build dependencies/token_bridge/build

node_modules:
	yarn

dependencies/token_bridge/build: dependencies/wormhole/build

dependencies/wormhole/build:
	bash shell-scripts/fetch_wormhole_contracts.sh

.PHONY: test
test: unit-test integration-test

.PHONY: unit-test
unit-test: $(CONTRACTS)

$(CONTRACTS):
	$(MAKE) -C $@ test

.PHONY: integration-test
integration-test: dependencies
	bash shell-scripts/run_integration_tests.sh
