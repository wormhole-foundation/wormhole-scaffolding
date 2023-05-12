/// This module manages the registration process for foreign Token Bridge
/// Relayer contracts. `chain` to `ExternalAddress` mappings are stored
/// as dynamic object fields on the `State` object.
module hello_token::foreign_contracts {
    // Sui dependencies.
    use sui::dynamic_object_field::{Self};
    use sui::object::{UID};
    use sui::table::{Self, Table};
    use sui::tx_context::{TxContext};

    // Wormhole dependencies.
    use wormhole::state::{chain_id};
    use wormhole::external_address::{Self, ExternalAddress};

    /// Errors.
    const E_INVALID_CHAIN: u64 = 0;
    const E_INVALID_CONTRACT_ADDRESS: u64 = 1;
    const E_CONTRACT_DOES_NOT_EXIST: u64 = 2;

    // Only state should be able to mutate the `foreign_contracts` dynamic field
    // object.
    friend hello_token::state;

    /// Dynamic object field key.
    const KEY: vector<u8> = b"foreign_contracts";

    /// Creates new dynamic object field using the `State` ID as the parent.
    /// The dynamic object field hosts a `chain` to `contract_address` mapping.
    public(friend) fun new(parent_uid: &mut UID, ctx: &mut TxContext) {
        dynamic_object_field::add(
            parent_uid,
            KEY,
            table::new<u16, ExternalAddress>(ctx)
        );
    }

    /// Adds a new `chain` to `contract_address` mapping.
    public(friend) fun add(
        parent_uid: &mut UID,
        chain: u16,
        contract_address: ExternalAddress,
    ) {
        assert!(chain != 0 && chain != chain_id(), E_INVALID_CHAIN);
        assert!(
            external_address::is_nonzero(&contract_address),
            E_INVALID_CONTRACT_ADDRESS
        );

        table::add(borrow_table_mut(parent_uid), chain, contract_address);
    }

    /// Updates an existing `chain` to `contract_address` mapping. Reverts
    /// if the new `contract_address` is the zero address.
    public(friend) fun update(
        parent_uid: &mut UID,
        chain: u16,
        contract_address: ExternalAddress
    ) {
        assert!(
            external_address::is_nonzero(&contract_address),
            E_INVALID_CONTRACT_ADDRESS
        );

        *table::borrow_mut(
            borrow_table_mut(parent_uid),
            chain
        ) = contract_address;
    }

    // Getters.

    /// Checks if a `chain` to `contract_address` mapping exists.
    public fun has(parent_uid: &UID, chain: u16): bool {
        table::contains<u16, ExternalAddress>(borrow_table(parent_uid), chain)
    }

    /// Returns an address associated with a registered chain ID.
    public fun contract_address(parent_uid: &UID, chain: u16): &ExternalAddress {
        assert!(has(parent_uid, chain), E_CONTRACT_DOES_NOT_EXIST);
        table::borrow(borrow_table(parent_uid), chain)
    }

    // Internal methods.

    fun borrow_table(parent_uid: &UID): &Table<u16, ExternalAddress> {
        dynamic_object_field::borrow(parent_uid, KEY)
    }

    fun borrow_table_mut(parent_uid: &mut UID): &mut Table<u16, ExternalAddress> {
        dynamic_object_field::borrow_mut(parent_uid, KEY)
    }
}
