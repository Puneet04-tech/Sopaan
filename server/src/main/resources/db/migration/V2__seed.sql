-- Demo sponsor pool and a cohort. The facilitator and issuer certificates are created by
-- SeedRunner so they always match the signed artifacts on disk.
INSERT INTO credit_pool (pool_id, sponsor, total_inr, remaining_inr, milestone, status)
VALUES ('POOL-SKILL-2026', 'CSR Skills Fund (demo)', 100000, 100000, 'TAILOR.L2', 'ACTIVE');

INSERT INTO credit_pool (pool_id, sponsor, total_inr, remaining_inr, milestone, status)
VALUES ('POOL-WELD-2026', 'CSR Skills Fund (demo)', 40000, 40000, 'WELD.L1', 'ACTIVE');

INSERT INTO cohort (cohort_id, facilitator_id, name, district)
VALUES ('demo-cohort-01', 'facilitator-01', 'Zilla Parishad Skills Cell (demo)', 'Pune (rural)');
