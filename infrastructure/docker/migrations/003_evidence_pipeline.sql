CREATE TABLE evidence_upload_requests(pact_id uuid NOT NULL REFERENCES pacts(id),user_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,version_id uuid NOT NULL UNIQUE REFERENCES evidence_versions(id),request_sha256 char(64) NOT NULL,PRIMARY KEY(pact_id,user_id,request_id));
ALTER TABLE evidence_versions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ai_analyses ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE FUNCTION protect_resolution_content() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ROW(NEW.pact_id,NEW.proposal,NEW.version,NEW.analysis_id) IS DISTINCT FROM ROW(OLD.pact_id,OLD.proposal,OLD.version,OLD.analysis_id) THEN RAISE EXCEPTION 'Resolution content is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER resolution_content_immutable BEFORE UPDATE ON resolutions FOR EACH ROW EXECUTE FUNCTION protect_resolution_content();
