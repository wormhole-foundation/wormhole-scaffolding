module hello_token::foreign_contracts {
    use sui::dynamic_object_field::{Self};
    use sui::object::{Self, UID};
    use sui::object_table::{Self, ObjectTable};
    use sui::tx_context::{TxContext};
    use std::vector::{Self};

    // State will be warehousing the foreign contracts dynamic table
    friend hello_token::state;

    const E_INVALID_CHAIN: u64 = 0;
    const E_INVALID_CONTRACT_ADDRESS: u64 = 1;

    const KEY: vector<u8> = b"foreign_contracts";

    struct ForeignContract has key, store {
        id: UID,

        /// Must be 32-bytes
        address: vector<u8>,
    }

    public(friend) fun new(state_uid: &mut UID, ctx: &mut TxContext) {
        // Create registered contract table.
        let table = object_table::new<u16, ForeignContract>(ctx);

        dynamic_object_field::add(state_uid, KEY, table);
    }

    public(friend) fun has(state_uid: &UID, chain: u16): bool {
        object_table::contains(borrow(state_uid), chain)
    }

    public(friend) fun contract_address(state_uid: &UID, chain: u16): &vector<u8> {
        let foreign_contract =
            object_table::borrow<u16, ForeignContract>(borrow(state_uid), chain);
        &foreign_contract.address
    }

    public(friend) fun add(
        state_uid: &mut UID,
        chain: u16,
        contract_address: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(chain != 0, E_INVALID_CHAIN);
        assert!(is_valid(&contract_address), E_INVALID_CONTRACT_ADDRESS);

        let foreign_contract = ForeignContract {
            id: object::new(ctx),
            address: contract_address
        };
        object_table::add(borrow_mut(state_uid), chain, foreign_contract);
    }

    public(friend) fun modify(state_uid: &mut UID, chain: u16, contract_address: vector<u8>) {
        assert!(is_valid(&contract_address), E_INVALID_CONTRACT_ADDRESS);

        let foreign_contract =
            object_table::borrow_mut<u16, ForeignContract>(borrow_mut(state_uid), chain);

        foreign_contract.address = contract_address;
    }

    // public fun id(foreign_contract: &ForeignContract): &ID {
    //     object::borrow_id(foreign_contract)
    // }

    public fun is_valid(contract_address: &vector<u8>): bool {
        if (vector::length(contract_address) != 32) {
            return false
        };

        let i = 0;
        while (i < 32) {
            if (*vector::borrow(contract_address, i) > 0) {
                return true
            };
            i = i + 1;
        };

        false
    }

    fun borrow(state_uid: &UID): &ObjectTable<u16, ForeignContract> {
        dynamic_object_field::borrow(state_uid, KEY)
    }

    fun borrow_mut(state_uid: &mut UID): &mut ObjectTable<u16, ForeignContract> {
        dynamic_object_field::borrow_mut(state_uid, KEY)
    }
}
