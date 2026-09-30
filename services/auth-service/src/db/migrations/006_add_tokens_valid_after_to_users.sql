-- Access tokens issued before this moment are rejected, even if they have not expired yet.
-- Set when a password is changed or reset, so a stolen token stops working at once instead of
-- after up to ACCESS_TOKEN_MINUTES. NULL = no cut-off. Stored in whole seconds (UTC), like the JWT's iat.
ALTER TABLE users
  ADD COLUMN tokens_valid_after DATETIME NULL AFTER locked_until;
