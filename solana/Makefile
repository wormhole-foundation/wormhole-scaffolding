.DEFAULT_GOAL = build
.PHONY: build test unit-test integration-test clean

ifndef NETWORK
	$(info No NETWORK specified, defaulting to local cluster (devnet))
	NETWORK = devnet
endif
#exported for use in dependencies/Makefile and TypeScript code
export NETWORK := $(strip $(NETWORK))

#WARNING regarding naming conflicts between Solana clusters and Wormhole networks!
#testnet actually refers to Solana's devnet cluster (Solana also has a cluster called testnet but
# that is meant for trying out new version/releases of the protocol and not for smart contract devs)
#devnet refers to Wormhole's tilt devnet i.e. it's a local cluster
export supported_networks := mainnet testnet devnet

# ----------------------------------------- IMPLEMENTATION -----------------------------------------

ifeq ($(strip $(filter $(supported_networks),$(NETWORK))),)
	$(error Invalid choice $(NETWORK) for NETWORK - must be one of $(supported_networks))
endif

test: unit-test integration-test

unit-test:
	cargo clippy --all-features -- --allow clippy::result_large_err
	cargo test --all-features

integration-test:
	anchor test --arch sbf

build:
	@echo "> Building programs"
	anchor build --arch sbf -- --features $(NETWORK)

clean:
	rm -rf node_modules target .anchor

ifneq ($(NETWORK), $(shell cat target/network_changed 2>/dev/null))
#force update of target/network_changed if value of NETWORK changed from last time
.PHONY: target/network_changed
endif
target/network_changed:
	echo $(NETWORK) > target/network_changed
	
node_modules: package.json package-lock.json
	@echo "> Updating node modules"
	npm ci
	touch node_modules
