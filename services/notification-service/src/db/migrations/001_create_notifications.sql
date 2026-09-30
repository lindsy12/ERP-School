-- One row per notification. Events name students and employees by their ids in other services,
-- never by login account, so a notification goes to an audience of roles (see
-- src/services/audiences.js) and, when the publisher knows it, to one user.
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    VARCHAR(64)     NULL,
  user_id      VARCHAR(64)     NULL,
  audience     ENUM('STAFF','ADMINS') NOT NULL DEFAULT 'STAFF',
  event_type   VARCHAR(100)    NOT NULL,
  title        VARCHAR(150)    NOT NULL,
  message      VARCHAR(500)    NOT NULL,
  source_key   VARCHAR(191)    NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_source (source_key),
  KEY idx_notifications_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Read state is per user, because one notification is shown to everyone in its audience.
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id         VARCHAR(64)     NOT NULL,
  read_at         TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id),
  CONSTRAINT fk_reads_notification FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
