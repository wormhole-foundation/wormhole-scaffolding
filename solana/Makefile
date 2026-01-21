.DEFAULT_GOAL := build
.PHONY: build test unit-test integration-test clean node_modules

# -------------------------- Configuration --------------------------

SUPPORTED_NETWORKS := mainnet testnet devnet

NETWORK ?= $(shell cat default_network 2>/dev/null || echo "")
ifeq ($(NETWORK),)
  $(info No NETWORK specified, defaulting to local cluster (devnet))
  NETWORK := devnet
else
  $(info Using NETWORK from default_network file: $(NETWORK))
endif

ifeq ($(filter $(NETWORK),$(SUPPORTED_NETWORKS)),)
  $(error Invalid choice "$(NETWORK)" for NETWORK - must be one of: $(SUPPORTED_NETWORKS))
endif

# Save the chosen network to a file
$(shell echo $(NETWORK) > default_network)

# --------------------------- Targets -------------------------------

build:
	@echo "> Building programs for $(NETWORK)"
	@anchor build --arch sbf -- --features $(NETWORK)

test: unit-test integration-test

unit-test:
	@echo "> Running unit tests"
	@cargo clippy --all-features -- --allow clippy::result_large_err
	@cargo test --all-features

integration-test: node_modules
	@echo "> Running integration tests"
	@anchor test --arch sbf

clean:
	@echo "> Cleaning build artifacts"
	@rm -rf node_modules target .anchor

node_modules: package.json package-lock.json
	@echo "> Installing node modules"
	@npm ci
	@touch node_modules
