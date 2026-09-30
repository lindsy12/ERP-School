-- Roles used for RBAC. The names are reference data the code relies on,
-- so they are inserted here (versioned) rather than by the seed script.
CREATE TABLE roles (
  id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(32)      NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT uq_roles_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO roles (name) VALUES ('SUPER_ADMIN'), ('ADMIN'), ('STAFF'), ('STUDENT');
