module hello_token::utils {
    use std::vector::{Self};

    public fun is_nonzero_address(contract_address: &vector<u8>): bool {
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
}
