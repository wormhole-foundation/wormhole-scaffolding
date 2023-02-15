module hello_token::relayer_fee {
    // Errors.
    const E_INVALID_RELAYER_FEE: u64 = 0;

    struct RelayerFee has store, drop {
        value: u64,
        precision: u64,
    }

    public fun new(
        fee: u64,
        precision: u64
    ): RelayerFee {
        assert!(is_valid(fee, precision), E_INVALID_RELAYER_FEE);
        RelayerFee {
            value: fee,
            precision,
        }
    }

    public fun update(
        self: &mut RelayerFee,
        fee: u64,
        precision: u64
    ) {
        assert!(is_valid(fee, precision), E_INVALID_RELAYER_FEE);
        self.value = fee;
        self.precision = precision;
    }

    public fun value(self: &RelayerFee): u64 {
        self.value
    }

    public fun precision(self: &RelayerFee): u64 {
        self.precision
    }

    public fun compute(
        self: &RelayerFee,
        amount: u64
    ): u64 {
        let numerator = ((amount as u128) * (self.value as u128));
        ((numerator / (self.precision as u128)) as u64)
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
