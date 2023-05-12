#[test_only]
module hello_token::dummy_message {
    public fun encoded_transfer_coin_8(): (vector<u8>, u64) {
        // let decimals = 8;
        // let expected_amount = 69420;
        // let expected_token_address = 0xe4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c26; // COIN_8 Metadata ID
        // let expected_token_chain = 21;
        // let expected_recipient = external_address::from_address(@0xbeef);
        // let expected_recipient_chain = 21;
        // let expected_relayer_fee = 0;
        (
            x"010000000001008f14218929a3cb2b7f08aa3505bd90c31352fe33b575985d7134570995f1726d153089147061f9209d5329774915a5b3cdcbb536f85f49996d4e423f59afcaab01645bb8ac0000000000020000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585000000000000000001030000000000000000000000000000000000000000000000000000000000010f2ce4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c260015a80dc5b12f68ff8278c4eb48917aaa3572dde5420c19f8b74e0099eb13ed1a070015000000000000000000000000000000000000000000000000000000000000beef010000000000000000000000009f082e1be326e8863bac818f0c08ae28a8d47c99",
            69420 // Transfer amount.
        )
    }

    public fun encoded_transfer_coin_8_minimum_amount(): (vector<u8>, u64) {
        // let decimals = 8;
        // let expected_amount = 1;
        // let expected_token_address = 0xe4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c26; // COIN_8 Metadata ID
        // let expected_token_chain = 21;
        // let expected_recipient = external_address::from_address(@0xbeef);
        // let expected_recipient_chain = 21;
        // let expected_relayer_fee = 0;
        (
            x"01000000000100c6ee5a08b979bd7342878d7829a349ff536c31ea15b4949bf698984d1aa2c350429bcf0014ec58803cedbee2d90436d6ecbda557233049e32cd13115e72559e100645bd4930000000000020000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585000000000000000001030000000000000000000000000000000000000000000000000000000000000001e4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c260015a80dc5b12f68ff8278c4eb48917aaa3572dde5420c19f8b74e0099eb13ed1a070015000000000000000000000000000000000000000000000000000000000000beef010000000000000000000000009f082e1be326e8863bac818f0c08ae28a8d47c99",
            1 // Transfer amount.
        )
    }

    public fun encoded_transfer_coin_8_maximum_amount(): (vector<u8>, u64) {
        // let decimals = 8;
        // let expected_amount = 18446744073709551614;
        // let expected_token_address = 0xe4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c26; // COIN_8 Metadata ID
        // let expected_token_chain = 21;
        // let expected_recipient = external_address::from_address(@0xbeef);
        // let expected_recipient_chain = 21;
        // let expected_relayer_fee = 0;
        (
            x"0100000000010009e35cfac391bdf90033a3705d556762dbf25d4838d91c227d8d2e4f536ada0e7044047a095da0fc773e433f2fe0d0509dcfd8103ec2d19a09e8578746633db600645c0a710000000000020000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa58500000000000000000103000000000000000000000000000000000000000000000000fffffffffffffffee4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c260015a80dc5b12f68ff8278c4eb48917aaa3572dde5420c19f8b74e0099eb13ed1a070015000000000000000000000000000000000000000000000000000000000000beef010000000000000000000000009f082e1be326e8863bac818f0c08ae28a8d47c99",
            18446744073709551614 // Transfer amount.
        )
    }

    public fun encoded_transfer_coin_8_invalid_sender(): (vector<u8>, u64) {
        // let decimals = 8;
        // let expected_amount = 42069;
        // let expected_token_address = 0xe4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c26; // COIN_8 Metadata ID
        // let expected_token_chain = 21;
        // let expected_recipient = external_address::from_address(@0x69);
        // let expected_recipient_chain = 21;
        // let expected_relayer_fee = 0;
        (
            x"0100000000010014a6d43fb807942464d48ec02589a65f2ecb57f30bdc36b51a32a54840b8efa4582327a1be859d96628e42fee21b5edd16e0c37e073d129f1d60207312fc857f00645c14120000000000020000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa58500000000000000000103000000000000000000000000000000000000000000000000000000000000a455e4d0bcbdc026b98a242f13e2761601107c90de400f0c24cdafea526abf201c260015a80dc5b12f68ff8278c4eb48917aaa3572dde5420c19f8b74e0099eb13ed1a0700150000000000000000000000000000000000000000000000000000000000000069010000000000000000000000009f082e1be326e8863bac818f0c08ae28a8d47c99",
            42069 // Transfer amount.
        )
    }
}
