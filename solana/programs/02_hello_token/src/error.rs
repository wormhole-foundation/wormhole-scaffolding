use anchor_lang::prelude::error_code;

#[error_code]
pub enum HelloTokenError {
    #[msg("InvalidWormholeBridge")]
    /// Specified Wormhole bridge data PDA is wrong.
    InvalidWormholeBridge,

    #[msg("InvalidWormholeFeeCollector")]
    /// Specified Wormhole fee collector PDA is wrong.
    InvalidWormholeFeeCollector,

    #[msg("InvalidWormholeEmitter")]
    /// Specified program's emitter PDA is wrong.
    InvalidWormholeEmitter,

    #[msg("InvalidWormholeSequence")]
    /// Specified emitter's sequence PDA is wrong.
    InvalidWormholeSequence,

    #[msg("InvalidSysvar")]
    /// Specified sysvar is wrong.
    InvalidSysvar,

    #[msg("OwnerOnly")]
    /// Only the program's owner is permitted.
    OwnerOnly,

    #[msg("BumpNotFound")]
    /// Bump not found in `bumps` map.
    BumpNotFound,

    #[msg("InvalidForeignContract")]
    /// Specified foreign contract has a bad chain ID or zero address.
    InvalidForeignContract,

    #[msg("ZeroBridgeAmount")]
    /// Nothing to transfer if amount is zero.
    ZeroBridgeAmount,

    #[msg("InvalidTokenBridgeConfig")]
    /// Specified Token Bridge config PDA is wrong.
    InvalidTokenBridgeConfig,

    #[msg("InvalidTokenBridgeAuthoritySigner")]
    /// Specified Token Bridge authority signer PDA is wrong.
    InvalidTokenBridgeAuthoritySigner,

    #[msg("InvalidTokenBridgeCustodySigner")]
    /// Specified Token Bridge custody signer PDA is wrong.
    InvalidTokenBridgeCustodySigner,

    #[msg("InvalidTokenBridgeEmitter")]
    /// Specified Token Bridge emitter PDA is wrong.
    InvalidTokenBridgeEmitter,

    #[msg("InvalidTokenBridgeSequence")]
    /// Specified Token Bridge sequence PDA is wrong.
    InvalidTokenBridgeSequence,

    #[msg("InvalidTokenBridgeSender")]
    /// Specified Token Bridge sender PDA is wrong.
    InvalidTokenBridgeSender,

    #[msg("InvalidRecipient")]
    /// Specified recipient has a bad chain ID or zero address.
    InvalidRecipient,
}
