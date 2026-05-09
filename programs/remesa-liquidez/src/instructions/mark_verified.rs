use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::state::{ReservationStatus, TurnReservation};

/// Flips the `is_verified` flag on the reservation after the sender's backend
/// has validated an off-chain World ID proof for the receiver. This decouples
/// humanity verification from the merchant cash-out, so the receiver does not
/// need to sign at the point of sale.
#[derive(Accounts)]
pub struct MarkVerified<'info> {
    /// The sender that funded the reservation. The sender's app/backend is the
    /// integration point with the World ID API and is therefore the trust
    /// anchor authorized to flip `is_verified`.
    pub sender: Signer<'info>,

    #[account(
        mut,
        seeds = [TurnReservation::SEED_PREFIX, reservation.receiver.as_ref()],
        bump = reservation.bump,
        has_one = sender @ ErrorCode::SenderMismatch,
    )]
    pub reservation: Account<'info, TurnReservation>,
}

pub fn handler(ctx: Context<MarkVerified>) -> Result<()> {
    let reservation = &mut ctx.accounts.reservation;

    require!(
        reservation.status == ReservationStatus::Active,
        ErrorCode::ReservationNotActive
    );
    require!(!reservation.is_verified, ErrorCode::AlreadyVerified);

    reservation.is_verified = true;

    msg!(
        "World-ID verification recorded for receiver {} (reservation {})",
        reservation.receiver,
        reservation.key()
    );

    Ok(())
}
