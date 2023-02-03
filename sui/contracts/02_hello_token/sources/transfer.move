module hello_token::transfer {
    use sui::sui::SUI;
    use sui::coin::{Coin, CoinMetadata};
    use token_bridge::bridge_state::{BridgeState as TokenBridgeState};
    use token_bridge::transfer_tokens::{transfer_tokens_with_payload};
    use wormhole::external_address::{left_pad as make_external};
    use wormhole::myu16::{Self as wormhole_u16};
    use wormhole::state::{State as WormholeState};

    use hello_token::bytes32::{Self};
    use hello_token::message::{Self};
    use hello_token::state::{Self, State};

    // Errors.
    const E_INVALID_TARGET_RECIPIENT: u64 = 0;
    const E_UNREGISTERED_FOREIGN_CONTRACT: u64 = 1;

    public entry fun send_tokens_with_payload<T>(
        t_state: &State,
        wormhole_state: &mut WormholeState,
        token_bridge_state: &mut TokenBridgeState,
        coins: Coin<T>,
        metadata: &CoinMetadata<T>,
        wormhole_fee: Coin<SUI>,
        target_chain: u16,
        batch_id: u32,
        target_recipient: vector<u8>,
    ) {
        // We must have already registered a foreign contract before we can
        // bridge tokens to it.
        assert!(
            state::contract_registered(t_state, target_chain),
            E_UNREGISTERED_FOREIGN_CONTRACT
        );
        let foreign_contract =
            state::foreign_contract_address(t_state, target_chain);

        // When we create the message, `target_recipient` cannot be the zero
        // address.
        let msg = message::from_bytes(target_recipient);

        // Finally transfer tokens via Token Bridge.
        transfer_tokens_with_payload(
            state::emitter_cap(t_state),
            wormhole_state,
            token_bridge_state,
            coins,
            metadata,
            wormhole_fee,
            wormhole_u16::from_u64((target_chain as u64)),
            make_external(&bytes32::data(foreign_contract)),
            0, // relayer_fee, which will be taken out in a future release
            (batch_id as u64),
            message::encode(&msg)
        );
    }

    // public entry fun redeem_transfer_with_payload<T>(
    //     ...
    // ) {
    //     // TODO
    // }
}

#[test_only]
module hello_token::transfer_tests {
    use sui::test_scenario::{Self, Scenario, TransactionEffects};
    use sui::coin::{Self, TreasuryCap};

    use hello_token::owner::{Self, OwnerCap, StateCap};
    use wormhole::emitter::{EmitterCapability as EmitterCap};
    use wormhole::state::{DeployerCapability as WormholeDeployerCap};
    use token_bridge::bridge_state::{Self as bridge_state, DeployerCapability as BridgeDeployerCap};
    use example_coins::coin_8::{Self};

    const TEST_TOKEN_8_SUPPLY: u64 = 42069;
    const TEST_RELAYER_FEE: u64 = 42069; // 4.2069%
    const TEST_RELAYER_FEE_PRECISION: u64 = 1000000;

    #[test]
    public fun send_tokens_with_payload() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Fetch the cap
        let treasury_cap =
            test_scenario::take_from_sender<TreasuryCap<coin_8::COIN_8>>(
                scenario
            );

        // Mint tokens.
        let test_coin = coin::mint(
            &mut treasury_cap,
            TEST_TOKEN_8_SUPPLY,
            test_scenario::ctx(scenario)
        );

        // Balance check the new coin object
        assert!(coin::value(&test_coin) == TEST_TOKEN_8_SUPPLY, 0);

        // Bye bye.
        test_scenario::return_to_sender<TreasuryCap<coin_8::COIN_8>>(
            scenario,
            treasury_cap
        );

        // Proceed.
        test_scenario::next_tx(scenario, creator);

        // Destory for testing
        coin::destroy_for_testing(test_coin);

        // Fetch the coin metadata
        // let coin_meta = take_shared<CoinMetadata<coin_8::COIN_8>>(&test);

        // Done.
        test_scenario::end(my_scenario);
    }

    // utilities
    fun people(): (address, address) { (@0xBEEF, @0x1337) }

    public fun set_up(creator: address): (Scenario, TransactionEffects) {
        let my_scenario = test_scenario::begin(@0x0);
        let scenario = &mut my_scenario;

        // Proceed.
        test_scenario::next_tx(scenario, creator);

        // Initialize token 8
        {
            coin_8::init_test_only(test_scenario::ctx(scenario));

            test_scenario::next_tx(scenario, creator);
        };

        // Set up Wormhole contract.
        {
            wormhole::state::test_init(test_scenario::ctx(scenario));

            // Proceed.
            test_scenario::next_tx(scenario, creator);

            let deployer =
                test_scenario::take_from_sender<WormholeDeployerCap>(
                    scenario
                );

            // Share Wormhole state.
            wormhole::state::init_and_share_state(
                deployer,
                21,
                1, // governance chain
                x"0000000000000000000000000000000000000000000000000000000000000004", // governance_contract
                vector[x"beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe"], // initial_guardians
                test_scenario::ctx(scenario)
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        {
            // We need the Wormhole state to create a new emitter.
            let wormhole_state =
                test_scenario::take_shared<wormhole::state::State>(scenario);
            wormhole::wormhole::get_new_emitter(
                &mut wormhole_state,
                test_scenario::ctx(scenario)
            );

            // Bye bye.
            test_scenario::return_shared<wormhole::state::State>(wormhole_state);

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        // Set up Token Bridge contract.
        {
            bridge_state::test_init(test_scenario::ctx(scenario));

            // Proceed.
            test_scenario::next_tx(scenario, creator);
            assert!(
                test_scenario::has_most_recent_for_sender<BridgeDeployerCap>(scenario),
                0
            );

            let deployer_cap =
                test_scenario::take_from_sender<BridgeDeployerCap>(
                    scenario
                );
            let emitter_cap =
                test_scenario::take_from_sender<EmitterCap>(scenario);

            // Init the bridge state
            bridge_state::init_and_share_state(
                deployer_cap,
                emitter_cap,
                test_scenario::ctx(scenario)
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        {
            // Create another emitter for the HelloToken module
            let wormhole_state =
                test_scenario::take_shared<wormhole::state::State>(scenario);
            wormhole::wormhole::get_new_emitter(
                &mut wormhole_state,
                test_scenario::ctx(scenario)
            );

            // Bye bye.
            test_scenario::return_shared<wormhole::state::State>(wormhole_state);

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        {
            // We call `init_test_only` to simulate `init`
            owner::init_test_only(test_scenario::ctx(scenario));

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        {
            let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);
            let state_cap =
                test_scenario::take_from_sender<StateCap>(scenario);
            let emitter_cap =
                test_scenario::take_from_sender<EmitterCap>(scenario);

            hello_token::owner::create_state(
                &owner_cap,
                state_cap,
                emitter_cap,
                TEST_RELAYER_FEE,
                TEST_RELAYER_FEE_PRECISION,
                test_scenario::ctx(scenario)
            );

            // Bye bye.
            test_scenario::return_to_sender<OwnerCap>(
                scenario,
                owner_cap
            );
        };

        let effects = test_scenario::next_tx(scenario, creator);
        (my_scenario, effects)
    }
}
