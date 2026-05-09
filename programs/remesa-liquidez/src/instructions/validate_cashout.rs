use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{
    BPS_DENOMINATOR, FEE_BPS, TREASURY_AUTHORITY_SEED, TREASURY_VAULT_SEED,
};
use crate::errors::ErrorCode;
use crate::state::{MerchantAccount, ReservationStatus, TurnReservation};

#[derive(Accounts)]
pub struct ValidateCashout<'info> {
    /// Merchant providing physical liquidity. Sole signer of the cash-out and
    /// payer for the lazy treasury init (cheap rent on first use per mint).
    #[account(mut)]
    pub merchant: Signer<'info>,

    #[account(
        seeds = [MerchantAccount::SEED_PREFIX, merchant.key().as_ref()],
        bump = merchant_whitelist.bump,
        constraint = merchant_whitelist.merchant == merchant.key() @ ErrorCode::InvalidMerchant,
    )]
    pub merchant_whitelist: Account<'info, MerchantAccount>,

    #[account(
        mut,
        seeds = [TurnReservation::SEED_PREFIX, reservation.receiver.as_ref()],
        bump = reservation.bump,
        has_one = mint @ ErrorCode::MintMismatch,
    )]
    pub reservation: Box<Account<'info, TurnReservation>>,

    /// SPL mint backing the reservation.
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [TurnReservation::VAULT_SEED_PREFIX, reservation.key().as_ref()],
        bump = reservation.vault_bump,
        constraint = vault.mint == reservation.mint @ ErrorCode::MintMismatch,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = merchant_token_account.owner == merchant.key(),
        constraint = merchant_token_account.mint == reservation.mint @ ErrorCode::MintMismatch,
    )]
    pub merchant_token_account: Box<Account<'info, TokenAccount>>,

    /// Treasury authority PDA. Owns every per-mint treasury vault. Validated
    /// by seeds; never signs from this instruction (only fees flow in).
    /// CHECK: PDA validated by seeds.
    #[account(
        seeds = [TREASURY_AUTHORITY_SEED],
        bump,
    )]
    pub treasury_authority: UncheckedAccount<'info>,

    /// Per-mint treasury token account. Initialized lazily on the first
    /// `validate_cashout` for the given mint (merchant pays the rent).
    #[account(
        init_if_needed,
        payer = merchant,
        seeds = [TREASURY_VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = treasury_authority,
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> ValidateCashout<'info> {
    fn into_transfer_to_merchant_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault.to_account_info(),
            to: self.merchant_token_account.to_account_info(),
            authority: self.reservation.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }

    fn into_transfer_to_treasury_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.vault.to_account_info(),
            to: self.treasury_token_account.to_account_info(),
            authority: self.reservation.to_account_info(),
        };
        CpiContext::new(self.token_program.to_account_info(), cpi_accounts)
    }
}

pub fn handler(ctx: Context<ValidateCashout>) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        ctx.accounts.merchant_whitelist.active,
        ErrorCode::InvalidMerchant
    );

    {
        let reservation = &ctx.accounts.reservation;
        require!(
            reservation.status == ReservationStatus::Active,
            ErrorCode::ReservationNotActive
        );
        require!(
            clock.unix_timestamp < reservation.expires_at,
            ErrorCode::ReservationExpired
        );
        require!(reservation.is_verified, ErrorCode::ReceiverNotVerified);

        if reservation.merchant != Pubkey::default() {
            require_keys_eq!(
                reservation.merchant,
                ctx.accounts.merchant.key(),
                ErrorCode::InvalidMerchant
            );
        }
    }

    let total_amount = ctx.accounts.reservation.amount;
    let fee_amount = total_amount
        .checked_mul(FEE_BPS)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR))
        .ok_or(ErrorCode::NumericOverflow)?;
    let merchant_amount = total_amount
        .checked_sub(fee_amount)
        .ok_or(ErrorCode::NumericOverflow)?;

    let receiver_key = ctx.accounts.reservation.receiver;
    let reservation_bump = ctx.accounts.reservation.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        TurnReservation::SEED_PREFIX,
        receiver_key.as_ref(),
        std::slice::from_ref(&reservation_bump),
    ]];

    if merchant_amount > 0 {
        token::transfer(
            ctx.accounts
                .into_transfer_to_merchant_context()
                .with_signer(signer_seeds),
            merchant_amount,
        )?;
    }

    if fee_amount > 0 {
        token::transfer(
            ctx.accounts
                .into_transfer_to_treasury_context()
                .with_signer(signer_seeds),
            fee_amount,
        )?;
    }

    let reservation = &mut ctx.accounts.reservation;
    reservation.merchant = ctx.accounts.merchant.key();
    reservation.status = ReservationStatus::Completed;

    msg!(
        "Cashout settled: receiver={}, merchant={}, gross={}, fee={}, net={}",
        reservation.receiver,
        reservation.merchant,
        total_amount,
        fee_amount,
        merchant_amount
    );

    Ok(())
}
