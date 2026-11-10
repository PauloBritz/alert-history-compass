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
- KB data is accessed only via server functions in src/lib/kb.functions.ts → src/lib/kb.db.server.ts, using the `postgres` driver when DATABASE_URL is set (self-hosted VM) and falling back to Lovable Cloud only for the hosted preview. Why: the app must run fully local with plain PostgreSQL; deploy/ holds init.sql, Docker and the local guide.
