module hello_token::foreign_contracts {
    use sui::dynamic_object_field::{Self};
    use sui::object::{UID};
    use sui::table::{Self, Table};
    use sui::tx_context::{TxContext};

    use hello_token::bytes32::{Self, Bytes32};

    // State will be warehousing the foreign contracts dynamic table
    friend hello_token::state;

    // Errors.
    const E_INVALID_CHAIN: u64 = 0;
    const E_INVALID_CONTRACT_ADDRESS: u64 = 1;

    const KEY: vector<u8> = b"foreign_contracts";

    struct ForeignContract has store {
        /// Must be 32-bytes
        address: Bytes32,
    }

    public(friend) fun new(state_uid: &mut UID, ctx: &mut TxContext) {
        // Create registered contract table.
        let table = table::new<u16, ForeignContract>(ctx);

        dynamic_object_field::add(state_uid, KEY, table);
    }

    public(friend) fun has(state_uid: &UID, chain: u16): bool {
        table::contains<u16, ForeignContract>(borrow(state_uid), chain)
    }

    public(friend) fun contract_address(
        state_uid: &UID,
        chain: u16
    ): &Bytes32 {
        let foreign_contract =
            table::borrow<u16, ForeignContract>(
                borrow(state_uid),
                chain
            );

        &foreign_contract.address
    }

    public(friend) fun add(
        state_uid: &mut UID,
        chain: u16,
        contract_address: Bytes32,
    ) {
        assert!(chain != 0, E_INVALID_CHAIN);
        assert!(
            bytes32::is_nonzero(&contract_address),
            E_INVALID_CONTRACT_ADDRESS
        );

        let foreign_contract = ForeignContract {
            address: contract_address
        };
        table::add(borrow_mut(state_uid), chain, foreign_contract);
    }

    public(friend) fun modify(
        state_uid: &mut UID,
        chain: u16,
        contract_address: Bytes32
    ) {
        assert!(
            bytes32::is_nonzero(&contract_address),
            E_INVALID_CONTRACT_ADDRESS
        );

        let foreign_contract =
            table::borrow_mut<u16, ForeignContract>(
                borrow_mut(state_uid),
                chain
            );

        foreign_contract.address = contract_address;
    }

    // public fun id(foreign_contract: &ForeignContract): &ID {
    //     object::borrow_id(foreign_contract)
    // }
    
    fun borrow(state_uid: &UID): &Table<u16, ForeignContract> {
        dynamic_object_field::borrow(state_uid, KEY)
    }

    fun borrow_mut(
        state_uid: &mut UID
    ): &mut Table<u16, ForeignContract> {
        dynamic_object_field::borrow_mut(state_uid, KEY)
    }
}
