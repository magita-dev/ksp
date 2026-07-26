/*
# Make mobile_number optional (switch receipt + OTP delivery to email)

1. Purpose
   The app now delivers registration receipts and password-reset OTPs by
   EMAIL instead of SMS. The mobile_number column is no longer required
   for signup, so we relax it to nullable and drop the strict CHECK
   constraint. Existing rows keep their values.

2. Modified Tables
   - `officer_profiles`
     - `mobile_number` → now nullable (was NOT NULL DEFAULT '0000000000')
     - Drop the `officer_profiles_mobile_chk` CHECK constraint so officers
       who don't provide a mobile can still register.
     - `phone_e164` stays (nullable) for any future SMS use.

3. Security
   - No policy changes. RLS on `password_otps` is unchanged.

4. Important Notes
   - No data is lost: existing mobile numbers remain. Only the NOT NULL
     constraint and format check are removed.
   - The `password_otps.mobile_number` column is kept for audit even though
     delivery is now via email; the edge function writes the officer's email
     there instead of a phone number.
*/

-- Drop the mobile format check constraint if it exists
ALTER TABLE officer_profiles DROP CONSTRAINT IF EXISTS officer_profiles_mobile_chk;

-- Make mobile_number nullable and drop the placeholder default
ALTER TABLE officer_profiles ALTER COLUMN mobile_number DROP NOT NULL;
ALTER TABLE officer_profiles ALTER COLUMN mobile_number DROP DEFAULT;
