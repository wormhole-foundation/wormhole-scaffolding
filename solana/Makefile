include testing.env

.PHONY: dependencies test cargo-test unit-test integration-test clean all

all: test

.PHONY: clean
clean:
	rm -rf node_modules target dependencies/*.so

dependencies: node_modules dependencies/wormhole.so dependencies/token_bridge.so

node_modules:
	yarn

dependencies/token_bridge.so:
	bash shell-scripts/build_wormhole_repo_bpfs.sh

dependencies/wormhole.so:
	bash shell-scripts/build_wormhole_repo_bpfs.sh

.PHONY: cargo-test
cargo-test:
	cargo clippy -- --allow clippy::result_large_err
	cargo test

.PHONY: unit-test
unit-test: cargo-test

.PHONY: integration-test
integration-test: dependencies
	md5sum -c dependencies/checksum.txt
	anchor test

.PHONY: test
test: unit-test integration-test
