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
  const sql = pg();
  if (sql) return sql`select * from kb_buscar(${texto}, 10)`;
  const { data, error } = await (await cloud()).rpc("kb_buscar", { _texto: texto, _limite: 10 });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function dbSalvarSolucao(s: { evento: string; solucao: string; ticket_numero: string | null; autor: string | null; origem: string }) {
  const sql = pg();
  try {
    if (sql) {
      const [r] = await sql<Row[]>`insert into kb_solucoes (evento, solucao, ticket_numero, autor, origem)
        values (${s.evento}, ${s.solucao}, ${s.ticket_numero}, ${s.autor}, ${s.origem}) returning id`;
      return r!.id;
    }
    const { data, error } = await (await cloud()).from("kb_solucoes").insert(s).select("id").single();
    if (error) throw error;
    return data.id;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new Error("Esta solução já está na base para este evento.");
    throw new Error((e as Error).message);
  }
}

export async function dbRegistrarEvento(evento: string) {
  const sql = pg();
  if (sql) {
    const [ex] = await sql<Row[]>`select id from kb_eventos where lower(evento) = lower(${evento}) and status = 'aguardando_solucao' limit 1`;
    if (ex) return ex.id as string;
    const [r] = await sql<Row[]>`insert into kb_eventos (evento) values (${evento}) returning id`;
    return r!.id;
  }
  const db = await cloud();
  const { data: ex } = await db.from("kb_eventos").select("id").ilike("evento", evento).eq("status", "aguardando_solucao").limit(1).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await db.from("kb_eventos").insert({ evento }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function dbResolverEvento(id: string, solucao_id: string) {
  const sql = pg();
  if (sql) {
    await sql`update kb_eventos set status = 'resolvido', solucao_id = ${solucao_id}, resolvido_em = now() where id = ${id}`;
    return;
  }
  const { error } = await (await cloud()).from("kb_eventos")
    .update({ status: "resolvido", solucao_id, resolvido_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function dbSolucaoDoTicket(ticket: string) {
  const sql = pg();
  let id: string | undefined;
  let votos: { positivo: boolean; created_at: string | Date }[] = [];
  if (sql) {
    const [s] = await sql<Row[]>`select id from kb_solucoes where ticket_numero = ${ticket} order by created_at limit 1`;
    if (!s) return null;
    id = s.id;
    votos = (await sql`select positivo, created_at from kb_votos where solucao_id = ${s.id}`) as unknown as typeof votos;
  } else {
    const db = await cloud();
    const { data } = await db.from("kb_solucoes").select("id").eq("ticket_numero", ticket).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!data) return null;
    id = data.id;
    votos = (await db.from("kb_votos").select("positivo, created_at").eq("solucao_id", data.id)).data ?? [];
  }
  const limite = Date.now() - 30 * 864e5;
  return {
    id: id!,
    stats: {
      positivos: votos.filter((x) => x.positivo).length,
      negativos: votos.filter((x) => !x.positivo).length,
      positivos_30d: votos.filter((x) => x.positivo && new Date(x.created_at).getTime() >= limite).length,
    },
  };
}

export async function dbVotar(solucao_id: string, positivo: boolean, evento: string, comentario: string | null) {
  const sql = pg();
  if (sql) {
    await sql`insert into kb_votos (solucao_id, positivo, evento, comentario) values (${solucao_id}, ${positivo}, ${evento}, ${comentario})`;
    return;
  }
  const { error } = await (await cloud()).from("kb_votos").insert({ solucao_id, positivo, evento, comentario });
  if (error) throw new Error(error.message);
}
