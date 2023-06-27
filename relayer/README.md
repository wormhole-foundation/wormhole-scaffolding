Simple Relayer Example
-----------------------

If your application chooses not to use the Automatic Relayer feature, you'll have to relay VAAs to the target chain yourself.

This example just borrows the contracts and clients from the `hello_world` examples to demonstrate a simple relayer implementation.

In this case we're just triggering the delivery of a VAA to some destination chain after we send the message on some source chain. 

TODO: doesn't work with guardian API yet.


## Setup 

In each chain directory ([evm](../evm/README.md), [solana](../solana/README.md), ...) run the appropriate make steps to build the project.

It's also good practice to run the unit/integration tests to be sure everything builds and runs as expected.


### Start local nodes

TODO: Smoother process
- script in `evm.bash` modified to only launch 1 chain
- script `deploy_test_token.sh` modified to revert recent change

Clone down the xdapp book repo and start a couple local validators:
```
git clone https://github.com/wormhole-foundation/xdapp-book.git
cd xdapp-book/projects/wormhole-local-validator
yarn
yarn run evm
yarn run solana
```

### Solana

Deploy the solana contract

TODO: can we not do this in TS?

In the [solana](../solana/) directory, run:
```
anchor deploy
```

## Run it

```sh
cd relayer
yarn run doit
```

