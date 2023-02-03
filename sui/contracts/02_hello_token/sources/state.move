module hello_token::state {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{TxContext};
    use wormhole::emitter::{EmitterCapability as EmitterCap};

    use hello_token::bytes32::{Bytes32};
    use hello_token::foreign_contracts::{Self};
    use hello_token::relayer_fee::{Self, RelayerFee};

    // Only the owner should be allowed to mutate `State`.
    friend hello_token::owner;

    // Errors.
    const E_INVALID_CHAIN: u64 = 0;
    const E_INVALID_CONTRACT_ADDRESS: u64 = 1;

    struct State has key, store {
        id: UID,

        /// HelloToken owned emitter capability.
        emitter_cap: EmitterCap,

        /// Fee to pay relayer.
        relayer_fee: RelayerFee,
    }

    public(friend) fun new(
        emitter_cap: EmitterCap,
        relayer_fee: u64,
        relayer_fee_precision: u64,
        ctx: &mut TxContext
    ): State {
        let state = State {
            id: object::new(ctx),
            emitter_cap,
            relayer_fee: relayer_fee::new(relayer_fee, relayer_fee_precision),
        };

        // Make new foreign contracts map.
        foreign_contracts::new(&mut state.id, ctx);

        // Done.
        state
    }

    public(friend) fun register_foreign_contract(
        self: &mut State,
        chain: u16,
        contract_address: Bytes32,
    ) {
        if (contract_registered(self, chain)) {
            foreign_contracts::update(
                &mut self.id,
                chain,
                contract_address
            );
        } else {
            foreign_contracts::add(
                &mut self.id,
                chain,
                contract_address,
            );
        }
    }

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

    public fun compute_relayer_fee(self: &State, amount: u64): u64 {
        relayer_fee::compute(&self.relayer_fee, amount)
    }

    public fun emitter_cap(self: &State): &EmitterCap {
        &self.emitter_cap
    }

    public fun id(self: &State): &ID {
        object::borrow_id(self)
    }

    public fun contract_registered(self: &State, chain: u16): bool {
        foreign_contracts::has(&self.id, chain)
    }

    public fun foreign_contract_address(self: &State, chain: u16): &Bytes32 {
        foreign_contracts::contract_address(&self.id, chain)
    }

    public fun fee_value(self: &State): u64 {
        relayer_fee::value(&self.relayer_fee)
    }

    public fun fee_precision(self: &State): u64 {
        relayer_fee::precision(&self.relayer_fee)
    }
}
