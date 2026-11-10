import { fnBuscar, fnRegistrarEvento, fnResolverEvento, fnSalvar, fnSolucaoDoTicket, fnVotar } from "./kb.functions";

export interface KbSolucao {
  id: string; evento: string; solucao: string; ticket_numero: string | null; autor: string | null;
  origem: string; created_at: string; similaridade: number;
  positivos: number; negativos: number; positivos_30d: number;
}

/** Taxa de sucesso em % (null se nunca testada). */
export function taxaSucesso(pos: number, neg: number): number | null {
  const t = pos + neg;
  return t === 0 ? null : Math.round((pos / t) * 100);
}

export async function buscarKb(texto: string): Promise<KbSolucao[]> {
  const data = JSON.parse(await fnBuscar({ data: { texto } })) as Record<string, unknown>[];
  return data.map((r) => ({ ...r, similaridade: Number(r.similaridade), positivos: Number(r.positivos), negativos: Number(r.negativos), positivos_30d: Number(r.positivos_30d) })) as unknown as KbSolucao[];
}

export async function salvarSolucao(s: { evento: string; solucao: string; ticket_numero?: string | null; autor?: string | null; origem?: string }) {
  return fnSalvar({ data: s });
}

/** Registra um evento sem histórico (uma vez) e devolve o id do registro pendente. */
export async function registrarEventoNovo(evento: string): Promise<string> {
  return fnRegistrarEvento({ data: { evento } });
}

export async function resolverEvento(id: string, solucao_id: string) {
  await fnResolverEvento({ data: { id, solucao_id } });
}

export interface StatsSolucao { positivos: number; negativos: number; positivos_30d: number }

/** Busca a solução já salva na base para um chamado do OTRS (ou null). */
export async function solucaoDoTicket(ticket_numero: string): Promise<{ id: string; stats: StatsSolucao } | null> {
  return fnSolucaoDoTicket({ data: { ticket: ticket_numero } });
}

export async function votar(solucao_id: string, positivo: boolean, evento: string, comentario?: string) {
  await fnVotar({ data: { solucao_id, positivo, evento, comentario: comentario ?? null } });
}
