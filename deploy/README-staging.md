# EventLens v2 — staging local

## Componentes
React/TanStack preservado; API Python/FastAPI; PostgreSQL/pgvector próprio; Psycopg 3. Nenhum serviço de nuvem é necessário em execução. As fontes estão empacotadas localmente. Downloads de pacotes/imagens só são necessários na preparação; para rede isolada, transfira imagens Docker e dependências previamente baixadas.

## Instalação sem Docker
1. Faça backup com `pg_dump` do banco atual antes de qualquer mudança.
2. Instale PostgreSQL 16 + pgvector, Node 20+, Bun e Python 3.12+.
3. Crie o banco e usuário local, configure `DATABASE_URL` **apenas no processo Python**.
4. Para banco antigo já criado, mantenha suas tabelas/migrations. Para novo banco, aplique `drizzle/migrations/0000_baseline.sql` com psql. Esse arquivo da versão local anterior foi preservado byte a byte, incluindo seu registro inicial existente; não foram inventados novos dados demonstrativos.
5. `python3 -m venv .venv && . .venv/bin/activate && pip install -r backend/requirements.txt`.
6. `python -m backend.manage migrate` aplica a evolução incremental e registra execução, preservando soluções, votos e eventos antigos. Soluções antigas são copiadas como legado sem inventar tipo; votos antigos não entram nas novas taxas.
7. `python -m backend.manage create-admin --username SEU_USUARIO`: a senha é pedida sem exibição (12+ caracteres).
8. `uvicorn backend.main:app --host 127.0.0.1 --port 8000`.
9. `bun install && bun run build`; `PORT=3000 HOST=127.0.0.1 node .output/server/index.mjs`.
10. Nginx na mesma origem: `/api/` encaminha à porta 8000 e `/` à 3000. Modelo em `deploy/nginx.conf`; use HTTPS com certificado interno. `COOKIE_SECURE=true` por padrão; `false` somente em staging HTTP isolado.

## Docker
Defina DB_PASSWORD (obrigatória) e rode `docker compose -f deploy/docker-compose.yml up -d --build`. API e banco não expõem portas. O proxy local expõe 3000. `docker compose -f deploy/docker-compose.yml exec api python -m backend.manage create-admin --username SEU_USUARIO` cria o administrador. O compose usa HTTP de staging; em produção configure HTTPS e COOKIE_SECURE=true. Execução Docker completa não foi testada neste ambiente.

## Ambiente da API
- DATABASE_URL: conexão ao PostgreSQL próprio, nunca VITE_.
- FRONTEND_ORIGINS: origens exatas autorizadas, separadas por vírgula; não usar `*`.
- COOKIE_SECURE: true em HTTPS.
- OTRS_SCRIPT: caminho absoluto para **seu motor oficial api_otrs_consulta.py**.
- OTRS_SOURCE_ID: identificador estável da instância OTRS, para deduplicar fontes.
O conector executa `python MOTOR evento TITULO --json`, sem shell, preservando o algoritmo. Monte a pasta contendo motor/configuração no container `/connector`, instale as dependências específicas do motor no Dockerfile-api. O motor oficial não foi anexado nesta solicitação: não foi reescrito, substituído nem simulado.

## Ambiente do frontend
VITE_API_URL opcional, padrão `/api`. Config permite alterar a URL HTTP da API e os links OTRS. Com mesmo domínio, cookies HTTP-only funcionam via proxy. Não coloque senhas, credenciais OTRS ou DATABASE_URL no frontend.

## Critérios de confiança
Um administrador define no painel Config mínimo de avaliações, percentual mínimo e limite inferior Wilson. Não foi inventado limiar padrão: enquanto não definido, OTRS é consultado complementarmente. KB continua visível mesmo se OTRS falhar. O percentual oficial usa uma casa decimal; ranking usa limite inferior Wilson 95% por solução/tipo.

## Testes
Use banco **exclusivo de testes**, nunca produção: a fixture limpa as entidades v2.
`DATABASE_URL=... COOKIE_SECURE=false python -m pytest backend/tests -q`
`bun run test`

## Migrations e limitação técnica
O baseline Drizzle anterior foi preservado. A evolução nova está em `backend/sql/001_knowledge.sql`, aplicada transacionalmente pelo Python com `el_migrations`. O frontend não usa Drizzle ORM nem PostgreSQL. A gestão/geração Drizzle Kit **das novas entidades** ficou pendente: não foram gerados novos modelos ORM/snapshots neste ambiente. Não rode db:generate antigo sobre o banco v2: o schema anterior não descreve as entidades novas. Esta diferença está explícita, não é simulada como concluída.
