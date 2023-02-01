module hello_token::state {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{TxContext};
    use wormhole::emitter::EmitterCapability;

    use hello_token::foreign_contracts::{Self};
    use hello_token::relayer_fee::{Self, RelayerFeeParameters};

    friend hello_token::owner;

    const E_INVALID_CHAIN: u64 = 0;
    const E_INVALID_CONTRACT_ADDRESS: u64 = 1;

    // TODO: Do we keep this as a constant? Or do we read this from wormhole?
    const CHAIN_ID_SUI: u16 = 21;

    struct State has key, store {
        id: UID,

        /// HelloToken owned emitter capability
        emitter_cap: EmitterCapability,

        /// Fee to pay relayer
        relayer_fee: RelayerFeeParameters,
    }

    public(friend) fun new(
        emitter_cap: EmitterCapability,
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
        state: &mut State,
        chain: u16,
        contract_address: vector<u8>,
        ctx: &mut TxContext
    ) {
        if (contract_registered(state, chain)) {
            foreign_contracts::modify(&mut state.id, chain, contract_address);
        } else {
            foreign_contracts::add(
                &mut state.id,
                chain,
                contract_address,
                ctx
            );
        }
    }

    public(friend) fun update_relayer_fee(
        state: &mut State,
        relayer_fee: u64,
        relayer_fee_precision: u64
    ) {
        relayer_fee::update(
            &mut state.relayer_fee,
            relayer_fee,
            relayer_fee_precision
        );
    }

    public fun compute_relayer_fee(
        state: &State,
        amount: u64,
    ): u64 {
        relayer_fee::compute(&state.relayer_fee, amount)
    }

    public fun emitter_cap(state: &State): &EmitterCapability {
        &state.emitter_cap
    }

    public fun id(state: &State): &ID {
        object::borrow_id(state)
    }

    public fun contract_registered(state: &State, chain: u16): bool {
        foreign_contracts::has(&state.id, chain)
    }

    public fun foreign_contract_address(
        state: &State,
        chain: u16
    ): &vector<u8> {
        foreign_contracts::contract_address(&state.id, chain)
    }
}
