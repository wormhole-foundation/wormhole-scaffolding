module hello_token::owner {
    use sui::object::{Self, UID};
    use sui::transfer::{Self};
    use sui::tx_context::{Self, TxContext};
    use wormhole::emitter::EmitterCapability;

    use hello_token::state::{Self, State};

    const E_INVALID_CHAIN: u64 = 0;

    /// The one of a kind - created in the module initializer.
    struct OwnerCapability has key {
        id: UID
    }

    struct StateCapability has key, store {
        id: UID
    }

    /// This function is only called once on module publish.
    /// Use it to make sure something has happened only once, like
    /// here - only module author will own a version of a
    /// `OwnerCapability` struct.
    fun init(ctx: &mut TxContext) {
        // Transfer owner capability to caller.
        transfer::transfer(OwnerCapability {
            id: object::new(ctx),
        }, tx_context::sender(ctx));

        // And transfer state capability to caller. This will be destroyed once
        // `create_state` is called (to prevent more than one state from being
        // created).
        transfer::transfer(StateCapability {
            id: object::new(ctx),
        }, tx_context::sender(ctx));
    }

    /// Only owner. This creates a new state object that also acts as dynamic
    /// storage.
    public entry fun create_state(
        _: &OwnerCapability,
        state_cap: StateCapability,
        emitter_cap: EmitterCapability,
        relayer_fee: u64,
        relayer_fee_precision: u64,
        ctx: &mut TxContext
    ) {
        // We use this capability as a mechanism to disallow the state to be
        // created more than once. This method consumes `state_cap` and
        // destroys it.
        let StateCapability{ id } = state_cap;
        object::delete(id);

        // Create and share state.
        transfer::share_object(state::new(emitter_cap, relayer_fee, relayer_fee_precision, ctx))
    }

    /// Only owner. This method registers a foreign contract address.
    public entry fun register_foreign_contract(
        _: &OwnerCapability,
        t_state: &mut State,
        chain: u16,
        contract_address: vector<u8>,
        ctx: &mut TxContext
    ) {
        state::register_foreign_contract(t_state, chain, contract_address, ctx)
    }

    /// Only owner. This method updates the relayer fee for this chain.
    public entry fun update_relayer_fee(
        _: &OwnerCapability,
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

    use wormhole::emitter::EmitterCapability;
    use hello_token::state::{Self};
    use hello_token::owner::{Self, OwnerCapability, StateCapability};

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
            assert!(vector::length(&created_ids) == 2, 0);

            // Verify that the created ID matches the OwnerCapability's ID.
            let owner_cap_id = vector::borrow(&created_ids, 0);
            let owner_cap =
                test_scenario::take_from_sender<OwnerCapability>(scenario);
            assert!(*owner_cap_id == object::id(&owner_cap), 0);
            test_scenario::return_to_sender<OwnerCapability>(scenario, owner_cap);

            // Verify that the created ID matches the StateCapability's ID.
            let state_cap_id = vector::borrow(&created_ids, 1);
            let state_cap =
                test_scenario::take_from_sender<StateCapability>(scenario);
            assert!(*state_cap_id == object::id(&state_cap), 0);
            test_scenario::return_to_sender<StateCapability>(scenario, state_cap);
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
        // 1. state::State
        let created_ids = test_scenario::created(&effects);
        assert!(vector::length(&created_ids) == 1, 0);

        // Verify that the created ID matches the State's ID.
        let state_id = vector::borrow(&created_ids, 0);
        let state = test_scenario::take_shared<state::State>(scenario);
        assert!(*state_id == object::id(&state), 0);
        test_scenario::return_shared<state::State>(state);

        // We expect two objects to be deleted:
        // 1. state_cap
        // 2. emitter_cap
        let deleted_ids = test_scenario::deleted(&effects);
        assert!(vector::length(&deleted_ids) == 2, 0);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    public fun register_new_foreign_contract() {
        let (creator, _) = people();
        let (my_scenario, _) = set_up(creator);
        let scenario = &mut my_scenario;

        // Create mock chain ID and address pair
        let target_chain: u16 = 69;
        let target_contract =
            x"000000000000000000000000beFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe";

        // Fetch the HelloToken state object and owner capability
        let state = test_scenario::take_shared<state::State>(scenario);
        let owner_cap =
                test_scenario::take_from_sender<OwnerCapability>(scenario);

        // Verify that the contract isn't already registered
        {
            let isRegistered = hello_token::state::contract_registered(
                &state,
                target_chain
            );
            assert!(!isRegistered, 0);
        };

        // Register the emitter
        hello_token::owner::register_foreign_contract(
            &owner_cap,
            &mut state,
            target_chain,
            target_contract,
            test_scenario::ctx(scenario)
        );

        // Verify that the contract was registered correctly
        {
            let isRegistered = hello_token::state::contract_registered(
                &state,
                target_chain
            );
            assert!(isRegistered, 0);

            let registered_contract =
                hello_token::state::foreign_contract_address(
                    &state,
                    target_chain
                );
            assert!(*registered_contract == target_contract, 0);
        };

        // Bye bye.
        test_scenario::return_shared<state::State>(state);
        test_scenario::return_to_sender<OwnerCapability>(scenario, owner_cap);

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
                test_scenario::take_from_sender<wormhole::state::DeployerCapability>(scenario);

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
                test_scenario::take_from_sender<OwnerCapability>(scenario);
            let state_cap =
                test_scenario::take_from_sender<StateCapability>(scenario);
            let emitter_cap =
                test_scenario::take_from_sender<EmitterCapability>(scenario);

            hello_token::owner::create_state(
                &owner_cap,
                state_cap,
                emitter_cap,
                TEST_RELAYER_FEE,
                TEST_RELAYER_FEE_PRECISION,
                test_scenario::ctx(scenario)
            );

            // Bye bye.
            test_scenario::return_to_sender<OwnerCapability>(scenario, owner_cap);
        };

        let effects = test_scenario::next_tx(scenario, creator);
        (my_scenario, effects)
    }
}
