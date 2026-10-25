-- Existing financial records keep their original developer-merchant ownership.
CREATE TABLE paypal_accounts (
 user_id uuid PRIMARY KEY REFERENCES users(id), tracking_id uuid NOT NULL UNIQUE,
 merchant_id text UNIQUE, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','READY','RESTRICTED','REVOKED')),
 referral_id text, onboarding_url text, checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE service_listings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120), description text NOT NULL CHECK(length(description) BETWEEN 20 AND 4000),
 category text NOT NULL CHECK(length(category) BETWEEN 2 AND 60), acceptance_criteria text NOT NULL CHECK(length(acceptance_criteria) BETWEEN 10 AND 2000),
 expected_evidence text NOT NULL CHECK(length(expected_evidence) BETWEEN 3 AND 1000),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 100 AND 100000000), currency char(3) NOT NULL CHECK(currency IN ('USD','EUR','GBP')),
 delivery_days integer NOT NULL CHECK(delivery_days BETWEEN 1 AND 365),
 published boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 request_id uuid NOT NULL, UNIQUE(owner_id,request_id)
);
CREATE INDEX service_listing_search ON service_listings USING gin(to_tsvector('simple',title || ' ' || description || ' ' || category)) WHERE published;
CREATE TABLE marketplace_agreements (
 pact_id uuid PRIMARY KEY REFERENCES pacts(id), listing_id uuid NOT NULL REFERENCES service_listings(id),
 listing_version integer NOT NULL, snapshot jsonb NOT NULL, seller_id uuid NOT NULL REFERENCES users(id),
 buyer_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(seller_id<>buyer_id), UNIQUE(buyer_id,request_id)
);
ALTER TABLE transactions ADD COLUMN payment_route text NOT NULL DEFAULT 'LEGACY' CHECK(payment_route IN ('LEGACY','CONNECTED'));
ALTER TABLE transactions ADD COLUMN payee_merchant_id text;
ALTER TABLE transactions ADD COLUMN payee_user_id uuid REFERENCES users(id);
ALTER TABLE transactions ADD CONSTRAINT connected_payee_pair CHECK((payee_merchant_id IS NULL)=(payee_user_id IS NULL));
CREATE FUNCTION protect_payment_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payment_route<>OLD.payment_route OR
    ((NEW.payee_merchant_id,NEW.payee_user_id) IS DISTINCT FROM (OLD.payee_merchant_id,OLD.payee_user_id) AND
     (OLD.payment_route<>'CONNECTED' OR OLD.payee_merchant_id IS NOT NULL OR EXISTS(SELECT 1 FROM paypal_transactions WHERE transaction_id=OLD.id)))
 THEN RAISE EXCEPTION 'Financial recipient is immutable after binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER transaction_route_immutable BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION protect_payment_route();
CREATE TRIGGER marketplace_agreements_immutable BEFORE UPDATE OR DELETE ON marketplace_agreements FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
GRANT SELECT,INSERT,UPDATE ON paypal_accounts,service_listings TO pact_runtime;
GRANT SELECT,INSERT ON marketplace_agreements TO pact_runtime;
