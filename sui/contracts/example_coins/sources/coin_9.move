module example_coins::coin_9 {
    use std::option;
    use sui::coin;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// The type identifier of coin. The coin will have a type
    /// tag of kind: `Coin<package_object::coin_9::COIN_9>`
    /// Make sure that the name of the type matches the module's name.
    struct COIN_9 has drop {}

    /// Module initializer is called once on module publish. A treasury
    /// cap is sent to the publisher, who then controls minting and burning
    fun init(witness: COIN_9, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9, // decimals
            b"COIN_9", // symbol
            b"9-Decimal Coin", // name
            b"", // description
            option::none(), // icon_url
            ctx
        );
        transfer::freeze_object(metadata);
        transfer::transfer(treasury, tx_context::sender(ctx))
    }
}
