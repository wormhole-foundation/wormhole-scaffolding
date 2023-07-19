/// This module creates an owner capability (OwnerCap). The owner is granted
/// access to certain methods by passing the OwnerCap as an argument. These
/// methods are used to govern the smart contract.
module hello_token::owner {
    // Sui dependencies.
    use sui::package::{Self, UpgradeCap};
    use sui::dynamic_field::{Self};
    use sui::object::{Self, UID};
    use sui::transfer::{Self};
    use sui::tx_context::{Self, TxContext};

    // Wormhole dependencies.
    use wormhole::external_address::{Self};
    use wormhole::state::{State as WormholeState};

    // Hello Token dependencies.
    use hello_token::state::{Self, State};

    // Errors.
    const E_STATE_ALREADY_CREATED: u64 = 0;

    /// The one of a kind - created in the module initializer.
    struct OwnerCap has key, store {
        id: UID
    }

    /// This function is only called once on module publish.
    /// Use it to make sure something has happened only once, like
    /// here - only module author will own a version of a
    /// `OwnerCap` struct.
    fun init(ctx: &mut TxContext) {
        // Create `OwnerCap` to the contract publisher.
        let owner_cap = OwnerCap {
            id: object::new(ctx),
        };

        // Use this in `create_state` to determine if state is created already.
        dynamic_field::add(&mut owner_cap.id, b"create_state", true);

        // Transfer `OwnerCap` to the contract publisher.
        transfer::transfer(owner_cap, tx_context::sender(ctx));
    }

    /// Only owner. This creates a new state object that also acts as dynamic
    /// storage.
    public fun create_state(
        owner_cap: &mut OwnerCap,
        upgrade_cap: UpgradeCap,
        wormhole_state: &WormholeState,
        relayer_fee: u64,
        relayer_fee_precision: u64,
        ctx: &mut TxContext
    ) {
        assert!(
            dynamic_field::exists_(&owner_cap.id, b"create_state"),
            E_STATE_ALREADY_CREATED
        );

        // State will be created once function finishes.
        let _: bool = dynamic_field::remove(&mut owner_cap.id, b"create_state");

        // Make the contract immutable by destroying the upgrade cap. The caller
        // must pass the correct upgrade cap to make this contract immutable.
        package::make_immutable(upgrade_cap);

        // Create and share state.
        transfer::public_share_object(
            state::new(
                wormhole_state,
                relayer_fee,
                relayer_fee_precision,
                ctx
            )
        )
    }

    /// Only owner. This method registers a foreign Hello Token contract. This
    /// allows this contract to receive token transfers from other Hello Token
    /// contracts in a trusted way.
    public fun register_foreign_contract(
        _: &OwnerCap,
        t_state: &mut State,
        chain: u16,
        contract_address: address,
    ) {
        state::register_foreign_contract(
            t_state,
            chain,
            external_address::from_address(contract_address)
        );
    }

    /// Only owner. This method updates the `relayer_fee` and
    /// `relayer_fee_precision` for this chain.
    public fun update_relayer_fee(
        _: &OwnerCap,
        t_state: &mut State,
        relayer_fee: u64,
        relayer_fee_precision: u64
    ) {
        state::update_relayer_fee(t_state, relayer_fee, relayer_fee_precision)
    }

    #[test_only]
    /// We need this function to simulate calling `init` in our test.
    public fun init_test_only(ctx: &mut TxContext): UpgradeCap {
        init(ctx);

        package::test_publish(
            object::id_from_address(@hello_token),
            ctx
        )
    }
}

#[test_only]
module hello_token::owner_tests {
    // Standard lib.
    use std::vector::{Self};

    // Sui dependencies.
    use sui::object::{Self};
    use sui::transfer::{Self};
    use sui::test_scenario::{Self, Scenario, TransactionEffects};

    // Hello Token dependencies.
    use hello_token::state::{State as HelloTokenState};
    use hello_token::owner::{Self, OwnerCap};

    // Wormhole dependencies.
    use wormhole::state::{State as WormholeState};
    use wormhole::external_address::{Self};

    // Token Bridge dependencies.
    use token_bridge::state::{State as BridgeState};
    use token_bridge::register_chain::{Self};
    use token_bridge::token_bridge_scenario::{Self};

    // Test constants.
    const TEST_RELAYER_FEE: u64 = 42069; // 4.2069%
    const TEST_RELAYER_FEE_PRECISION: u64 = 1000000;
    const TEST_TARGET_CHAIN: u16 = 2;
    const TEST_TARGET_CONTRACT: address =
        @0x000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;

    #[test]
    public fun init_test() {
        let my_scenario = test_scenario::begin(@0x0);
        let scenario = &mut my_scenario;
        let (creator, _) = people();

        // Get things going.
        test_scenario::next_tx(scenario, creator);

        // Simulate calling `init`.
        {
            let upgrade_cap = owner::init_test_only(
                test_scenario::ctx(scenario)
            );

            // Check existence of creator and state capabilities.
            let effects = test_scenario::next_tx(scenario, creator);

            // Confirm that only one object was created.
            let created_ids = test_scenario::created(&effects);
            assert!(vector::length(&created_ids) == 1, 0);

            // Verify that the created ID matches the OwnerCap's ID.
            let owner_cap_id = vector::borrow(&created_ids, 0);
            let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);
            assert!(*owner_cap_id == object::id(&owner_cap), 0);

            // Bye bye.
            transfer::public_transfer(upgrade_cap, @0x0);
            test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);
        };

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun create_state() {
        let (creator, _) = people();
        let (my_scenario, effects) = set_up(creator);
        let scenario = &mut my_scenario;

        // We expect one object to be created:
        // 1. State
        let created_ids = test_scenario::created(&effects);
        assert!(vector::length(&created_ids) == 1, 0);

        // Verify that the created ID matches the State's ID.
        let state_id = vector::borrow(&created_ids, 0);
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        assert!(*state_id == object::id(&state), 0);

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun register_foreign_contract() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Fetch the Hello Token state object and owner capability.
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Verify that the contract isn't already registered.
        {
            let is_registered =
                hello_token::state::contract_registered(
                    &state,
                    TEST_TARGET_CHAIN
                );
            assert!(!is_registered, 0);
        };

        // Register the emitter.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            TEST_TARGET_CHAIN,
            TEST_TARGET_CONTRACT,
        );

        // Verify that the contract was registered correctly.
        {
            let is_registered =
                hello_token::state::contract_registered(&state, TEST_TARGET_CHAIN);
            assert!(is_registered, 0);

            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    TEST_TARGET_CHAIN
                );
            assert!(
                external_address::to_address(
                    registered_contract
                ) == TEST_TARGET_CONTRACT,
                0
            );
        };

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun replace_foreign_contract() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create mock chain ID and address pair.
        let target_contract_2 = @0x69;

        // Fetch the Hello Token state object and owner capability.
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Register the emitter.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            TEST_TARGET_CHAIN,
            TEST_TARGET_CONTRACT,
        );

        // Verify that the contract was registered correctly.
        {
            let is_registered =
                hello_token::state::contract_registered(&state, TEST_TARGET_CHAIN);
            assert!(is_registered, 0);

            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    TEST_TARGET_CHAIN
                );
            assert!(
                external_address::to_address(
                    registered_contract
                ) == TEST_TARGET_CONTRACT,
                0
            );
        };

        // Proceed.
        test_scenario::next_tx(scenario, creator);

        // Register another emitter with the same chain ID.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            TEST_TARGET_CHAIN,
            target_contract_2,
        );

        // Verify that the contract was registered correctly.
        {
            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    TEST_TARGET_CHAIN
                );
            assert!(
                external_address::to_address(
                    registered_contract
                ) == target_contract_2,
                0
            );
        };

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = hello_token::foreign_contracts::E_INVALID_CHAIN)]
    public fun cannot_register_foreign_contract_chain_id_zero() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Intentionally set the `target_chain` to zero.
        let target_chain: u16 = 0;

        // Fetch the Hello Token state object and owner capability.
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // The `register_foreign_contract` call should fail.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            TEST_TARGET_CONTRACT,
        );

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = hello_token::foreign_contracts::E_INVALID_CHAIN)]
    public fun cannot_register_foreign_contract_this_chain_id() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Intentionally set the `target_chain` to 21 (Sui's ID).
        let target_chain: u16 = 21;

        // Fetch the Hello Token state object and owner capability.
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // The `register_foreign_contract` call should fail.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            TEST_TARGET_CONTRACT,
        );

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = hello_token::foreign_contracts::E_INVALID_CONTRACT_ADDRESS)]
    public fun cannot_register_foreign_contract_zero_address() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create zero address variable.
        let target_contract = @0x0;

        // Fetch the Hello Token state object and owner capability.
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // The `register_foreign_contract` call should fail.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            TEST_TARGET_CHAIN,
            target_contract,
        );

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = hello_token::foreign_contracts::E_INVALID_CONTRACT_ADDRESS)]
    public fun cannot_replace_foreign_contract_zero_address() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create zero address variable.
        let target_contract = @0x0;

        // Fetch the Hello Token state object and owner capability.
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Register the emitter.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            TEST_TARGET_CHAIN,
            TEST_TARGET_CONTRACT,
        );

        // Verify that the contract was registered correctly.
        {
            let is_registered =
                hello_token::state::contract_registered(&state, TEST_TARGET_CHAIN);
            assert!(is_registered, 0);

            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    TEST_TARGET_CHAIN
                );
            assert!(
                external_address::to_address(
                    registered_contract
                ) == TEST_TARGET_CONTRACT,
                0
            );
        };

        // Proceed.
        test_scenario::next_tx(scenario, creator);

        // Attempt to replace the registered emitter with the zero address.
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            TEST_TARGET_CHAIN,
            target_contract
        );

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun update_relayer_fee() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Set the test fee and fee precision variables.
        let test_fee: u64 = 500000; // 5%
        let test_precision: u64 = 10000000;
        assert!(
            test_precision != TEST_RELAYER_FEE_PRECISION &&
            test_fee != TEST_RELAYER_FEE,
            0
        );

        // Fetch the Hello Token state object and owner capability.
        let state = test_scenario::take_shared<HelloTokenState>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Verify the initial state.
        {
            let fee_value = hello_token::state::fee_value(&state);
            let fee_precision = hello_token::state::fee_precision(&state);
            assert!(
                fee_precision == TEST_RELAYER_FEE_PRECISION &&
                fee_value == TEST_RELAYER_FEE,
                0
            );
        };

        // Update the relayer fee.
        hello_token::owner::update_relayer_fee(
            &owner_cap,
            &mut state,
            test_fee,
            test_precision
        );

        // Verify that the state was updated correctly.
        {
            let fee_value = hello_token::state::fee_value(&state);
            let fee_precision = hello_token::state::fee_precision(&state);
            assert!(
                fee_precision == test_precision &&
                fee_value == test_fee,
                0
            );
        };

        // Bye bye.
        test_scenario::return_shared<HelloTokenState>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    // Utility functions.

    /// Returns two unique test addresses.
    public fun people(): (address, address) {
        (@0x9f082e1bE326e8863BAc818F0c08ae28a8D47C99, @0x1337)
    }

    /// This function sets up the test scenario Hello Token by initializing
    /// the Wormhole, Token Bridge and Hello Token contracts.
    public fun set_up(creator: address): (Scenario, TransactionEffects) {
        let my_scenario = test_scenario::begin(@0x0);
        let scenario = &mut my_scenario;

        // Set up Wormhole and the Token Bridge.
        {
            token_bridge_scenario::set_up_wormhole_and_token_bridge(scenario, 100);

            // Ignore effects.
            test_scenario::next_tx(scenario, creator);
        };

        // Set up the Hello Token contract.
        let upgrade_cap;
        {
            upgrade_cap = owner::init_test_only(test_scenario::ctx(scenario));

            // Proceed.
            test_scenario::next_tx(scenario, creator);
        };

        // Register a test emitter on the Token Bridge.
        {
            let state = test_scenario::take_shared<BridgeState>(scenario);
            register_chain::register_new_emitter_test_only(
                &mut state,
                2, // Ethereum chain ID
                external_address::from_address(@0x3ee18B2214AFF97000D974cf647E7C347E8fa585),
            );

            // Proceed.
            test_scenario::next_tx(scenario, creator);

            // Return the goods.
            test_scenario::return_shared<BridgeState>(state);
        };

        // Create the Hello Token shared state object and destory the upgrade cap.
        {
            let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);
            let wormhole_state =
                test_scenario::take_shared<WormholeState>(scenario);

            owner::create_state(
                &mut owner_cap,
                upgrade_cap,
                &mut wormhole_state,
                TEST_RELAYER_FEE,
                TEST_RELAYER_FEE_PRECISION,
                test_scenario::ctx(scenario)
            );

            // Bye bye.
            test_scenario::return_to_sender<OwnerCap>(
                scenario,
                owner_cap
            );
            test_scenario::return_shared(wormhole_state);
        };

        let effects = test_scenario::next_tx(scenario, creator);
        (my_scenario, effects)
    }
}
