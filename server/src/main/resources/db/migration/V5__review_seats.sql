-- Reviewer quorum is counted per account, never per client-supplied key id (design FR10).
-- A seat is the reviewer slot an account occupies on a pack; it is allocated on first signature
-- and reused afterwards, so one account can never be counted twice.
CREATE TABLE IF NOT EXISTS review_seat (
    pack_id      VARCHAR(80) NOT NULL,
    user_id      VARCHAR(36) NOT NULL,
    reviewer_kid VARCHAR(20) NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (pack_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS review_seat_kid_idx ON review_seat (pack_id, reviewer_kid);

-- Consent records are written by the server only; mark the row that made them authoritative.
ALTER TABLE consent ADD COLUMN IF NOT EXISTS actor VARCHAR(36);
