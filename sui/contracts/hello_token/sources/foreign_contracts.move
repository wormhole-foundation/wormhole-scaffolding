/// This module manages the registration process for foreign Token Bridge
/// Relayer contracts. `chain` to `ExternalAddress` mappings are stored
/// as dynamic fields on the `State` object.
module hello_token::foreign_contracts {
    // Sui dependencies.
    use sui::table::{Self, Table};

    // Wormhole dependencies.
    use wormhole::state::{chain_id};
    use wormhole::external_address::{Self, ExternalAddress};

    // Errors.
    const E_INVALID_CHAIN: u64 = 0;
    const E_INVALID_CONTRACT_ADDRESS: u64 = 1;

    // Only state should be able to mutate the `foreign_contracts` dynamic field
    // object.
    friend hello_token::state;

    /// Adds a new `chain` to `contract_address` mapping.
    public(friend) fun add(
        foreign_contracts: &mut Table<u16, ExternalAddress>,
        chain: u16,
        contract_address: ExternalAddress,
    ) {
        assert!(chain != 0 && chain != chain_id(), E_INVALID_CHAIN);
        assert!(
            external_address::is_nonzero(&contract_address),
            E_INVALID_CONTRACT_ADDRESS
        );

        table::add(foreign_contracts, chain, contract_address);
    }

    /// Updates an existing `chain` to `contract_address` mapping. Reverts
    /// if the new `contract_address` is the zero address.
    public(friend) fun update(
        foreign_contracts: &mut Table<u16, ExternalAddress>,
        chain: u16,
        contract_address: ExternalAddress
    ) {
        assert!(
            external_address::is_nonzero(&contract_address),
            E_INVALID_CONTRACT_ADDRESS
        );

        *table::borrow_mut(
            foreign_contracts,
            chain
        ) = contract_address;
    }
}
