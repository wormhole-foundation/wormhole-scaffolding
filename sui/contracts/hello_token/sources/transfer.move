/// This contract uses Wormhole's Token Bridge contract to send tokens
/// cross chain with an aribtrary message payload.
module hello_token::transfer {
    // Sui dependencies.
    use sui::coin::{Self, Coin};
    use sui::pay::{Self};
    use sui::transfer::{Self};
    use sui::tx_context::{Self, TxContext};

    // Token Bridge dependencies.
    use token_bridge::normalized_amount::{from_raw, to_raw};
    use token_bridge::token_registry::{Self, VerifiedAsset};
    use token_bridge::coin_utils::{Self};
    use token_bridge::transfer_with_payload::{Self};
    use token_bridge::transfer_tokens_with_payload::{
        prepare_transfer,
        TransferTicket
    };
    use token_bridge::complete_transfer_with_payload::{
        Self as bridge,
        RedeemerReceipt
    };

    // Wormhole dependencies.
    use wormhole::external_address::{Self};

    // Hello Token dependencies.
    use hello_token::message::{Self};
    use hello_token::state::{Self, State};

    // Errors.
    const E_INVALID_TARGET_RECIPIENT: u64 = 0;
    const E_UNREGISTERED_FOREIGN_CONTRACT: u64 = 1;
    const E_INSUFFICIENT_AMOUNT: u64 = 2;

    /// Transfers specified coins to any registered Hello Token contract by
    /// invoking the `prepare_transfer` method on the Wormhole
    /// Token Bridge contract. `prepare_transfer` allows the caller
    /// to send an arbitrary message payload along with a token transfer. In
    /// this case, the arbitrary message includes the transfer recipient's
    /// target-chain wallet address.
    ///
    /// NOTE: Additional steps are required to fully execute
    /// the transfer. The Token Bridge `transfer_tokens_with_payload`
    /// method must be called from a transaction block using the
    /// `TransferTicket` returned by `send_tokens_with_payload`.
    public fun send_tokens_with_payload<C>(
        t_state: &State,
        coins: Coin<C>,
        asset_info: VerifiedAsset<C>,
        target_chain: u16,
        target_recipient: address,
        nonce: u32,
        ctx: & TxContext
    ): TransferTicket<C> {
        // Convert `target_recipient` to an `ExternalAddress` and
        // confirm that it's not the zero address.
        let target_recipient_address = external_address::from_address(
            target_recipient
        );
        assert!(
            external_address::is_nonzero(&target_recipient_address),
            E_INVALID_TARGET_RECIPIENT
        );

        // Confirm that the target chain has a registered contract.
        assert!(
            state::contract_registered(t_state, target_chain),
            E_UNREGISTERED_FOREIGN_CONTRACT
        );

        // Fetch the token decimals from the token registry, and cache the token
        // amount.
        let decimals = token_registry::coin_decimals<C>(&asset_info);
        let amount_received = coin::value(&coins);

        // Compute the normalized amount to verify that it's nonzero.
        // The Token Bridge peforms the same operation before encoding
        // the amount in the `TransferWithPayload` message.
        assert!(
            to_raw(from_raw(amount_received, decimals), decimals) > 0,
            E_INSUFFICIENT_AMOUNT
        );

        // Prepare the transfer on the Token Bridge.
        let (prepared_transfer, dust) = prepare_transfer<C>(
            state::emitter_cap(t_state),
            asset_info,
            coins,
            target_chain,
            external_address::to_bytes(
                state::foreign_contract_address(
                    t_state,
                    target_chain
                )
            ),
            message::serialize(
                message::new(
                    target_recipient_address
                    )
                ),
            nonce
        );

        // Return to sender.
        coin_utils::return_nonzero(dust, ctx);

        (prepared_transfer)
    }

    /// `redeem_transfer_with_payload` calls Wormhole's Token Bridge Contract
    /// to redeem coins transferred from a different blockchain. If the caller
    /// is not the recipient, the contract will pay the caller a fee for
    /// relaying the transaction.
    ///
    /// NOTE: To successfully redeem the tokens from the Token Bridge,
    /// additional actions must be executed in a transaction block. See
    /// the integration tests in `sui/ts/tests/02_hello_token.ts` to see
    /// an example.
    public fun redeem_transfer_with_payload<C>(
        t_state: &State,
        receipt: RedeemerReceipt<C>,
        ctx: &mut TxContext
     ) {
        // Complete the transfer on the Token Bridge. This call returns the
        // coin object for the amount transferred via the Token Bridge. It
        // also returns the chain ID of the message sender.
        let (coins, transfer_payload, emitter_chain_id) =
            bridge::redeem_coin<C>(
                state::emitter_cap(t_state),
                receipt
            );

        // Check that the emitter is a registered contract.
        assert!(
            state::foreign_contract_address(
                t_state,
                emitter_chain_id
            ) == transfer_with_payload::sender(&transfer_payload),
            E_UNREGISTERED_FOREIGN_CONTRACT
        );

        // Parse the additional payload.
        let msg = message::deserialize(
            transfer_with_payload::payload(&transfer_payload)
        );

        // Parse the recipient field.
        let recipient = external_address::to_address(
            message::recipient(&msg)
        );

        // Calculate the relayer fee.
        let relayer_fee = state::get_relayer_fee(
            t_state,
            coin::value(&coins)
        );

        // If the relayer fee is nonzero and the user is not self redeeming,
        // split the coins object and transfer the relayer fee to the signer.
        if (relayer_fee > 0 && recipient != tx_context::sender(ctx)) {
            pay::split(&mut coins, relayer_fee, ctx);
        };

        // Send the coins to the target recipient.
        transfer::public_transfer(coins, recipient);
    }
}

#[test_only]
module hello_token::transfer_tests {
    // Standard lib.
    use std::vector;

    // Sui dependencies.
    use sui::sui::SUI;
    use sui::test_scenario::{Self, Scenario, TransactionEffects};
    use sui::coin::{Self, Coin, CoinMetadata};
    use sui::object::{Self};
    use sui::transfer::{Self as native_transfer};
    use sui::tx_context::{TxContext};

    // Hello Token dependencies.
    use hello_token::owner::{Self, OwnerCap};
    use hello_token::transfer::{Self};
    use hello_token::state::{State};
    use hello_token::owner_tests::{set_up, people};
    use hello_token::dummy_message::{Self};

    // Wormhole dependencies.
    use wormhole::state::{State as WormholeState};
    use wormhole::publish_message::{Self};
    use wormhole::wormhole_scenario::{parse_and_verify_vaa};

    // Token Bridge dependencies.
    use token_bridge::state::{
        Self as bridge_state,
        State as TokenBridgeState
    };
    use token_bridge::attest_token::{Self};
    use token_bridge::complete_transfer_with_payload::{authorize_transfer};
    use token_bridge::transfer_tokens_with_payload::{
        transfer_tokens_with_payload
    };
    use token_bridge::token_bridge_scenario::{Self};
    use token_bridge::vaa::{Self};

    // Example coins.
    use example_coins::coin_8::{Self, COIN_8};
    use example_coins::coin_10::{Self, COIN_10};

    // Updating these constants will alter the results of the tests.
    const TEST_FOREIGN_CHAIN: u16 = 2;
    const TEST_FOREIGN_CONTRACT: address = @0xbeef;

    #[test]
    /// This test transfers tokens with an additional payload using example coin 8
    /// (which has 8 decimals).
    public fun send_tokens_with_payload_coin_8() {
        let (sender, _) = people();
        let (my_scenario, _) = set_up(sender);
        let scenario = &mut my_scenario;

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Test variables.
        let test_amount = 42069000;
        let nonce = 0;
        let target_chain = 2;
        let recipient = @0xbeFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;

        // Mint token 8, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_8(
            test_amount,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, sender);

        // Run the test setup.
        transfer_setup(
            &mut hello_token_state,
            &mut bridge_state,
            test_metadata,
            sender,
            scenario
        );
        test_scenario::next_tx(scenario, sender);

        // Fetch the asset info.
        let asset_info =
            bridge_state::verified_asset<COIN_8>(&bridge_state);

        // Send a test transfer.
        let prepared_transfer = transfer::send_tokens_with_payload(
            &hello_token_state,
            test_coin,
            asset_info,
            target_chain,
            recipient,
            nonce,
            test_scenario::ctx(scenario)
        );

        // Call `transfer_tokens_with_payload`.
        let prepared_message = transfer_tokens_with_payload(
            &mut bridge_state,
            prepared_transfer
        );

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);
        test_scenario::return_shared(wormhole_state);
        publish_message::destroy(prepared_message);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    /// This test transfers tokens with an additional payload using example coin 10
    /// (which has 10 decimals). Since this coin has 10 decimals, the Token Bridge
    /// will truncate the transfer amount. This test confirms that the Hello Token
    /// contract correctly sends the dust back to the caller.
    public fun send_tokens_with_payload_coin_10() {
        let (sender, _) = people();
        let (my_scenario, _) = set_up(sender);
        let scenario = &mut my_scenario;

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Test variables.
        let test_amount = 69042000069;
        let expected_token_dust = 69;
        let nonce = 0;
        let target_chain = 2;
        let recipient = @0xbeFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;

        // Mint token 10, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_10(
            test_amount,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, sender);

        // Store test coin ID for later use.
        let test_coin_id = object::id(&test_coin);

        // Run the test setup.
        transfer_setup(
            &mut hello_token_state,
            &mut bridge_state,
            test_metadata,
            sender,
            scenario
        );
        test_scenario::next_tx(scenario, sender);

        // Fetch the asset info.
        let asset_info =
            bridge_state::verified_asset<COIN_10>(&bridge_state);

        // Send a test transfer.
        let prepared_transfer = transfer::send_tokens_with_payload(
            &hello_token_state,
            test_coin,
            asset_info,
            target_chain,
            recipient,
            nonce,
            test_scenario::ctx(scenario)
        );

        // Call `transfer_tokens_with_payload`.
        let prepared_message = transfer_tokens_with_payload(
            &mut bridge_state,
            prepared_transfer
        );

        // Proceed.
        test_scenario::next_tx(scenario, sender);

        // Fetch the dust coin object.
        let dust_object =
            test_scenario::take_from_sender_by_id<Coin<COIN_10>>(
                scenario,
                test_coin_id
            );

        // Confirm that the value of the token is non-zero.
        assert!(coin::value(&dust_object) == expected_token_dust, 0);

        // Bye bye.
        test_scenario::return_to_sender(scenario, dust_object);

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);
        test_scenario::return_shared(wormhole_state);
        publish_message::destroy(prepared_message);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = 2, location=transfer)]
    /// This test confirms that the Hello Token contract will revert if the
    /// amount is not large enough to transfer through the Token Bridge. The
    /// `test_amount` variable is intentially set to an amount which will be
    /// converted to zero when the Token Bridge truncates the amount.
    public fun cannot_send_tokens_with_payload_coin_10_insufficient_amount() {
        let (sender, _) = people();
        let (my_scenario, _) = set_up(sender);
        let scenario = &mut my_scenario;

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Test variables.
        let test_amount = 19; // Amount that will be truncated to zero.
        let nonce = 0;
        let target_chain = 2;
        let recipient = @0xbeFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;

        // Mint token 10, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_10(
            test_amount,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, sender);

        // Run the test setup.
        transfer_setup(
            &mut hello_token_state,
            &mut bridge_state,
            test_metadata,
            sender,
            scenario
        );
        test_scenario::next_tx(scenario, sender);

        // Fetch the asset info.
        let asset_info =
            bridge_state::verified_asset<COIN_10>(&bridge_state);

        // Send a test transfer.
        let prepared_transfer = transfer::send_tokens_with_payload(
            &hello_token_state,
            test_coin,
            asset_info,
            target_chain,
            recipient,
            nonce,
            test_scenario::ctx(scenario)
        );

        // Call `transfer_tokens_with_payload`.
        let prepared_message = transfer_tokens_with_payload(
            &mut bridge_state,
            prepared_transfer
        );

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);
        test_scenario::return_shared(wormhole_state);
        publish_message::destroy(prepared_message);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location=transfer)]
    /// This test confirms that the Hello Token contract will revert
    /// if the specified target chain is not registered.
    public fun cannot_send_tokens_with_payload_contract_not_registered() {
        let (sender, _) = people();
        let (my_scenario, _) = set_up(sender);
        let scenario = &mut my_scenario;

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Test variables.
        let test_amount = 69042000069;
        let nonce = 0;

        // NOTE: Only chain 2 is registered in `transfer_setup`. We set
        // the `target_chain` to 20 on purpose to force an error.
        let target_chain = 20;
        let recipient = @0xbeFA429d57cD18b7F8A4d91A2da9AB4AF05d0FBe;

        // Mint token 10, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_10(
            test_amount,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, sender);

        // Run the test setup.
        transfer_setup(
            &mut hello_token_state,
            &mut bridge_state,
            test_metadata,
            sender,
            scenario
        );
        test_scenario::next_tx(scenario, sender);

        // Fetch the asset info.
        let asset_info =
            bridge_state::verified_asset<COIN_10>(&bridge_state);

        // Send a test transfer.
        let prepared_transfer = transfer::send_tokens_with_payload(
            &hello_token_state,
            test_coin,
            asset_info,
            target_chain,
            recipient,
            nonce,
            test_scenario::ctx(scenario)
        );

        // Call `transfer_tokens_with_payload`.
        let prepared_message = transfer_tokens_with_payload(
            &mut bridge_state,
            prepared_transfer
        );

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);
        test_scenario::return_shared(wormhole_state);
        publish_message::destroy(prepared_message);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = 0, location=transfer)]
    /// This test confirms that the Hello Token contract will revert
    /// if the specified `recipient` is the zero address.
    public fun cannot_send_tokens_with_payload_invalid_recipient() {
        let (sender, _) = people();
        let (my_scenario, _) = set_up(sender);
        let scenario = &mut my_scenario;

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);
        let wormhole_state =
            test_scenario::take_shared<WormholeState>(scenario);

        // Test variables.
        let test_amount = 69042000069;
        let nonce = 0;
        let target_chain = 2;

        // NOTE: We set the recipient address to the zero address
        // on purpose to force an error.
        let recipient = @0x0;

        // Mint token 10, fetch the metadata and store the object ID for later.
        let (test_coin, test_metadata) = mint_coin_10(
            test_amount,
            test_scenario::ctx(scenario)
        );
        test_scenario::next_tx(scenario, sender);

        // Run the test setup.
        transfer_setup(
            &mut hello_token_state,
            &mut bridge_state,
            test_metadata,
            sender,
            scenario
        );
        test_scenario::next_tx(scenario, sender);

        // Fetch the asset info.
        let asset_info =
            bridge_state::verified_asset<COIN_10>(&bridge_state);

        // Send a test transfer.
        let prepared_transfer = transfer::send_tokens_with_payload(
            &hello_token_state,
            test_coin,
            asset_info,
            target_chain,
            recipient,
            nonce,
            test_scenario::ctx(scenario)
        );

        // Call `transfer_tokens_with_payload`.
        let prepared_message = transfer_tokens_with_payload(
            &mut bridge_state,
            prepared_transfer
        );

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);
        test_scenario::return_shared(wormhole_state);
        publish_message::destroy(prepared_message);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    /// This test confirms that the Hello Token contract correctly
    /// redeems token transfers and does not pay a relayer fee
    /// since the redeeming wallet is the encoded recipient.
    public fun redeem_transfer_with_payload_self_redemption() {
        let (recipient, _) = people();
        let (my_scenario, _) = set_up(recipient);
        let scenario = &mut my_scenario;

        // Fetch VAA and transfer amount.
        let (signed_transfer_message, test_amount) =
            dummy_message::encoded_transfer_coin_8();

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);

        // Perform test setup.
        {
            // Fetch the coin metadata.
            let (test_coin, test_metadata) = mint_coin_8(
                test_amount,
                test_scenario::ctx(scenario)
            );
            test_scenario::next_tx(scenario, recipient);

            // Run the test setup.
            transfer_setup(
                &mut hello_token_state,
                &mut bridge_state,
                test_metadata,
                recipient,
                scenario
            );
            test_scenario::next_tx(scenario, recipient);

            // Deposit tokens into the bridge, so we can use the Hello Token
            // contract to complete the transfer.
            token_bridge_scenario::deposit_native<COIN_8>(
                &mut bridge_state,
                test_amount
            );
            test_scenario::next_tx(scenario, recipient);

            // Transfer the coin to the zero address since it's not used.
            native_transfer::public_transfer(test_coin, @0x0);
        };

        // Verify the VAA.
        let verified_vaa = parse_and_verify_vaa(
            scenario,
            signed_transfer_message
        );
        let parsed = vaa::verify_only_once(&mut bridge_state, verified_vaa);

        // Ignore effects.
        test_scenario::next_tx(scenario, recipient);

        // Execute authorize_transfer.
        let receipt =
            authorize_transfer<COIN_8>(
                &mut bridge_state,
                parsed,
                test_scenario::ctx(scenario)
            );

        // Redeem the transfer on the Hello Token contract.
        transfer::redeem_transfer_with_payload<COIN_8>(
            &hello_token_state,
            receipt,
            test_scenario::ctx(scenario)
        );

        // Proceed.
        let effects = test_scenario::next_tx(scenario, recipient);

        // Verify results.
        {
            // Store created object IDs.
            let created_ids = test_scenario::created(&effects);
            assert!(vector::length(&created_ids) == 1, 0);

            let token_object =
                test_scenario::take_from_sender<Coin<COIN_8>>(scenario);

            // Validate the object's value.
            assert!(coin::value(&token_object) == test_amount, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, token_object);
        };

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    /// This test confirms that the Hello Token contract correctly
    /// redeems token transfers and pays a relayer fee to the caller
    /// for redeeming the transaction.
    public fun redeem_transfer_with_payload_with_relayer() {
        let (recipient, relayer) = people();
        let (my_scenario, _) = set_up(recipient);
        let scenario = &mut my_scenario;

        // Fetch VAA, transfer amount and expected relayer payout.
        let (signed_transfer_message, test_amount) =
            dummy_message::encoded_transfer_coin_8();
        let expected_relayer_fee = 2920; // 4.2069% * test_amount

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);

        // Perform test setup.
        {
            // Fetch the coin metadata.
            let (test_coin, test_metadata) = mint_coin_8(
                test_amount,
                test_scenario::ctx(scenario)
            );

            // Change context to the recipient for test setup.
            test_scenario::next_tx(scenario, recipient);

            // Run the test setup.
            transfer_setup(
                &mut hello_token_state,
                &mut bridge_state,
                test_metadata,
                recipient,
                scenario
            );

            // Change context to the relayer.
            test_scenario::next_tx(scenario, relayer);

            // Deposit tokens into the bridge, so we can use the Hello Token
            // contract to complete the transfer.
            token_bridge_scenario::deposit_native<COIN_8>(
                &mut bridge_state,
                test_amount
            );
            test_scenario::next_tx(scenario, relayer);

            // Transfer the coin to the zero address since it's not used.
            native_transfer::public_transfer(test_coin, @0x0);
        };

        // Verify the VAA.
        let verified_vaa = parse_and_verify_vaa(
            scenario,
            signed_transfer_message
        );
        let parsed = vaa::verify_only_once(&mut bridge_state, verified_vaa);

        // Ignore effects.
        test_scenario::next_tx(scenario, relayer);

        // Execute authorize_transfer.
        let receipt =
            authorize_transfer<COIN_8>(
                &mut bridge_state,
                parsed,
                test_scenario::ctx(scenario)
            );

        // Redeem the transfer on the Hello Token contract.
        transfer::redeem_transfer_with_payload<COIN_8>(
            &hello_token_state,
            receipt,
            test_scenario::ctx(scenario)
        );

        // Proceed.
        let effects = test_scenario::next_tx(scenario, relayer);

        // Verify results.
        {
            // Store created object IDs.
            let created_ids = test_scenario::created(&effects);
            assert!(vector::length(&created_ids) == 2, 0);

            // Fetch the relayer fee object by id.
            let relayer_fee_obj =
                test_scenario::take_from_sender_by_id<Coin<COIN_8>>(
                    scenario,
                    *vector::borrow(&created_ids, 0)
                );

            // Validate the relayer fee object's value.
            assert!(coin::value(&relayer_fee_obj) == expected_relayer_fee, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, relayer_fee_obj);

            // Proceed with the test and change context to recipient.
            test_scenario::next_tx(scenario, recipient);

            // Fetch the transferred object by id.
            let transferred_coin_obj =
                test_scenario::take_from_sender_by_id<Coin<COIN_8>>(
                    scenario,
                    *vector::borrow(&created_ids, 1)
                );

            // Validate the relayer fee object's value.
            let expected_amount = test_amount - expected_relayer_fee;
            assert!(coin::value(&transferred_coin_obj) == expected_amount, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, transferred_coin_obj);
        };

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    /// This test confirms that the Hello Token contract correctly
    /// redeems token transfers for the minimum amount. The contract
    /// should not pay any relayer fees since the amount is so small
    /// and the relayer fee calculation rounds down to zero.
    public fun redeem_transfer_with_payload_with_relayer_minimum_amount() {
        let (recipient, relayer) = people();
        let (my_scenario, _) = set_up(recipient);
        let scenario = &mut my_scenario;

        // Fetch VAA, transfer amount and expected relayer payout.
        let (signed_transfer_message, test_amount) =
            dummy_message::encoded_transfer_coin_8_minimum_amount();

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);

        // Perform test setup.
        {
            // Fetch the coin metadata.
            let (test_coin, test_metadata) = mint_coin_8(
                test_amount,
                test_scenario::ctx(scenario)
            );

            // Change context to the recipient for test setup.
            test_scenario::next_tx(scenario, recipient);

            // Run the test setup.
            transfer_setup(
                &mut hello_token_state,
                &mut bridge_state,
                test_metadata,
                recipient,
                scenario
            );

            // Change context to the relayer.
            test_scenario::next_tx(scenario, relayer);

            // Deposit tokens into the bridge, so we can use the Hello Token
            // contract to complete the transfer.
            token_bridge_scenario::deposit_native<COIN_8>(
                &mut bridge_state,
                test_amount
            );
            test_scenario::next_tx(scenario, relayer);

            // Transfer the coin to the zero address since it's not used.
            native_transfer::public_transfer(test_coin, @0x0);
        };

        // Verify the VAA.
        let verified_vaa = parse_and_verify_vaa(
            scenario,
            signed_transfer_message
        );
        let parsed = vaa::verify_only_once(&mut bridge_state, verified_vaa);

        // Ignore effects.
        test_scenario::next_tx(scenario, relayer);

        // Execute authorize_transfer.
        let receipt =
            authorize_transfer<COIN_8>(
                &mut bridge_state,
                parsed,
                test_scenario::ctx(scenario)
            );

        // Redeem the transfer on the Hello Token contract.
        transfer::redeem_transfer_with_payload<COIN_8>(
            &hello_token_state,
            receipt,
            test_scenario::ctx(scenario)
        );

        // Proceed.
        let effects = test_scenario::next_tx(scenario, relayer);

        // Verify results.
        {
            // Store created object IDs. Only one coin object should be
            // created, since the relayer fee was zero and nothing was
            // paid to the relayer.
            let created_ids = test_scenario::created(&effects);
            assert!(vector::length(&created_ids) == 1, 0);

            // Proceed with the test and change context to recipient.
            test_scenario::next_tx(scenario, recipient);

            // Fetch the transferred object by id.
            let transferred_coin_obj =
                test_scenario::take_from_sender_by_id<Coin<COIN_8>>(
                    scenario,
                    *vector::borrow(&created_ids, 0)
                );

            // Validate the recipient object's value.
            assert!(coin::value(&transferred_coin_obj) == test_amount, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, transferred_coin_obj);
        };

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    /// This test confirms that the Hello Token contract correctly handles
    /// transfers for the maximum amount (type(uint64).max) when the caller
    /// is the encoded recipient.
    public fun redeem_transfer_with_payload_self_redemption_maximum_amount() {
        let (recipient, _) = people();
        let (my_scenario, _) = set_up(recipient);
        let scenario = &mut my_scenario;

        // Fetch VAA and transfer amount.
        let (signed_transfer_message, test_amount) =
            dummy_message::encoded_transfer_coin_8_maximum_amount();

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);

        // Perform test setup.
        {
            // Fetch the coin metadata.
            let (test_coin, test_metadata) = mint_coin_8(
                test_amount,
                test_scenario::ctx(scenario)
            );
            test_scenario::next_tx(scenario, recipient);

            // Run the test setup.
            transfer_setup(
                &mut hello_token_state,
                &mut bridge_state,
                test_metadata,
                recipient,
                scenario
            );
            test_scenario::next_tx(scenario, recipient);

            // Deposit tokens into the bridge, so we can use the Hello Token
            // contract to complete the transfer.
            token_bridge_scenario::deposit_native<COIN_8>(
                &mut bridge_state,
                test_amount
            );
            test_scenario::next_tx(scenario, recipient);

            // Transfer the coin to the zero address since it's not used.
            native_transfer::public_transfer(test_coin, @0x0);
        };

        // Verify the VAA.
        let verified_vaa = parse_and_verify_vaa(
            scenario,
            signed_transfer_message
        );
        let parsed = vaa::verify_only_once(&mut bridge_state, verified_vaa);

        // Ignore effects.
        test_scenario::next_tx(scenario, recipient);

        // Execute authorize_transfer.
        let receipt =
            authorize_transfer<COIN_8>(
                &mut bridge_state,
                parsed,
                test_scenario::ctx(scenario)
            );

        // Redeem the transfer on the Hello Token contract.
        transfer::redeem_transfer_with_payload<COIN_8>(
            &hello_token_state,
            receipt,
            test_scenario::ctx(scenario)
        );

        // Proceed.
        let effects = test_scenario::next_tx(scenario, recipient);

        // Verify results.
        {
            // Store created object IDs.
            let created_ids = test_scenario::created(&effects);
            assert!(vector::length(&created_ids) == 1, 0);

            let token_object =
                test_scenario::take_from_sender<Coin<COIN_8>>(scenario);

            // Validate the object's value.
            assert!(coin::value(&token_object) == test_amount, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, token_object);
        };

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    /// This test confirms that the Hello Token contract correctly handles
    /// transfers for the maximum amount (type(uint64).max) when the caller
    /// is not the encoded recipient. The contract should correctly pay the
    /// caller the expected relayer fee.
    public fun redeem_transfer_with_payload_with_relayer_maximum_amount() {
        let (recipient, relayer) = people();
        let (my_scenario, _) = set_up(recipient);
        let scenario = &mut my_scenario;

        // Fetch VAA, transfer amount and expected relayer payout.
        let (signed_transfer_message, test_amount) =
            dummy_message::encoded_transfer_coin_8_maximum_amount();
        let expected_relayer_fee = 776036076436887126; // 4.2069% * test_amount

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);

        // Perform test setup.
        {
            // Fetch the coin metadata.
            let (test_coin, test_metadata) = mint_coin_8(
                test_amount,
                test_scenario::ctx(scenario)
            );

            // Change context to the recipient for test setup.
            test_scenario::next_tx(scenario, recipient);

            // Run the test setup.
            transfer_setup(
                &mut hello_token_state,
                &mut bridge_state,
                test_metadata,
                recipient,
                scenario
            );

            // Change context to the relayer.
            test_scenario::next_tx(scenario, relayer);

            // Deposit tokens into the bridge, so we can use the Hello Token
            // contract to complete the transfer.
            token_bridge_scenario::deposit_native<COIN_8>(
                &mut bridge_state,
                test_amount
            );
            test_scenario::next_tx(scenario, relayer);

            // Transfer the coin to the zero address since it's not used.
            native_transfer::public_transfer(test_coin, @0x0);
        };

        // Verify the VAA.
        let verified_vaa = parse_and_verify_vaa(
            scenario,
            signed_transfer_message
        );
        let parsed = vaa::verify_only_once(&mut bridge_state, verified_vaa);

        // Ignore effects.
        test_scenario::next_tx(scenario, relayer);

        // Execute authorize_transfer.
        let receipt =
            authorize_transfer<COIN_8>(
                &mut bridge_state,
                parsed,
                test_scenario::ctx(scenario)
            );

        // Redeem the transfer on the Hello Token contract.
        transfer::redeem_transfer_with_payload<COIN_8>(
            &hello_token_state,
            receipt,
            test_scenario::ctx(scenario)
        );

        // Proceed.
        let effects = test_scenario::next_tx(scenario, relayer);

        // Verify results.
        {
            // Store created object IDs.
            let created_ids = test_scenario::created(&effects);
            assert!(vector::length(&created_ids) == 2, 0);

            // Fetch the relayer fee object by id.
            let relayer_fee_obj =
                test_scenario::take_from_sender_by_id<Coin<COIN_8>>(
                    scenario,
                    *vector::borrow(&created_ids, 0)
                );

            // Validate the relayer fee object's value.
            assert!(coin::value(&relayer_fee_obj) == expected_relayer_fee, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, relayer_fee_obj);

            // Proceed with the test and change context to recipient.
            test_scenario::next_tx(scenario, recipient);

            // Fetch the transferred object by id.
            let transferred_coin_obj =
                test_scenario::take_from_sender_by_id<Coin<COIN_8>>(
                    scenario,
                    *vector::borrow(&created_ids, 1)
                );

            // Validate the relayer fee object's value.
            let expected_amount = test_amount - expected_relayer_fee;
            assert!(coin::value(&transferred_coin_obj) == expected_amount, 0);

            // Bye bye.
            test_scenario::return_to_sender(scenario, transferred_coin_obj);
        };

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);

        // Done.
        test_scenario::end(my_scenario);
    }

    #[test]
    #[expected_failure(abort_code = 1, location=transfer)]
    /// This test confirms that the Hello Token contract will revert
    /// if the sender of the transfer message is not the registered
    /// contract for the specified chain ID.
    public fun cannot_redeem_transfer_with_payload_unknown_sender() {
        let (recipient, _) = people();
        let (my_scenario, _) = set_up(recipient);
        let scenario = &mut my_scenario;

        // Fetch VAA and transfer amount.
        let (signed_transfer_message, test_amount) =
            dummy_message::encoded_transfer_coin_8_invalid_sender();

        // Fetch state objects.
        let hello_token_state =
            test_scenario::take_shared<State>(scenario);
        let bridge_state =
            test_scenario::take_shared<TokenBridgeState>(scenario);

        // Perform test setup.
        {
            // Fetch the coin metadata.
            let (test_coin, test_metadata) = mint_coin_8(
                test_amount,
                test_scenario::ctx(scenario)
            );
            test_scenario::next_tx(scenario, recipient);

            // Run the test setup.
            transfer_setup(
                &mut hello_token_state,
                &mut bridge_state,
                test_metadata,
                recipient,
                scenario
            );
            test_scenario::next_tx(scenario, recipient);

            // Deposit tokens into the bridge, so we can use the Hello Token
            // contract to complete the transfer.
            token_bridge_scenario::deposit_native<COIN_8>(
                &mut bridge_state,
                test_amount
            );
            test_scenario::next_tx(scenario, recipient);

            // Transfer the coin to the zero address since it's not used.
            native_transfer::public_transfer(test_coin, @0x0);
        };

        // Verify the VAA.
        let verified_vaa = parse_and_verify_vaa(
            scenario,
            signed_transfer_message
        );
        let parsed = vaa::verify_only_once(&mut bridge_state, verified_vaa);

        // Ignore effects.
        test_scenario::next_tx(scenario, recipient);

        // Execute authorize_transfer.
        let receipt =
            authorize_transfer<COIN_8>(
                &mut bridge_state,
                parsed,
                test_scenario::ctx(scenario)
            );

        // Redeem the transfer on the Hello Token contract.
        transfer::redeem_transfer_with_payload<COIN_8>(
            &hello_token_state,
            receipt,
            test_scenario::ctx(scenario)
        );

        // Return the goods.
        test_scenario::return_shared(hello_token_state);
        test_scenario::return_shared(bridge_state);

        // Done.
        test_scenario::end(my_scenario);
    }

    /// Utilities.

    public fun mint_coin_8(
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<COIN_8>, CoinMetadata<COIN_8>) {
        // Initialize token 8.
        let (treasury_cap, metadata) = coin_8::create_coin_test_only(ctx);

        // Mint tokens.
        let test_coin = coin::mint(
            &mut treasury_cap,
            amount,
            ctx
        );

        // Balance check the new coin object.
        assert!(coin::value(&test_coin) == amount, 0);

        // Bye bye.
        native_transfer::public_transfer(treasury_cap, @0x0);

        // Return.
        (test_coin, metadata)
    }

    public fun mint_coin_10(
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<COIN_10>, CoinMetadata<COIN_10>) {
        // Initialize token 10.
        let (treasury_cap, metadata) = coin_10::create_coin_test_only(ctx);

        // Mint tokens.
        let test_coin = coin::mint(
            &mut treasury_cap,
            amount,
            ctx
        );

        // Balance check the new coin object.
        assert!(coin::value(&test_coin) == amount, 0);

        // Bye bye.
        native_transfer::public_transfer(treasury_cap, @0x0);

        // Return.
        (test_coin, metadata)
    }

    public fun mint_sui(amount: u64, ctx: &mut TxContext): Coin<SUI> {
        // Mint SUI tokens.
        let sui_coin = sui::coin::mint_for_testing<SUI>(
            amount,
            ctx
        );
        assert!(coin::value(&sui_coin) == amount, 0);

        sui_coin
    }

    public fun transfer_setup<C>(
        hello_token_state: &mut State,
        bridge_state: &mut TokenBridgeState,
        coin_meta: CoinMetadata<C>,
        sender: address,
        scenario: &mut Scenario
    ): TransactionEffects {
        // Cache the owner_cap.
        let owner_cap =
            test_scenario::take_from_sender<OwnerCap>(scenario);

        // Register the target contract.
        {
            owner::register_foreign_contract(
                &owner_cap,
                hello_token_state,
                TEST_FOREIGN_CHAIN,
                TEST_FOREIGN_CONTRACT
            );

            // Proceed.
            test_scenario::next_tx(scenario, sender);
        };

        // Attest token.
        {
            let prepared_message = attest_token::attest_token<C>(
                bridge_state,
                &coin_meta,
                0, // nonce
            );

            // Proceed.
            test_scenario::next_tx(scenario, sender);
            native_transfer::public_transfer(coin_meta, @0x0);
            publish_message::destroy(prepared_message);
        };

        // Return owner cap.
        test_scenario::return_to_sender(scenario, owner_cap);

        let effects = test_scenario::next_tx(scenario, sender);
        (effects)
    }
}
