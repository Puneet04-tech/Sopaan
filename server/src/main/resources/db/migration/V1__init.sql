-- Portable schema: H2 in PostgreSQL mode for the hub, Neon Postgres in the cloud.
CREATE TABLE student (
    student_id      VARCHAR(36) PRIMARY KEY,
    display_alias   VARCHAR(80),
    consent_version VARCHAR(40),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE device (
    device_id   VARCHAR(36) PRIMARY KEY,
    student_id  VARCHAR(36) NOT NULL,
    pubkey      VARCHAR(64) NOT NULL,
    hwm_seq     BIGINT NOT NULL DEFAULT 0,
    enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen   TIMESTAMP
);
CREATE INDEX idx_device_student ON device (student_id);

CREATE TABLE cohort (
    cohort_id      VARCHAR(36) PRIMARY KEY,
    facilitator_id VARCHAR(36) NOT NULL,
    name           VARCHAR(120) NOT NULL,
    district       VARCHAR(80),
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cohort_member (
    cohort_id  VARCHAR(36) NOT NULL,
    student_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (cohort_id, student_id)
);

-- Append-only signed event log. UNIQUE(device_id, seq) is the idempotency guard.
CREATE TABLE event (
    event_id    VARCHAR(36) PRIMARY KEY,
    device_id   VARCHAR(36) NOT NULL,
    seq         BIGINT NOT NULL,
    type        VARCHAR(60) NOT NULL,
    payload     TEXT NOT NULL,
    ts          BIGINT NOT NULL,
    sig         VARCHAR(120) NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (device_id, seq)
);
CREATE INDEX idx_event_device ON event (device_id, seq);

CREATE TABLE profile_field (
    student_id VARCHAR(36) NOT NULL,
    field       VARCHAR(60) NOT NULL,
    field_value TEXT,
    device_id   VARCHAR(36),
    ver         BIGINT NOT NULL DEFAULT 1,
    is_conflict BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, field)
);

CREATE TABLE pathway_step (
    student_id  VARCHAR(36) NOT NULL,
    pathway_id  VARCHAR(60) NOT NULL,
    step        VARCHAR(80) NOT NULL,
    event_id    VARCHAR(36),
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, pathway_id, step)
);

CREATE TABLE rule_pack (
    pack_id         VARCHAR(80) PRIMARY KEY,
    name            VARCHAR(40) NOT NULL,
    version         VARCHAR(40) NOT NULL,
    expires_at      DATE,
    status          VARCHAR(20) NOT NULL,
    reviewers       INT NOT NULL DEFAULT 0,
    manifest_sha256 VARCHAR(64),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE issuer_cert (
    kid        VARCHAR(20) PRIMARY KEY,
    org        VARCHAR(160) NOT NULL,
    role       VARCHAR(20) NOT NULL,
    scope      TEXT NOT NULL,
    epoch      INT NOT NULL,
    valid_from DATE NOT NULL,
    valid_to   DATE NOT NULL,
    pubkey     VARCHAR(64) NOT NULL,
    root_sig   TEXT NOT NULL
);

CREATE TABLE credential (
    cred_id       VARCHAR(36) PRIMARY KEY,
    issuer_kid    VARCHAR(20) NOT NULL,
    subject_id    VARCHAR(36) NOT NULL,
    skill         VARCHAR(40) NOT NULL,
    level         INT NOT NULL,
    evidence_hash VARCHAR(64) NOT NULL,
    issued_at     BIGINT NOT NULL,
    expiry        BIGINT NOT NULL,
    envelope      TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL,
    revoked_at    TIMESTAMP,
    evidence_label VARCHAR(200)
);
CREATE INDEX idx_credential_subject ON credential (subject_id);

CREATE TABLE revocation (
    cred_id    VARCHAR(36) PRIMARY KEY,
    revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason     VARCHAR(160),
    epoch      INT NOT NULL
);

CREATE TABLE credit_pool (
    pool_id       VARCHAR(40) PRIMARY KEY,
    sponsor       VARCHAR(120),
    total_inr     INT NOT NULL,
    remaining_inr INT NOT NULL,
    milestone     VARCHAR(40),
    status        VARCHAR(20) NOT NULL
);

CREATE TABLE credit_allowance (
    allow_id   VARCHAR(36) PRIMARY KEY,
    device_id  VARCHAR(36),
    pool_id    VARCHAR(40),
    cap_inr    INT NOT NULL,
    ctr_start  BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    envelope   TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE credit_token (
    token_id   VARCHAR(36) PRIMARY KEY,
    allow_id   VARCHAR(36) NOT NULL,
    cred_id    VARCHAR(36),
    amount_inr INT NOT NULL,
    ctr        BIGINT NOT NULL,
    status     VARCHAR(20) NOT NULL,
    settled_at TIMESTAMP,
    UNIQUE (allow_id, ctr)
);

CREATE TABLE consent (
    student_id   VARCHAR(36) NOT NULL,
    version      VARCHAR(40) NOT NULL,
    guardian_ref VARCHAR(80),
    granted_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at   TIMESTAMP,
    PRIMARY KEY (student_id, version)
);

CREATE TABLE audit_log (
    audit_id  VARCHAR(36) PRIMARY KEY,
    actor     VARCHAR(60),
    action    VARCHAR(60) NOT NULL,
    ref       VARCHAR(120),
    ts        TIMESTAMP NOT NULL,
    prev_hash VARCHAR(64),
    hash      VARCHAR(64) NOT NULL
);

CREATE TABLE review_signature (
    pack_id      VARCHAR(80) NOT NULL,
    reviewer_kid VARCHAR(20) NOT NULL,
    signed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pack_id, reviewer_kid)
);
