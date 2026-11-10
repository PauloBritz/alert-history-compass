// Camada de dados da KB: somente PostgreSQL local (variável DATABASE_URL).
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
type Row = { id: string };
let _sql: Sql | undefined;
function pg(): Sql {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error("DATABASE_URL não configurada. Aponte para o seu PostgreSQL local.");
  if (!_sql) _sql = postgres(url, { max: 5, idle_timeout: 20 });
  return _sql;
}

export async function dbBuscar(texto: string) {
  return pg()`select * from kb_buscar(${texto}, 10)`;
}

export async function dbSalvarSolucao(s: { evento: string; solucao: string; ticket_numero: string | null; autor: string | null; origem: string }) {
  try {
    const [r] = await pg()<Row[]>`insert into kb_solucoes (evento, solucao, ticket_numero, autor, origem)
      values (${s.evento}, ${s.solucao}, ${s.ticket_numero}, ${s.autor}, ${s.origem}) returning id`;
    return r!.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new Error("Esta solução já está na base para este evento.");
    throw new Error((e as Error).message);
  }
}

export async function dbRegistrarEvento(evento: string) {
  const sql = pg();
  const [ex] = await sql<Row[]>`select id from kb_eventos where lower(evento) = lower(${evento}) and status = 'aguardando_solucao' limit 1`;
  if (ex) return ex.id;
  const [r] = await sql<Row[]>`insert into kb_eventos (evento) values (${evento}) returning id`;
  return r!.id;
}

export async function dbResolverEvento(id: string, solucao_id: string) {
  await pg()`update kb_eventos set status = 'resolvido', solucao_id = ${solucao_id}, resolvido_em = now() where id = ${id}`;
}

export async function dbSolucaoDoTicket(ticket: string) {
  const sql = pg();
  const [s] = await sql<Row[]>`select id from kb_solucoes where ticket_numero = ${ticket} order by created_at limit 1`;
  if (!s) return null;
  const votos = (await sql`select positivo, created_at from kb_votos where solucao_id = ${s.id}`) as unknown as { positivo: boolean; created_at: string | Date }[];
  const limite = Date.now() - 30 * 864e5;
  return {
    id: s.id,
    stats: {
      positivos: votos.filter((x) => x.positivo).length,
      negativos: votos.filter((x) => !x.positivo).length,
      positivos_30d: votos.filter((x) => x.positivo && new Date(x.created_at).getTime() >= limite).length,
    },
  };
}

export async function dbVotar(solucao_id: string, positivo: boolean, evento: string, comentario: string | null) {
  await pg()`insert into kb_votos (solucao_id, positivo, evento, comentario) values (${solucao_id}, ${positivo}, ${evento}, ${comentario})`;
}
