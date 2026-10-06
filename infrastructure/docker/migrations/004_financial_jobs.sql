CREATE UNIQUE INDEX one_order_capture ON paypal_transactions(transaction_id,operation) WHERE operation IN ('ORDER','CAPTURE');
ALTER TABLE paypal_webhook_events ADD COLUMN processing_status text NOT NULL DEFAULT 'PENDING' CHECK(processing_status IN ('PENDING','PROCESSED','FAILED','IGNORED'));
ALTER TABLE paypal_webhook_events ADD COLUMN failure_code text;
