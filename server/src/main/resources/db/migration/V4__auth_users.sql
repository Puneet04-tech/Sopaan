-- User authentication for real-time multi-user system
CREATE TABLE app_user (
    user_id         VARCHAR(36) PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    email           VARCHAR(120) UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(80),
    role            VARCHAR(20) NOT NULL DEFAULT 'STUDENT',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    student_id      VARCHAR(36),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at   TIMESTAMP
);

CREATE INDEX idx_app_user_student ON app_user (student_id);
CREATE INDEX idx_app_user_email ON app_user (email);

-- Link devices to users
ALTER TABLE device ADD COLUMN user_id VARCHAR(36);
CREATE INDEX idx_device_user ON device (user_id);
