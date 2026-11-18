<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Data layer
- Active KB UI accesses the standalone Python API through src/lib/api.ts; only backend/ uses Psycopg and DATABASE_URL. Why: database credentials and business rules must remain in the local Python service.
- Retired JavaScript KB panels and server wrappers are removed, while legacy SQL/data remain untouched. Why: prevent future reactivation of unscoped votes or implicit resolution outside the Python flow.
- Serialize link/recommendation creation with classification using occurrence row locks; reject applications on resolved occurrences. Why: preserve immutable historical context and settled incident state.
- Search/import responses are versioned, and article feedback refreshes with the workspace. Why: delayed responses and duplicate views must not show another occurrence or stale efficacy.
- Keep legacy percentage arithmetic in the browser-safe kb-statistics module, separate from retired database wrappers. Why: preserve existing arithmetic tests in the standalone Python-backed export without bundling a second data backend.
- Statistics are aggregated by solution/type link and immutable evaluation classification; legacy votes stay separate. Why: reclassification must not contaminate efficacy statistics.
- Occurrence identity uses scoped external IDs or contextual hashes, with browser session keys for context-free manual searches; never merge legacy rows by title. Why: repeated searches must recover history without crossing incident boundaries.
- Evaluation, knowledge registration and explicit application are distinct operations; only an application with resolved=true closes an occurrence. Why: negative feedback and a saved alternative are not proof of incident resolution.
- New efficacy links are scoped by tenant, environment, source and monitored system; evaluation retries use a transaction-level attempt lock and immutable request fingerprint. Why: prevent cross-client statistical leakage and duplicate feedback.
- Export preserves the previous local Drizzle baseline; incremental SQL is applied by Python with an execution ledger. Why: this environment cannot generate custom local Drizzle ORM schemas; SQL migrations keep the required single Python data backend.
