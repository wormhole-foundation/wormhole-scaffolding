module hello_token::owner {
    use sui::dynamic_field::{Self};
    use sui::object::{Self, UID};
    use sui::transfer::{Self};
    use sui::tx_context::{Self, TxContext};
    use wormhole::emitter::{EmitterCapability as EmitterCap};

    use hello_token::bytes32::{Self};
    use hello_token::state::{Self, State};

    // Errors.
    const E_STATE_ALREADY_CREATED: u64 = 0;

    /// The one of a kind - created in the module initializer.
    struct OwnerCap has key {
        id: UID
    }

    /// This function is only called once on module publish.
    /// Use it to make sure something has happened only once, like
    /// here - only module author will own a version of a
    /// `OwnerCap` struct.
    fun init(ctx: &mut TxContext) {
        // Transfer owner capability to caller.
        let owner_cap = OwnerCap {
            id: object::new(ctx),
        };

        // Use this in `create_state` to determine if state is created already.
        // This step is unnecessary because the `EmitterCap` passed into
        // `create_state` deletes the object at that UID. But we will keep this
        // here for now in case something changes with Wormhole's EmitterCap.
        dynamic_field::add(&mut owner_cap.id, b"state_created", false);

        // Transfer `OwnerCap` to the contract publisher.
        transfer::transfer(owner_cap, tx_context::sender(ctx));
    }

    /// Only owner. This creates a new state object that also acts as dynamic
    /// storage.
    public entry fun create_state(
        owner_cap: &mut OwnerCap,
        emitter_cap: EmitterCap,
        relayer_fee: u64,
        relayer_fee_precision: u64,
        ctx: &mut TxContext
    ) {
        assert!(
            !*dynamic_field::borrow(&owner_cap.id, b"state_created"),
            E_STATE_ALREADY_CREATED
        );

        // State will be created once function finishes.
        *dynamic_field::borrow_mut(&mut owner_cap.id, b"state_created") = true;

        // Create and share state.
        transfer::share_object(
            state::new(emitter_cap, relayer_fee, relayer_fee_precision, ctx)
        )
    }

    /// Only owner. This method registers a foreign contract address.
    public entry fun register_foreign_contract(
        _: &OwnerCap,
        t_state: &mut State,
        chain: u16,
        contract_address: vector<u8>,
    ) {
        state::register_foreign_contract(
            t_state,
            chain,
            bytes32::new(contract_address)
        );
    }

    /// Only owner. This method updates the relayer fee for this chain.
    public entry fun update_relayer_fee(
        _: &OwnerCap,
        t_state: &mut State,
        relayer_fee: u64,
        relayer_fee_precision: u64
    ) {
        state::update_relayer_fee(t_state, relayer_fee, relayer_fee_precision)
    }

    #[test_only]
    /// We need this function to simulate calling `init` in our test.
    public fun init_test_only(ctx: &mut TxContext) {
        init(ctx)
    }
}

#[test_only]
module hello_token::init_tests {
    use std::vector::{Self};
    use sui::object::{Self};
    use sui::test_scenario::{Self, Scenario, TransactionEffects};

    use hello_token::bytes32::{Self};
    use hello_token::state::{State};
    use hello_token::owner::{Self, OwnerCap};
    use wormhole::emitter::{EmitterCapability as EmitterCap};
    use wormhole::state::{
        DeployerCapability as WormholeDeployerCap,
        State as WormholeState
    };

    const TEST_RELAYER_FEE: u64 = 42069; // 4.2069%
    const TEST_RELAYER_FEE_PRECISION: u64 = 1000000;

    #[test]
    public fun init() {
        let my_scenario = test_scenario::begin(@0x0);
        let scenario = &mut my_scenario;
        let (creator, _) = people();

        // Get things going.
        test_scenario::next_tx(scenario, creator);

        // We call `init_test_only` to simulate `init`
        {
            owner::init_test_only(test_scenario::ctx(scenario));

            // Check existence of creator and state capabilities.
            let effects = test_scenario::next_tx(scenario, creator);

            let created_ids = test_scenario::created(&effects);
            assert!(vector::length(&created_ids) == 1, 0);

            // Verify that the created ID matches the OwnerCap's ID.
            let owner_cap_id = vector::borrow(&created_ids, 0);
            let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);
            assert!(*owner_cap_id == object::id(&owner_cap), 0);
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
        let state = test_scenario::take_shared<State>(scenario);
        assert!(*state_id == object::id(&state), 0);
        test_scenario::return_shared<State>(state);

        // We expect two objects to be deleted:
        // 1. state_cap
        // 2. emitter_cap
        let deleted_ids = test_scenario::deleted(&effects);
        assert!(vector::length(&deleted_ids) == 1, 0);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun register_foreign_contract() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create mock chain ID and address pair
        let target_chain: u16 = 69;
        let target_contract =
            x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe";

        // Fetch the HelloToken state object and owner capability
        let state = test_scenario::take_shared<State>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Verify that the contract isn't already registered
        {
            let is_registered =
                hello_token::state::contract_registered(
                    &state,
                    target_chain
                );
            assert!(!is_registered, 0);
        };

        // Register the emitter
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            target_contract,
        );

        // Verify that the contract was registered correctly
        {
            let is_registered =
                hello_token::state::contract_registered(&state, target_chain);
            assert!(is_registered, 0);

            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    target_chain
                );
            assert!(bytes32::data(registered_contract) == target_contract, 0);
        };

        // Bye bye.
        test_scenario::return_shared<State>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun replace_foreign_contract() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create mock chain ID and address pair
        let target_chain: u16 = 69;
        let target_contract =
            x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe";
        let target_contract2 =
            x"0000000000000000000000000000000000000000000000000000000000000069";

        // Fetch the HelloToken state object and owner capability
        let state = test_scenario::take_shared<State>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Register the emitter
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            target_contract,
        );

        // Verify that the contract was registered correctly
        {
            let is_registered =
                hello_token::state::contract_registered(&state, target_chain);
            assert!(is_registered, 0);

            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    target_chain
                );
            assert!(bytes32::data(registered_contract) == target_contract, 0);
        };

        // Proceed.
        test_scenario::next_tx(scenario, creator);

        // Register an emitter with the same chain ID
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            target_contract2,
        );

        // Verify that the contract was registered correctly
        {
            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    target_chain
                );
            assert!(bytes32::data(registered_contract) == target_contract2, 0);
        };

        // Bye bye.
        test_scenario::return_shared<State>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = hello_token::foreign_contracts::E_INVALID_CHAIN)]
    public fun register_foreign_contract_chain_zero() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create mock chain ID and address pair
        let target_chain: u16 = 0;
        let target_contract =
            x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe";

        // Fetch the HelloToken state object and owner capability
        let state = test_scenario::take_shared<State>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Register the emitter
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            target_contract,
        );

        // Bye bye.
        test_scenario::return_shared<State>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = hello_token::foreign_contracts::E_INVALID_CONTRACT_ADDRESS)]
    public fun register_foreign_contract_zero_address() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create mock chain ID and address pair
        let target_chain: u16 = 69;
        let target_contract =
            x"0000000000000000000000000000000000000000000000000000000000000000";

        // Fetch the HelloToken state object and owner capability
        let state = test_scenario::take_shared<State>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Register the emitter
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            target_contract,
        );

        // Bye bye.
        test_scenario::return_shared<State>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun update_relayer_fee() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Set the test fee and fee precision variables
        let test_fee: u64 = 500000; // 5%
        let test_precision: u64 = 10000000;
        assert!(
            test_precision != TEST_RELAYER_FEE_PRECISION &&
            test_fee != TEST_RELAYER_FEE,
            0
        );

        // Fetch the HelloToken state object and owner capability
        let state = test_scenario::take_shared<State>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCap>(scenario);

        // Verify the initial state
        {
            let fee_value = hello_token::state::fee_value(&state);
            let fee_precision = hello_token::state::fee_precision(&state);
            assert!(
                fee_precision == TEST_RELAYER_FEE_PRECISION &&
                fee_value == TEST_RELAYER_FEE,
                0
            );
        };

        // Update the relayer fee
        hello_token::owner::update_relayer_fee(
            &owner_cap,
            &mut state,
            test_fee,
            test_precision
        );

        // Verify that the state was updated correctly
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
        test_scenario::return_shared<State>(state);
        test_scenario::return_to_sender<OwnerCap>(scenario, owner_cap);

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

        // TODO: Set up Token Bridge contract.

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
}
