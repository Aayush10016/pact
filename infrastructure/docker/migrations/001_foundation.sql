CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_subject text NOT NULL UNIQUE,
  display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','IN_REVIEW','DISPUTED','COMPLETED')),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
  user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL CHECK (role IN ('BUYER','SELLER')),
  UNIQUE(pact_id,user_id), UNIQUE(pact_id,role)
);
CREATE TABLE commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
  description text NOT NULL, deadline timestamptz, status text NOT NULL DEFAULT 'UNCLEAR'
  CHECK (status IN ('FULFILLED','PARTIALLY_FULFILLED','UNFULFILLED','UNCLEAR'))
);
CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commitment_id uuid NOT NULL REFERENCES commitments(id),
  title text NOT NULL, position integer NOT NULL CHECK(position >= 0), deadline timestamptz,
  UNIQUE(commitment_id,position)
);
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
  amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency char(3) NOT NULL CHECK(currency IN ('USD','EUR','GBP','INR')),
  state text NOT NULL DEFAULT 'CREATED' CHECK(state IN ('CREATED','AUTHORIZED','CAPTURED','DISPUTED','RESOLUTION_PROPOSED','AWAITING_APPROVAL','ACTION_AUTHORIZED','ACTION_EXECUTING','COMPLETED','FAILED')),
  version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
  commitment_id uuid REFERENCES commitments(id), uploaded_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL, occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evidence_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evidence_id uuid NOT NULL REFERENCES evidence(id),
  version integer NOT NULL CHECK(version > 0), object_key text NOT NULL, content_sha256 char(64) NOT NULL,
  mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(evidence_id,version)
);
CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
  claimant_id uuid NOT NULL REFERENCES users(id), statement text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
  provider text NOT NULL, model text NOT NULL, schema_version integer NOT NULL,
  evidence_version_ids uuid[] NOT NULL, assessment jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid NOT NULL REFERENCES pacts(id),
  analysis_id uuid REFERENCES ai_analyses(id), proposal jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resolution_id uuid NOT NULL REFERENCES resolutions(id),
  user_id uuid NOT NULL REFERENCES users(id), decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(resolution_id,user_id)
);
CREATE TABLE paypal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL REFERENCES transactions(id),
  paypal_id text UNIQUE, request_id text NOT NULL UNIQUE, operation text NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE paypal_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL, verification_status text NOT NULL CHECK(verification_status IN ('PENDING','VERIFIED','REJECTED')),
  payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), pact_id uuid REFERENCES pacts(id),
  actor_id uuid REFERENCES users(id), event_type text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  pact_id uuid REFERENCES pacts(id), type text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evidence_chronology ON evidence(pact_id,occurred_at);
CREATE INDEX audit_chronology ON audit_events(pact_id,created_at);
CREATE INDEX user_parties ON parties(user_id);
CREATE INDEX pending_webhooks ON paypal_webhook_events(received_at) WHERE processed_at IS NULL;
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END; $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
