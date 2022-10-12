include testing.env

.PHONY: dependencies build test unit-test integration-test clean build-wormhole-repo all

all: build

.PHONY: clean
clean:
	rm -rf node_modules target dependencies/*.so

dependencies: node_modules dependencies/wormhole.so dependencies/token_bridge.so

node_modules:
	yarn

dependencies/token_bridge.so: build-wormhole-repo

dependencies/wormhole.so: build-wormhole-repo

.PHONY: build-wormhole-repo
build-wormhole-repo:
	bash shell-scripts/build_wormhole_repo_bpfs.sh

.PHONY: unit-test
unit-test:
	cargo clippy
	cargo test

.PHONY: integration-test
integration-test: dependencies
	anchor test

.PHONY: test
test: unit-test integration-test
