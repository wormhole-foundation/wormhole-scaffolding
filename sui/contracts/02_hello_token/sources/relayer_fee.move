module hello_token::relayer_fee {
    // `RelayerFeeParameters` is an element of `State`
    friend hello_token::state;

    #[test_only]
    friend hello_token::relayer_fee_tests;

    // Errors.
    const E_INVALID_RELAYER_FEE: u64 = 0;

    struct RelayerFeeParameters has store, drop {
        fee: u64,
        precision: u64,
    }

    public(friend) fun new(
        fee: u64,
        precision: u64
    ): RelayerFeeParameters {
        assert!(is_valid(fee, precision), E_INVALID_RELAYER_FEE);
        RelayerFeeParameters {
            fee,
            precision,
        }
    }

    public(friend) fun update(
        params: &mut RelayerFeeParameters,
        fee: u64,
        precision: u64
    ) {
        assert!(is_valid(fee, precision), E_INVALID_RELAYER_FEE);
        params.fee = fee;
        params.precision = precision;
    }

    public fun value(params: &RelayerFeeParameters): u64 {
        params.fee
    }

    public fun precision(params: &RelayerFeeParameters): u64 {
        params.precision
    }

    public fun compute(
        params: &RelayerFeeParameters,
        amount: u64
    ): u64 {
        (amount * params.fee) / params.precision
    }

    fun is_valid(fee: u64, precision: u64): bool {
        precision > 0 && fee < precision
    }
}

#[test_only]
module hello_token::relayer_fee_tests {
    use hello_token::relayer_fee;

    #[test]
    public fun new() {
        let fee = 42069;
        let precision = 100000;
        let params = relayer_fee::new(fee, precision);

        assert!(relayer_fee::value(&params) == fee, 0);
        assert!(relayer_fee::precision(&params) == precision, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=relayer_fee)]
    public fun cannot_new_precision_zero() {
        relayer_fee::new(0, 0);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=relayer_fee)]
    public fun cannot_new_precision_gte_fee() {
        relayer_fee::new(1, 1);
    }

    #[test]
    public fun compute() {
        let params = relayer_fee::new(42069, 100000);
        assert!(relayer_fee::compute(&params, 0) == 0, 0);
        assert!(relayer_fee::compute(&params, 1) == 0, 0);
        assert!(relayer_fee::compute(&params, 16) == 6, 0);
        assert!(relayer_fee::compute(&params, 165) == 69, 0);
        assert!(relayer_fee::compute(&params, 1650) == 694, 0);
        assert!(relayer_fee::compute(&params, 16502) == 6942, 0);
        assert!(relayer_fee::compute(&params, 165015) == 69420, 0);
        assert!(relayer_fee::compute(&params, 1650147) == 694200, 0);
    }
}
