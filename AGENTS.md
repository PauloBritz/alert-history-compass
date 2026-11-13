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
- Statistics are aggregated by solution/type link and immutable evaluation classification; legacy votes stay separate. Why: reclassification must not contaminate efficacy statistics.
- Export preserves the previous local Drizzle baseline; incremental SQL is applied by Python with an execution ledger. Why: this environment cannot generate custom local Drizzle ORM schemas; SQL migrations keep the required single Python data backend.
