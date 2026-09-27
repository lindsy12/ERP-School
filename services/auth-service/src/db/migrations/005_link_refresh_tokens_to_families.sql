-- Move the user link from each refresh token to its family (see 004).

-- 1. Create a family row for any tokens that already exist. Safe to re-run: skips families already copied.
INSERT INTO token_families (id, user_id, created_at)
SELECT t.family_id, MIN(t.user_id), MIN(t.created_at)
  FROM refresh_tokens t
 WHERE t.family_id NOT IN (SELECT id FROM token_families)
 GROUP BY t.family_id;

-- 2. Drop user_id from refresh_tokens (its index goes with it) and point family_id at token_families.
ALTER TABLE refresh_tokens
  DROP FOREIGN KEY fk_refresh_tokens_user,
  DROP COLUMN user_id,
  ADD CONSTRAINT fk_refresh_tokens_family FOREIGN KEY (family_id) REFERENCES token_families (id)
    ON DELETE CASCADE;
