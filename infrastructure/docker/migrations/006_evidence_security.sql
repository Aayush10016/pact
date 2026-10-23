ALTER TABLE evidence_versions ADD COLUMN scan_state text NOT NULL DEFAULT 'PENDING' CHECK (scan_state IN ('PENDING','CLEAN','INFECTED','ERROR'));
ALTER TABLE evidence_versions ADD COLUMN scanned_at timestamptz;
ALTER TABLE evidence_versions ADD COLUMN purged_at timestamptz;
ALTER TABLE evidence_versions ADD COLUMN legal_hold boolean NOT NULL DEFAULT false;
GRANT UPDATE(scan_state,scanned_at,purged_at,legal_hold) ON evidence_versions TO pact_runtime;
CREATE INDEX evidence_retention_idx ON evidence_versions(created_at) WHERE purged_at IS NULL;
