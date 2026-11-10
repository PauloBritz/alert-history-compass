# EventLens em VM Linux (100% local, sem nuvem)

Tudo roda na sua rede: PostgreSQL 16 + pgvector (busca vetorial para RAG) e o EventLens em Node.js.
Todas as ferramentas são gratuitas e open source.

## Opção A — Docker (recomendado)
```bash
sudo apt install -y docker.io docker-compose-plugin
cd eventlens/deploy
export DB_PASSWORD='uma-senha-forte'
sudo -E docker compose up -d --build
```
Acesse `http://IP-DA-VM:3000`. O banco é criado automaticamente com `init.sql`.

## Opção B — Sem Docker
```bash
# PostgreSQL + pgvector
sudo apt install -y postgresql postgresql-16-pgvector   # ou postgresql-<versão>-pgvector
sudo -u postgres psql -c "CREATE USER eventlens WITH PASSWORD 'uma-senha-forte';"
sudo -u postgres psql -c "CREATE DATABASE eventlens OWNER eventlens;"
sudo -u postgres psql -d eventlens -c "CREATE EXTENSION vector; CREATE EXTENSION pg_trgm; CREATE EXTENSION pgcrypto;"
psql "postgres://eventlens:uma-senha-forte@localhost/eventlens" -f deploy/init.sql

# Aplicação (Node 20+ e Bun)
curl -fsSL https://bun.sh/install | bash
bun install
NITRO_PRESET=node-server bun run build
DATABASE_URL=postgres://eventlens:uma-senha-forte@localhost:5432/eventlens PORT=3000 node .output/server/index.mjs
```
Para manter rodando, crie um serviço systemd com o comando acima.

## Variáveis
- `DATABASE_URL` — obrigatória no ambiente local. Com ela definida, o app usa somente o seu PostgreSQL.
- `PORT` — porta HTTP (padrão 3000).

## Script do OTRS
Continue rodando `python api_eventlens.py` na VM e, em "Config" no EventLens, informe `http://IP-DA-VM:8000`.

## Migrar dados já cadastrados
Exporte as tabelas `kb_solucoes`, `kb_votos` e `kb_eventos` em CSV pelo painel do Lovable e importe:
```bash
psql "$DATABASE_URL" -c "\copy kb_solucoes(id,evento,solucao,ticket_numero,autor,origem,created_at) FROM 'kb_solucoes.csv' CSV HEADER"
```
