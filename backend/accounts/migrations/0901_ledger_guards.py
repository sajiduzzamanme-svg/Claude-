"""Database-level guards for the ledger.

Even if application code (or someone with a SQL prompt) gets it wrong,
PostgreSQL itself refuses to commit an unbalanced voucher or to change a
posted one.
"""
from django.db import migrations

FORWARD = """
CREATE OR REPLACE FUNCTION spaceup_check_entry_balanced() RETURNS trigger AS $$
DECLARE
    eid bigint;
    total_debit numeric;
    total_credit numeric;
BEGIN
    eid := COALESCE(NEW.entry_id, OLD.entry_id);
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO total_debit, total_credit
      FROM accounts_journalline WHERE entry_id = eid;
    IF total_debit <> total_credit THEN
        RAISE EXCEPTION 'Journal entry % is not balanced (debit %, credit %)', eid, total_debit, total_credit
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_entry_balanced
    AFTER INSERT OR UPDATE OR DELETE ON accounts_journalline
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION spaceup_check_entry_balanced();

CREATE OR REPLACE FUNCTION spaceup_block_ledger_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Posted ledger rows are immutable (% on %). Post a reversal instead.', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_line_immutable
    BEFORE UPDATE OR DELETE ON accounts_journalline
    FOR EACH ROW EXECUTE FUNCTION spaceup_block_ledger_change();

CREATE TRIGGER journal_entry_immutable
    BEFORE UPDATE OR DELETE ON accounts_journalentry
    FOR EACH ROW EXECUTE FUNCTION spaceup_block_ledger_change();
"""

REVERSE = """
DROP TRIGGER IF EXISTS journal_entry_immutable ON accounts_journalentry;
DROP TRIGGER IF EXISTS journal_line_immutable ON accounts_journalline;
DROP TRIGGER IF EXISTS journal_entry_balanced ON accounts_journalline;
DROP FUNCTION IF EXISTS spaceup_block_ledger_change();
DROP FUNCTION IF EXISTS spaceup_check_entry_balanced();
"""


class Migration(migrations.Migration):
    dependencies = [("accounts", "0900_seed_chart")]
    operations = [migrations.RunSQL(FORWARD, REVERSE)]
