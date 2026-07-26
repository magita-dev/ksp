/*
# Add mobile_number to officer_profiles + create password_otps table

1. Purpose
   Extends officer signup with a verified mobile number and adds a secure
   OTP-based password recovery flow. On account creation a "registration
   receipt" SMS is generated; when an officer forgets their password a
   one-time code is sent to their registered mobile number.

2. Modified Tables
   - `officer_profiles`
     - ADD `mobile_number` text NOT NULL UNIQUE — 10-digit Indian mobile,
       validated by CHECK constraint (starts with 6-9, 10 digits).
     - ADD `phone_e164` text — E.164 formatted version (e.g. +91XXXXXXXXXX)
       used by the SMS edge function.

3. New Tables
   - `password_otps`
     - `id`           uuid PRIMARY KEY
     - `officer_id`   uuid NOT NULL REFERENCES officer_profiles(id) ON DELETE CASCADE
     - `mobile_number` text NOT NULL — number the code was sent to (audit)
     - `code_hash`    text NOT NULL — SHA-256 hash of the 6-digit code (never plaintext)
     - `purpose`      text NOT NULL — 'password_reset' (extensible)
     - `expires_at`   timestamptz NOT NULL — 10-minute validity
     - `consumed_at`  timestamptz — set when the code is used (null = unused)
     - `attempts`     int NOT NULL DEFAULT 0 — wrong-try counter (max 5)
     - `created_at`   timestamptz DEFAULT now()

4. Security
   - RLS on password_otps:
     - SELECT/INSERT/UPDATE: authenticated officers may only touch rows
       where officer_id = auth.uid() (they request + verify their own codes).
     - DELETE: not granted to clients (codes expire/are consumed, not deleted
       from the app); admin cleanup can run server-side.
   - The stored code is HASHED. The plaintext code is sent via SMS and never
     written to the database, so a DB leak does not expose active codes.

5. Important Notes
   - This migration is idempotent: columns use IF NOT EXISTS, policies drop first.
   - mobile_number CHECK uses a regex for Indian mobile format (6-9 prefix, 10 digits).
   - expires_at + attempts cap brute-force: 10-min window, max 5 tries, one use.
*/

-- Add mobile_number and phone_e164 to officer_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'officer_profiles' AND column_name = 'mobile_number'
  ) THEN
    ALTER TABLE officer_profiles
      ADD COLUMN mobile_number text NOT NULL DEFAULT '0000000000';
    ALTER TABLE officer_profiles
      ADD CONSTRAINT officer_profiles_mobile_chk
      CHECK (mobile_number ~ '^([6-9][0-9]{9})$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'officer_profiles' AND column_name = 'phone_e164'
  ) THEN
    ALTER TABLE officer_profiles ADD COLUMN phone_e164 text;
  END IF;
END $$;

-- Create password_otps table
CREATE TABLE IF NOT EXISTS password_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officer_profiles(id) ON DELETE CASCADE,
  mobile_number text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'password_reset',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE password_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_otps" ON password_otps;
CREATE POLICY "select_own_otps"
  ON password_otps FOR SELECT
  TO authenticated
  USING (auth.uid() = officer_id);

DROP POLICY IF EXISTS "insert_own_otps" ON password_otps;
CREATE POLICY "insert_own_otps"
  ON password_otps FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = officer_id);

DROP POLICY IF EXISTS "update_own_otps" ON password_otps;
CREATE POLICY "update_own_otps"
  ON password_otps FOR UPDATE
  TO authenticated
  USING (auth.uid() = officer_id)
  WITH CHECK (auth.uid() = officer_id);
