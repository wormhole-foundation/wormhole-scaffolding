module hello_token::utils {
    use std::vector::{Self};

    public fun is_nonzero_bytes32(buf: &vector<u8>): bool {
        if (vector::length(buf) != 32) {
            return false
        };

        let i = 0;
        while (i < 32) {
            if (*vector::borrow(buf, i) > 0) {
                return true
            };
            i = i + 1;
        };

        false
    }
}
