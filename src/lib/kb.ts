import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase.rpc("kb_buscar", { _texto: texto, _limite: 10 });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, positivos: Number(r.positivos), negativos: Number(r.negativos), positivos_30d: Number(r.positivos_30d) })) as KbSolucao[];
}

export async function salvarSolucao(s: { evento: string; solucao: string; ticket_numero?: string | null; autor?: string | null; origem?: string }) {
  const { data, error } = await supabase.from("kb_solucoes").insert(s).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("Esta solução já está na base para este evento.");
    throw error;
  }
  return data.id as string;
}

export async function votar(solucao_id: string, positivo: boolean, evento: string, comentario?: string) {
  const { error } = await supabase.from("kb_votos").insert({ solucao_id, positivo, evento, comentario: comentario ?? null });
  if (error) throw error;
}
