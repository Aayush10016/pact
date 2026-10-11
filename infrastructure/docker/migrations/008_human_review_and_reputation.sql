CREATE TABLE support_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
 requester_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('RESOLUTION','REFUND')), reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
 assigned_to uuid REFERENCES users(id), status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','DECIDED')),
 version integer NOT NULL DEFAULT 1, response_deadline timestamptz NOT NULL DEFAULT now()+interval '72 hours',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(pact_id,requester_id,request_id)
);
CREATE UNIQUE INDEX one_active_support_case ON support_cases(pact_id) WHERE status IN ('OPEN','IN_REVIEW');
CREATE TABLE support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES support_cases(id),
 sender_id uuid NOT NULL REFERENCES users(id), audience_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 evidence_version_ids uuid[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(case_id,sender_id,request_id)
);
CREATE TABLE support_decisions (
 id uuid PRIMARY KEY, case_id uuid NOT NULL UNIQUE REFERENCES support_cases(id),
 reviewer_id uuid NOT NULL REFERENCES users(id), resolution_id uuid NOT NULL UNIQUE REFERENCES resolutions(id),
 case_version integer NOT NULL, resolution_version integer NOT NULL, proposal_sha256 char(64) NOT NULL,
 reason text NOT NULL CHECK(length(reason) BETWEEN 20 AND 4000), evidence_version_ids uuid[] NOT NULL,
 response_override_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE seller_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL UNIQUE REFERENCES pacts(id),
 author_id uuid NOT NULL REFERENCES users(id), seller_id uuid NOT NULL REFERENCES users(id),
 stars integer NOT NULL CHECK(stars BETWEEN 1 AND 5), body text NOT NULL CHECK(length(body) BETWEEN 10 AND 1500),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(author_id<>seller_id)
);
CREATE TABLE review_moderation (
 review_id uuid PRIMARY KEY REFERENCES seller_reviews(id), actor_id uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER support_messages_immutable BEFORE UPDATE OR DELETE ON support_messages FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER support_decisions_immutable BEFORE UPDATE OR DELETE ON support_decisions FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER seller_reviews_immutable BEFORE UPDATE OR DELETE ON seller_reviews FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER review_moderation_immutable BEFORE UPDATE OR DELETE ON review_moderation FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
GRANT SELECT,INSERT,UPDATE ON support_cases TO pact_runtime;
GRANT SELECT,INSERT ON support_messages,support_decisions,seller_reviews,review_moderation TO pact_runtime;
