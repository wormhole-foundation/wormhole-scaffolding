module hello_token::transfer {
    use sui::sui::SUI;
    use sui::coin::{Coin, CoinMetadata};
    use token_bridge::bridge_state::{BridgeState as TokenBridgeState};
    use token_bridge::transfer_tokens::{transfer_tokens_with_payload};
    use wormhole::external_address::{left_pad as make_external};
    use wormhole::myu16::{Self as wormhole_u16};
    use wormhole::state::{State as WormholeState};

    use hello_token::bytes32::{Self};
    use hello_token::message::{Self};
    use hello_token::state::{Self, State};

    // Errors.
    const E_INVALID_TARGET_RECIPIENT: u64 = 0;
    const E_UNREGISTERED_FOREIGN_CONTRACT: u64 = 1;

    public entry fun send_tokens_with_payload<T>(
        t_state: &State,
        wormhole_state: &mut WormholeState,
        token_bridge_state: &mut TokenBridgeState,
        coins: Coin<T>,
        metadata: &CoinMetadata<T>,
        wormhole_fee: Coin<SUI>,
        target_chain: u16,
        batch_id: u32,
        target_recipient: vector<u8>,
    ) {
        // We must have already registered a foreign contract before we can
        // bridge tokens to it.
        assert!(
            state::contract_registered(t_state, target_chain),
            E_UNREGISTERED_FOREIGN_CONTRACT
        );
        let foreign_contract =
            state::foreign_contract_address(t_state, target_chain);

        // When we create the message, `target_recipient` cannot be the zero
        // address.
        let msg = message::from_bytes(target_recipient);

        // Finally transfer tokens via Token Bridge.
        transfer_tokens_with_payload(
            state::emitter_cap(t_state),
            wormhole_state,
            token_bridge_state,
            coins,
            metadata,
            wormhole_fee,
            wormhole_u16::from_u64((target_chain as u64)),
            make_external(&bytes32::data(foreign_contract)),
            0, // relayer_fee, which will be taken out in a future release
            (batch_id as u64),
            message::encode(&msg)
        );
    }

    // public entry fun redeem_transfer_with_payload<T>(
    //     ...
    // ) {
    //     // TODO
    // }
}
