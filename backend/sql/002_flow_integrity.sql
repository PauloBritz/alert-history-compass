-- REVIEW ONLY. Not executed by this delivery. Additive, no legacy rows merged.
ALTER TABLE el_occurrences ADD COLUMN IF NOT EXISTS identity_key text;
ALTER TABLE el_occurrences ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}';
ALTER TABLE el_occurrences ADD COLUMN IF NOT EXISTS scope_key text NOT NULL DEFAULT 'legacy';
CREATE UNIQUE INDEX IF NOT EXISTS el_occurrences_identity ON el_occurrences(identity_key) WHERE identity_key IS NOT NULL;
-- external_id remains intact for old data; new scoped IDs live in context.external_id.
COMMENT ON COLUMN el_occurrences.external_id IS 'Legacy unscoped identity, preserved. New contextual identity uses identity_key and context.external_id.';
ALTER TABLE el_links ADD COLUMN IF NOT EXISTS scope_key text NOT NULL DEFAULT 'legacy';
-- Required to allow the same procedure/type in independent tenant scopes.
ALTER TABLE el_links DROP CONSTRAINT IF EXISTS el_links_solution_id_type_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS el_links_solution_type_scope ON el_links(solution_id,type_id,scope_key);
ALTER TABLE el_evaluations ADD COLUMN IF NOT EXISTS request_fingerprint text;
ALTER TABLE el_evaluations ADD COLUMN IF NOT EXISTS evaluated_type_name text;
ALTER TABLE el_evaluations ADD COLUMN IF NOT EXISTS corrective_solution_id uuid REFERENCES el_solutions(id);
CREATE TABLE IF NOT EXISTS el_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 occurrence_id uuid NOT NULL REFERENCES el_occurrences(id),
 solution_id uuid NOT NULL REFERENCES el_solutions(id),
 user_id uuid NOT NULL REFERENCES el_users(id),
 type_id uuid REFERENCES el_types(id),
 type_name text,
 comment text NOT NULL DEFAULT '',
 resolved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS el_applications_occurrence ON el_applications(occurrence_id,created_at);
-- No data backfill: unknown tenant/classification snapshots must not be invented.