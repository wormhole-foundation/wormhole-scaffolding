module hello_token::relayer_fee {
    friend hello_token::state;

    const E_INVALID_RELAYER_FEE: u64 = 0;

    struct RelayerFeeParameters has store {
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