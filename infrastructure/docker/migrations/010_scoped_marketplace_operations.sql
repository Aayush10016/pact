-- Purpose-specific operations retain the runtime role's existing column restrictions.
CREATE FUNCTION bind_connected_payee(tx_id uuid,actor_id uuid,merchant text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t transactions%ROWTYPE; receiver uuid;
BEGIN
 SELECT * INTO t FROM transactions WHERE id=tx_id FOR UPDATE;
 IF NOT FOUND OR t.payment_route<>'CONNECTED' OR t.state NOT IN ('CREATED','AUTHORIZED') OR
    NOT EXISTS(SELECT 1 FROM pacts p JOIN parties r ON r.pact_id=p.id WHERE p.id=t.pact_id AND p.status='ACTIVE' AND r.user_id=actor_id AND r.role=t.payer_role)
 THEN RAISE EXCEPTION 'Connected payment authorization invalid'; END IF;
 SELECT r.user_id INTO receiver FROM parties r JOIN paypal_accounts a ON a.user_id=r.user_id
 WHERE r.pact_id=t.pact_id AND r.role<>t.payer_role AND a.status='READY' AND a.merchant_id=merchant AND a.checked_at>now()-interval '2 minutes';
 IF receiver IS NULL OR (t.payee_merchant_id IS NOT NULL AND (t.payee_merchant_id<>merchant OR t.payee_user_id<>receiver))
 THEN RAISE EXCEPTION 'Verified recipient mismatch'; END IF;
 IF t.payee_merchant_id IS NULL THEN
   IF EXISTS(SELECT 1 FROM paypal_transactions WHERE transaction_id=tx_id) THEN RAISE EXCEPTION 'Financial recipient already locked'; END IF;
   UPDATE transactions SET payee_user_id=receiver,payee_merchant_id=merchant WHERE id=tx_id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION bind_connected_payee(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bind_connected_payee(uuid,uuid,text) TO pact_runtime;

CREATE FUNCTION activate_marketplace_delivery(pact uuid,accepting_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE days integer; due timestamptz;
BEGIN
 SELECT (a.snapshot->>'deliveryDays')::integer INTO days FROM marketplace_agreements a
 JOIN pacts p ON p.id=a.pact_id WHERE a.pact_id=pact AND a.seller_id=accepting_user AND p.status='ACTIVE'
 AND EXISTS(SELECT 1 FROM pact_invitations i WHERE i.pact_id=pact AND i.accepted_by=accepting_user);
 IF days IS NULL OR days<1 OR days>365 THEN RAISE EXCEPTION 'Marketplace acceptance invalid'; END IF;
 SELECT deadline INTO due FROM pacts WHERE id=pact FOR UPDATE;
 IF due IS NULL THEN
   due:=now()+days*interval '1 day';
   UPDATE pacts SET deadline=due WHERE id=pact;
   UPDATE commitments SET deadline=due WHERE pact_id=pact AND deadline IS NULL;
 END IF;
END $$;
REVOKE ALL ON FUNCTION activate_marketplace_delivery(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION activate_marketplace_delivery(uuid,uuid) TO pact_runtime;
