CREATE TABLE reconciliation_reviews (
 request_id uuid PRIMARY KEY, operation_id uuid NOT NULL REFERENCES paypal_transactions(id),
 actor_id uuid NOT NULL REFERENCES users(id), fingerprint char(64) NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500), outcome jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER reconciliation_immutable BEFORE UPDATE OR DELETE ON reconciliation_reviews FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
GRANT SELECT,INSERT ON reconciliation_reviews TO pact_runtime;
