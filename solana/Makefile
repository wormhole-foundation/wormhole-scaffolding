.DEFAULT_GOAL = build
.PHONY: build test unit-test integration-test clean

SUPPORTED_NETWORKS := mainnet testnet devnet

ifndef NETWORK
  NETWORK := $(shell cat default_network 2>/dev/null)
  ifndef NETWORK
    $(info No NETWORK specified, defaulting to local cluster (devnet))
    NETWORK := devnet
  else
    $(info using NETWORK from default_network file: $(NETWORK))
  endif
endif

NETWORK := $(strip $(NETWORK))
ifeq ($(strip $(filter $(SUPPORTED_NETWORKS),$(NETWORK))),)
  $(error Invalid choice $(NETWORK) for NETWORK - must be one of $(SUPPORTED_NETWORKS))
endif
$(shell echo $(NETWORK) > default_network)

# ----------------------------------------- IMPLEMENTATION -----------------------------------------

test: unit-test integration-test

unit-test:
	cargo clippy --all-features -- --allow clippy::result_large_err
	cargo test --all-features

integration-test: node_modules
	anchor test --arch sbf


#WARNING regarding naming conflicts between Solana clusters and Wormhole networks!
#testnet actually refers to Solana's devnet cluster (Solana also has a cluster called testnet but
# that is meant for trying out new version/releases of the protocol and not for smart contract devs)
#devnet refers to Wormhole's tilt devnet i.e. it's a local cluster
build:
	@echo "> Building programs for $(NETWORK)"
	anchor build --arch sbf -- --features $(NETWORK)

clean:
	rm -rf node_modules target .anchor

node_modules: package.json package-lock.json
	@echo "> Updating node modules"
	npm ci
	touch node_modules
