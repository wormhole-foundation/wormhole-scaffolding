use anchor_lang::prelude::error_code;

#[error_code]
pub enum HelloWorldError {
    #[msg("AlreadyInitialized")]
    AlreadyInitialized,

    #[msg("InvalidWormholeProgram")]
    InvalidWormholeProgram,

    #[msg("InvalidWormholeConfig")]
    InvalidWormholeConfig,

    #[msg("InvalidWormholeFeeCollector")]
    InvalidWormholeFeeCollector,

    #[msg("InvalidWormholeEmitter")]
    InvalidWormholeEmitter,

    #[msg("InvalidWormholeSequence")]
    InvalidWormholeSequence,

    #[msg("InvalidSystemProgram")]
    InvalidSystemProgram,

    #[msg("PermissionDenied")]
    PermissionDenied,

    #[msg("InvalidForeignEmitter")]
    InvalidForeignEmitter,

    #[msg("BumpNotFound")]
    BumpNotFound,
}
