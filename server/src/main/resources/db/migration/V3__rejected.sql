-- Permanently rejected events still advance the device high-water mark, so a poisoned
-- event cannot block the outbox behind it forever. The rejection is durable and auditable.
CREATE TABLE rejected_event (
    device_id   VARCHAR(36) NOT NULL,
    seq         BIGINT NOT NULL,
    event_id    VARCHAR(36),
    code        VARCHAR(40) NOT NULL,
    rejected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, seq)
);
