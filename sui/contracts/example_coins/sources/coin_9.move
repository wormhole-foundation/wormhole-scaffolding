module example_coins::coin_9 {
    use std::option;
    use sui::coin::{Self, TreasuryCap, CoinMetadata};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// The type identifier of coin. The coin will have a type
    /// tag of kind: `Coin<package_object::coin_9::COIN_9>`
    /// Make sure that the name of the type matches the module's name.
    struct COIN_9 has drop {}

    /// Module initializer is called once on module publish. A treasury
    /// cap is sent to the publisher, who then controls minting and burning
    fun init(witness: COIN_9, ctx: &mut TxContext) {
        let (treasury, metadata) = create_coin(witness, ctx);
        transfer::freeze_object(metadata);
        transfer::transfer(treasury, tx_context::sender(ctx));
    }

    fun create_coin(
        witness: COIN_9,
        ctx: &mut TxContext
    ): (TreasuryCap<COIN_9>, CoinMetadata<COIN_9>) {
        coin::create_currency(
            witness,
            9, // decimals
            b"COIN_9", // symbol
            b"9-Decimal Coin", // name
            b"", // description
            option::none(), // icon_url
            ctx
        )
    }

    #[test_only]
    public fun create_coin_test_only(
        ctx: &mut TxContext
    ): (TreasuryCap<COIN_9>, CoinMetadata<COIN_9>) {
        create_coin(COIN_9 {}, ctx)
    }

    #[test_only]
    public fun init_test_only(ctx: &mut TxContext) {
        init(COIN_9 {}, ctx)
    }
}

#[test_only]
module example_coins::coin_9_tests {
    use sui::test_scenario::{Self};

    use example_coins::coin_9::{Self};

    #[test]
    public fun init() {
        let my_scenario = test_scenario::begin(@0x0);
        let scenario = &mut my_scenario;
        let creator = @0xDEADBEEF;

        // Proceed.
        test_scenario::next_tx(scenario, creator);

        // Init.
        coin_9::init_test_only(test_scenario::ctx(scenario));

        // Proceed.
        test_scenario::next_tx(scenario, creator);

        // Done.
        test_scenario::end(my_scenario);
    }
}
