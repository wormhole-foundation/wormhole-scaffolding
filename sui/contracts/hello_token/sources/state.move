/// This module implements the global state variables for Hello Token.
/// The `State` object is used to perform anything that requires access
/// to data that defines the Hello Token contract.
module hello_token::state {
    // Sui dependencies.
    use sui::object::{Self, UID};
    use sui::tx_context::{TxContext};
    use sui::table::{Self, Table};

    // Wormhole dependencies.
    use wormhole::emitter::{Self, EmitterCap};
    use wormhole::external_address::{ExternalAddress};
    use wormhole::state::{State as WormholeState};

    // Hello Token dependencies.
    use hello_token::foreign_contracts::{Self};
    use hello_token::relayer_fee::{Self, RelayerFee};

    // Modules that are allowed to mutate `State`.
    friend hello_token::owner;
    friend hello_token::transfer;

    // Errors.
    const E_INVALID_CHAIN: u64 = 0;
    const E_INVALID_CONTRACT_ADDRESS: u64 = 1;
    const E_CONTRACT_DOES_NOT_EXIST: u64 = 2;

    /// Object that holds this contract's state. Foreign contracts are
    /// stored as dynamic object fields of `State`.
    struct State has key, store {
        id: UID,

        /// Hello Token owned emitter capability.
        emitter_cap: EmitterCap,

        /// Stores relayer fee and precision.
        relayer_fee: RelayerFee,

        /// Foreign contract registry.
        foreign_contracts: Table<u16, ExternalAddress>,
    }

    /// Creates new `State` object. The `emitter_cap` and `relayer_fee`
    /// objects are also created. This method should only be executed from the
    /// `owner::create_state` method.
    public(friend) fun new(
        wormhole_state: &WormholeState,
        relayer_fee: u64,
        relayer_fee_precision: u64,
        ctx: &mut TxContext
    ): State {
        // Create state object.
        let state = State {
            id: object::new(ctx),
            emitter_cap: emitter::new(wormhole_state, ctx),
            relayer_fee: relayer_fee::new(relayer_fee, relayer_fee_precision),
            foreign_contracts: table::new(ctx)
        };

        // Done.
        state
    }

    /// This method registers a foreign contract address. The owner can
    /// also replace an existing foreign contract for a specified chain ID.
    public(friend) fun register_foreign_contract(
        self: &mut State,
        chain: u16,
        contract_address: ExternalAddress,
    ) {
        if (contract_registered(self, chain)) {
            foreign_contracts::update(
                &mut self.foreign_contracts,
                chain,
                contract_address
            );
        } else {
            foreign_contracts::add(
                &mut self.foreign_contracts,
                chain,
                contract_address,
            );
        }
    }

    /// Updates the relayer fee and the relayer fee precision.
    public(friend) fun update_relayer_fee(
        self: &mut State,
        relayer_fee: u64,
        relayer_fee_precision: u64
    ) {
        relayer_fee::update(
            &mut self.relayer_fee,
            relayer_fee,
            relayer_fee_precision
        );
    }

    // Getters.

    public(friend) fun emitter_cap(self: &State): &EmitterCap {
        &self.emitter_cap
    }

    public fun get_relayer_fee(self: &State, amount: u64): u64 {
        relayer_fee::compute(&self.relayer_fee, amount)
    }

    public fun contract_registered(self: &State, chain: u16): bool {
        table::contains(&self.foreign_contracts, chain)
    }

    public fun foreign_contract_address(self: &State, chain: u16): ExternalAddress {
        assert!(contract_registered(self, chain), E_CONTRACT_DOES_NOT_EXIST);
        *table::borrow(&self.foreign_contracts, chain)
    }

    public fun fee_value(self: &State): u64 {
        relayer_fee::value(&self.relayer_fee)
    }

    public fun fee_precision(self: &State): u64 {
        relayer_fee::precision(&self.relayer_fee)
    }
}
