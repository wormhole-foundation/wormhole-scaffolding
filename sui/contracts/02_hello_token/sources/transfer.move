module hello_token::transfer {
    use sui::sui::SUI;
    use sui::coin::{Self, Coin, CoinMetadata};
    use sui::transfer::{Self};
    use sui::tx_context::{Self, TxContext};

    use token_bridge::normalized_amount::{Self};
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
    const E_INSUFFICIENT_AMOUNT: u64 = 2;

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
        ctx: &mut TxContext
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

        // Cache token transfer info.
        let decimals = coin::get_decimals(metadata);
        let amount_received = coin::value(&coins);

        // Compute the truncated token amount.
        let transformed_amount = normalized_amount::denormalize(
            normalized_amount::normalize(
                amount_received,
                decimals
            ),
            decimals
        );

        // Confirm that the transformed amount is greater than 0.
        assert!(transformed_amount > 0, E_INSUFFICIENT_AMOUNT);

        // Split the coins object and send dust back to the user if
        // the transformedAmount is less the original amount.
        let coins_to_transfer;
        if (transformed_amount < amount_received){
            coins_to_transfer = coin::split(&mut coins, transformed_amount, ctx);

            // Return the original object with the dust.
            transfer::transfer(coins, tx_context::sender(ctx))
        } else {
            coins_to_transfer = coins;
        };

        // Finally transfer tokens via Token Bridge.
        transfer_tokens_with_payload(
            state::emitter_cap(t_state),
            wormhole_state,
            token_bridge_state,
            coins_to_transfer,
            metadata,
            wormhole_fee,
            wormhole_u16::from_u64((target_chain as u64)),
            make_external(&bytes32::data(foreign_contract)),
            0, // relayer_fee, which will be taken out in abridge_state:: future release
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
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario, TransactionEffects};
    use sui::coin::{Self, Coin, CoinMetadata};
    use sui::object::{Self};
    use sui::transfer::{Self as native_transfer};
    use sui::tx_context::{TxContext};

    use hello_token::owner::{Self, OwnerCap};
    use hello_token::transfer::{Self};
    use hello_token::state::{State};

    use wormhole::emitter::{EmitterCapability as EmitterCap};
    use wormhole::state::{
        Self as wormhole_state_module,
        DeployerCapability as WormholeDeployerCap,
        State as WormholeState
    };
    use token_bridge::bridge_state::{
        Self,
        DeployerCapability as BridgeDeployerCap,
        BridgeState
    };
    use token_bridge::attest_token::{Self};

    // example coins
    use example_coins::coin_8::{Self};
    use example_coins::coin_9::{Self};

    const TEST_TOKEN_8_SUPPLY: u64 = 42069;
    const TEST_INSUFFICIENT_TOKEN_9_SUPPLY: u64 = 1;
    const TEST_SUI_SUPPLY: u64 = 69420;
    const TEST_RELAYER_FEE: u64 = 42069; // 4.2069%
    const TEST_RELAYER_FEE_PRECISION: u64 = 1000000;

    // These values are used to test that HelloToken correctly
    // returns token dust. If the TEST_TOKEN_9_SUPPLY value is
    // changed, the TEST_TOKEN_9_EXPECTED_DUST value must be
    // updated accordingly.
    const TEST_TOKEN_9_SUPPLY: u64 = 12345678910111;
    const TEST_TOKEN_9_EXPECTED_DUST: u64 = 1;

    #[test]
    public fun send_tokens_with_payload_coin_8() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create target contract variables.
        let target_chain: u16 = 69;
        let target_contract =
            x"0000000000000000000000000000000000000000000000000000000000000069";

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<BridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Mint token 8, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_8(
            TEST_TOKEN_8_SUPPLY,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, creator);

        // Mint SUI token amount based on the wormhole fee.
        let sui_coin = mint_sui(
            wormhole_state_module::get_message_fee(&wormhole_state),
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, creator);

        // Register the target contract.
        {
            let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

            owner::register_foreign_contract(
                &owner_cap,
                &mut hello_token_state,
                target_chain,
                target_contract
            );

            // Bye bye.
            test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        // Attest the token.
        {
            let fee_coin = mint_sui(TEST_SUI_SUPPLY, test_scenario::ctx(scenario));

            attest_token::attest_token(
                &mut wormhole_state,
                &mut bridge_state,
                &test_metadata,
                fee_coin,
                test_scenario::ctx(scenario)
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        // Send a test transfer.
        transfer::send_tokens_with_payload(
            &hello_token_state,
            &mut wormhole_state,
            &mut bridge_state,
            test_coin,
            &test_metadata,
            sui_coin,
            69,
            0,
            x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe",
            test_scenario::ctx(scenario)
        );

        // Return the goods.
        test_scenario::return_shared<State>(hello_token_state);
        test_scenario::return_shared<BridgeState>(bridge_state);
        test_scenario::return_shared<WormholeState>(wormhole_state);
        native_transfer::transfer(test_metadata, @0x0);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun send_tokens_with_payload_coin_9() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create target contract variables.
        let target_chain: u16 = 69;
        let target_contract =
            x"0000000000000000000000000000000000000000000000000000000000000069";

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<BridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Mint token 9, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_9(
            TEST_TOKEN_9_SUPPLY,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, creator);

        // Store test coin ID for later use.
        let test_coin_id = object::id(&test_coin);

        // Mint SUI token amount based on the wormhole fee.
        let sui_coin = mint_sui(
            wormhole_state_module::get_message_fee(&wormhole_state),
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, creator);

        // Register the target contract.
        {
            let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

            owner::register_foreign_contract(
                &owner_cap,
                &mut hello_token_state,
                target_chain,
                target_contract
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);

            // Bye bye.
            test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);
        };

        // Attest the token.
        {
            let fee_coin = mint_sui(TEST_SUI_SUPPLY, test_scenario::ctx(scenario));

            attest_token::attest_token(
                &mut wormhole_state,
                &mut bridge_state,
                &test_metadata,
                fee_coin,
                test_scenario::ctx(scenario)
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        // Send a test transfer.
        {
            transfer::send_tokens_with_payload(
                &hello_token_state,
                &mut wormhole_state,
                &mut bridge_state,
                test_coin,
                &test_metadata,
                sui_coin,
                69,
                0,
                x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe",
                test_scenario::ctx(scenario)
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);

            // Fetch the dust coin object.
            let dust_object =
                test_scenario::take_from_sender_by_id<Coin<coin_9::COIN_9>>(
                    scenario,
                    test_coin_id
                );

            // Confirm that the value of the token is non-zero.
            assert!(coin::value(&dust_object) == TEST_TOKEN_9_EXPECTED_DUST, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, dust_object);
        };

        // Return the goods.
        test_scenario::return_shared<State>(hello_token_state);
        test_scenario::return_shared<BridgeState>(bridge_state);
        test_scenario::return_shared<WormholeState>(wormhole_state);
        native_transfer::transfer(test_metadata, @0x0);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = 2, location=transfer)]
    public fun cannot_send_tokens_with_payload_coin_9_insufficient_amount() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create target contract variables.
        let target_chain: u16 = 69;
        let target_contract =
            x"0000000000000000000000000000000000000000000000000000000000000069";

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<BridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Mint token 9, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_9(
            TEST_INSUFFICIENT_TOKEN_9_SUPPLY,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, creator);

        // Mint SUI token amount based on the wormhole fee.
        let sui_coin = mint_sui(
            wormhole_state_module::get_message_fee(&wormhole_state),
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, creator);

        // Register the target contract.
        {
            let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

            owner::register_foreign_contract(
                &owner_cap,
                &mut hello_token_state,
                target_chain,
                target_contract
            );

            // Bye bye.
            test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        // Attest the token.
        {
            let fee_coin = mint_sui(TEST_SUI_SUPPLY, test_scenario::ctx(scenario));

            attest_token::attest_token(
                &mut wormhole_state,
                &mut bridge_state,
                &test_metadata,
                fee_coin,
                test_scenario::ctx(scenario)
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        // Send a test transfer.
        transfer::send_tokens_with_payload(
            &hello_token_state,
            &mut wormhole_state,
            &mut bridge_state,
            test_coin,
            &test_metadata,
            sui_coin,
            69,
            0,
            x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe",
            test_scenario::ctx(scenario)
        );

        // Return the goods.
        test_scenario::return_shared<State>(hello_token_state);
        test_scenario::return_shared<BridgeState>(bridge_state);
        test_scenario::return_shared<WormholeState>(wormhole_state);
        native_transfer::transfer(test_metadata, @0x0);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location=transfer)]
    public fun cannot_send_tokens_with_payload_contract_not_registered() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Mint token 8 and fetch the metadata.
        let (test_coin, test_metadata) = mint_coin_8(
            TEST_TOKEN_8_SUPPLY,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, creator);

        // Mint SUI token.
        let sui_coin = mint_sui(TEST_SUI_SUPPLY, test_scenario::ctx(scenario));
        test_scenario::next_tx(scenario, creator);

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<BridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Send a test transfer.
        transfer::send_tokens_with_payload(
            &hello_token_state,
            &mut wormhole_state,
            &mut bridge_state,
            test_coin,
            &test_metadata,
            sui_coin,
            69, // Unregistered chain ID.
            0,
            x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe", // Unregistered contract.
            test_scenario::ctx(scenario)
        );

        // Return the goods.
        test_scenario::return_shared<State>(hello_token_state);
        test_scenario::return_shared<BridgeState>(bridge_state);
        test_scenario::return_shared<WormholeState>(wormhole_state);
        native_transfer::transfer(test_metadata, @0x0);

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
                test_scenario::take_shared<WormholeState>(scenario);
            wormhole::wormhole::get_new_emitter(
                &mut wormhole_state,
                test_scenario::ctx(scenario)
            );

            // Bye bye.
            test_scenario::return_shared<WormholeState>(wormhole_state);

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
                test_scenario::take_shared<WormholeState>(scenario);
            wormhole::wormhole::get_new_emitter(
                &mut wormhole_state,
                test_scenario::ctx(scenario)
            );

            // Bye bye.
            test_scenario::return_shared<WormholeState>(wormhole_state);

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
            let emitter_cap =
                test_scenario::take_from_sender<EmitterCap>(scenario);

            hello_token::owner::create_state(
                &mut owner_cap,
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

    public fun mint_coin_8(
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<coin_8::COIN_8>, CoinMetadata<coin_8::COIN_8>) {
        // Initialize token 8.
        let (treasury_cap, metadata) = coin_8::create_coin_test_only(ctx);

        // Mint tokens.
        let test_coin = coin::mint(
            &mut treasury_cap,
            amount,
            ctx
        );

        // Balance check the new coin object.
        assert!(coin::value(&test_coin) == amount, 0);

        // Bye bye.
        native_transfer::transfer(treasury_cap, @0x0);

        // Return.
        (test_coin, metadata)
    }

    public fun mint_coin_9(
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<coin_9::COIN_9>, CoinMetadata<coin_9::COIN_9>) {
        // Initialize token 8.
        let (treasury_cap, metadata) = coin_9::create_coin_test_only(ctx);

        // Mint tokens.
        let test_coin = coin::mint(
            &mut treasury_cap,
            amount,
            ctx
        );

        // Balance check the new coin object.
        assert!(coin::value(&test_coin) == amount, 0);

        // Bye bye.
        native_transfer::transfer(treasury_cap, @0x0);

        // Return.
        (test_coin, metadata)
    }

    public fun mint_sui(amount: u64, ctx: &mut TxContext): Coin<SUI> {
        // Mint SUI tokens.
        let sui_coin = sui::coin::mint_for_testing<SUI>(
            amount,
            ctx
        );
        assert!(coin::value(&sui_coin) == amount, 0);

        sui_coin
    }
}
