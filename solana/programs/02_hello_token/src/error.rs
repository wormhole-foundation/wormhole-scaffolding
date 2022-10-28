use anchor_lang::prelude::error_code;

#[error_code]
pub enum HelloTokenError {
    #[msg("AlreadyInitialized")]
    AlreadyInitialized,

    #[msg("InvalidWormholeProgram")]
    InvalidWormholeProgram,

    #[msg("InvalidTokenBridgeProgram")]
    InvalidTokenBridgeProgram,

    #[msg("InvalidWormholeConfig")]
    InvalidWormholeConfig,

    #[msg("InvalidWormholeFeeCollector")]
    InvalidWormholeFeeCollector,

    #[msg("InvalidWormholeEmitter")]
    InvalidWormholeEmitter,

    #[msg("InvalidWormholeSequence")]
    InvalidWormholeSequence,

    #[msg("InvalidSysvar")]
    InvalidSysvar,

    #[msg("OwnerOnly")]
    OwnerOnly,

    #[msg("InvalidForeignEmitter")]
    InvalidForeignEmitter,

    #[msg("BumpNotFound")]
    BumpNotFound,
}
