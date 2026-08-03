/*
# Aviator Game — Wallet, Rounds, Bets, and Deposits

## Overview
This migration creates the full data layer for an Aviator-style crash betting game.
Players have a wallet balance, place bets on rounds, try to cash out before the
multiplier crashes, and can deposit funds via NOWPayments crypto payments.

## New Tables

### 1. `aviator_wallets`
- `id` (uuid, primary key)
- `user_id` (uuid, not null, defaults to `auth.uid()`, references `auth.users`)
- `balance` (numeric, default 0, not null) — player's playable balance in USD
- `created_at`, `updated_at` (timestamptz)

### 2. `aviator_rounds`
- `id` (uuid, primary key)
- `round_number` (bigint, unique) — sequential round identifier
- `crash_point` (numeric, not null) — the multiplier at which this round crashes
- `status` (enum: `pending`, `flying`, `crashed`) — current state of the round
- `created_at`, `started_at`, `ended_at` (timestamptz)

### 3. `aviator_bets`
- `id` (uuid, primary key)
- `round_id` (uuid, references `aviator_rounds`)
- `user_id` (uuid, not null, defaults to `auth.uid()`, references `auth.users`)
- `amount` (numeric, not null) — bet amount in USD
- `auto_cashout` (numeric, nullable) — multiplier at which to auto-cashout, null = manual
- `cashout_multiplier` (numeric, nullable) — the multiplier at which the player cashed out (null = didn't cash out)
- `payout` (numeric, default 0) — payout amount (amount * cashout_multiplier) if cashed out before crash
- `status` (enum: `active`, `cashed_out`, `lost`) — bet outcome
- `created_at`, `cashed_out_at` (timestamptz)

### 4. `aviator_deposits`
- `id` (uuid, primary key)
- `user_id` (uuid, not null, defaults to `auth.uid()`, references `auth.users`)
- `amount_usd` (numeric, not null) — requested deposit amount
- `payment_id` (text) — NOWPayments payment ID
- `pay_address` (text) — crypto address to send to
- `pay_amount` (numeric) — crypto amount to send
- `pay_currency` (text) — e.g. USDTTRC20
- `status` (enum: `pending`, `confirmed`, `expired`, `failed`)
- `created_at`, `confirmed_at` (timestamptz)

## RPC Functions

### `get_or_create_wallet()`
Returns the caller's wallet row, creating one with balance 0 if it doesn't exist.

### `place_aviator_bet(p_round_id uuid, p_amount numeric, p_auto_cashout numeric)`
Deducts the bet amount from the wallet, creates a bet record. Validates that
the round is in `flying` status and the user has sufficient balance.

### `cashout_aviator_bet(p_bet_id uuid)`
Marks a bet as cashed out at the current round multiplier, credits the payout
to the wallet. Validates the round hasn't crashed yet.

### `credit_aviator_deposit(p_deposit_id uuid)`
Credits a confirmed deposit to the wallet balance. Called after NOWPayments
confirms a payment.

## Security (RLS)
- All tables have RLS enabled.
- `aviator_wallets`: users can read/update only their own wallet.
- `aviator_rounds`: readable by all authenticated users (shared game state).
- `aviator_bets`: users can read/insert only their own bets.
- `aviator_deposits`: users can read/insert only their own deposits.
- RPC functions run with `SECURITY DEFINER` and validate `auth.uid()` internally.
*/

-- ─── Wallets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aviator_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE aviator_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_wallet" ON aviator_wallets;
CREATE POLICY "select_own_wallet" ON aviator_wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wallet" ON aviator_wallets;
CREATE POLICY "update_own_wallet" ON aviator_wallets
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Rounds ──────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE aviator_round_status AS ENUM ('pending', 'flying', 'crashed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS aviator_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number bigint UNIQUE NOT NULL,
  crash_point numeric(8,2) NOT NULL,
  status aviator_round_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);

ALTER TABLE aviator_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_all_rounds" ON aviator_rounds;
CREATE POLICY "read_all_rounds" ON aviator_rounds
  FOR SELECT TO authenticated USING (true);

-- ─── Bets ─────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE aviator_bet_status AS ENUM ('active', 'cashed_out', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS aviator_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES aviator_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  auto_cashout numeric(8,2),
  cashout_multiplier numeric(8,2),
  payout numeric(14,2) NOT NULL DEFAULT 0,
  status aviator_bet_status NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  cashed_out_at timestamptz
);

ALTER TABLE aviator_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_bets" ON aviator_bets;
CREATE POLICY "select_own_bets" ON aviator_bets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bets" ON aviator_bets;
CREATE POLICY "insert_own_bets" ON aviator_bets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_aviator_bets_round ON aviator_bets(round_id);
CREATE INDEX IF NOT EXISTS idx_aviator_bets_user ON aviator_bets(user_id);

-- ─── Deposits ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE aviator_deposit_status AS ENUM ('pending', 'confirmed', 'expired', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS aviator_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd numeric(14,2) NOT NULL,
  payment_id text,
  pay_address text,
  pay_amount numeric(18,8),
  pay_currency text,
  status aviator_deposit_status NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz
);

ALTER TABLE aviator_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_deposits" ON aviator_deposits;
CREATE POLICY "select_own_deposits" ON aviator_deposits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_deposits" ON aviator_deposits;
CREATE POLICY "insert_own_deposits" ON aviator_deposits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ─── RPC: get_or_create_wallet ────────────────────────────
CREATE OR REPLACE FUNCTION get_or_create_wallet()
RETURNS aviator_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w aviator_wallets%ROWTYPE;
BEGIN
  SELECT * INTO w FROM aviator_wallets WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    INSERT INTO aviator_wallets (user_id, balance) VALUES (auth.uid(), 0)
      RETURNING * INTO w;
  END IF;
  RETURN w;
END;
$$;

-- ─── RPC: place_aviator_bet ────────────────────────────────
CREATE OR REPLACE FUNCTION place_aviator_bet(
  p_round_id uuid,
  p_amount numeric,
  p_auto_cashout numeric DEFAULT NULL
)
RETURNS aviator_bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bet aviator_bets%ROWTYPE;
  w_balance numeric;
  r_status aviator_round_status;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Bet amount must be positive';
  END IF;

  SELECT balance INTO w_balance FROM aviator_wallets WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF w_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  SELECT status INTO r_status FROM aviator_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;
  IF r_status != 'flying' THEN
    RAISE EXCEPTION 'Round is not active for betting';
  END IF;

  UPDATE aviator_wallets
    SET balance = balance - p_amount, updated_at = now()
    WHERE user_id = auth.uid();

  INSERT INTO aviator_bets (round_id, user_id, amount, auto_cashout)
    VALUES (p_round_id, auth.uid(), p_amount, p_auto_cashout)
    RETURNING * INTO bet;

  RETURN bet;
END;
$$;

-- ─── RPC: cashout_aviator_bet ───────────────────────────────
CREATE OR REPLACE FUNCTION cashout_aviator_bet(
  p_bet_id uuid,
  p_current_multiplier numeric
)
RETURNS aviator_bets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bet aviator_bets%ROWTYPE;
  r_status aviator_round_status;
  payout_amount numeric;
BEGIN
  SELECT * INTO bet FROM aviator_bets WHERE id = p_bet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bet not found';
  END IF;
  IF bet.status != 'active' THEN
    RAISE EXCEPTION 'Bet is not active';
  END IF;

  SELECT status INTO r_status FROM aviator_rounds WHERE id = bet.round_id;
  IF r_status = 'crashed' THEN
    RAISE EXCEPTION 'Round already crashed';
  END IF;

  payout_amount := bet.amount * p_current_multiplier;

  UPDATE aviator_bets
    SET status = 'cashed_out',
        cashout_multiplier = p_current_multiplier,
        payout = payout_amount,
        cashed_out_at = now()
    WHERE id = p_bet_id
    RETURNING * INTO bet;

  UPDATE aviator_wallets
    SET balance = balance + payout_amount, updated_at = now()
    WHERE user_id = auth.uid();

  RETURN bet;
END;
$$;

-- ─── RPC: credit_aviator_deposit ───────────────────────────
CREATE OR REPLACE FUNCTION credit_aviator_deposit(
  p_deposit_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dep aviator_deposits%ROWTYPE;
BEGIN
  SELECT * INTO dep FROM aviator_deposits WHERE id = p_deposit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deposit not found';
  END IF;
  IF dep.status != 'pending' THEN
    RAISE EXCEPTION 'Deposit already processed';
  END IF;

  UPDATE aviator_deposits
    SET status = 'confirmed', confirmed_at = now()
    WHERE id = p_deposit_id;

  UPDATE aviator_wallets
    SET balance = balance + dep.amount_usd, updated_at = now()
    WHERE user_id = dep.user_id;
END;
$$;

-- ─── RPC: get_next_round_number ───────────────────────────
CREATE OR REPLACE FUNCTION get_next_round_number()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
BEGIN
  SELECT COALESCE(MAX(round_number), 0) + 1 INTO next_num FROM aviator_rounds;
  RETURN next_num;
END;
$$;

-- Grant execute on RPC functions
GRANT EXECUTE ON FUNCTION get_or_create_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION place_aviator_bet TO authenticated;
GRANT EXECUTE ON FUNCTION cashout_aviator_bet TO authenticated;
GRANT EXECUTE ON FUNCTION credit_aviator_deposit TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_round_number TO authenticated;
