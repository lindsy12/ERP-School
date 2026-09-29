-- Access tokens ended by logout before their expiry, by jti (the JWT's unique id).
-- A row is only useful until the token would have expired anyway, so expired rows are deleted
-- whenever a new one is added; the table stays as small as the number of recent logouts.
CREATE TABLE revoked_access_tokens (
  jti        CHAR(36) NOT NULL,                             -- the token's jti claim
  user_id    CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,                             -- the token's exp claim (UTC)
  revoked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (jti),
  KEY idx_revoked_access_tokens_expires_at (expires_at),
  CONSTRAINT fk_revoked_access_tokens_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
