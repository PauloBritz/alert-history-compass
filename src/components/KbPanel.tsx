import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, ChevronDown, Loader2, Plus, ThumbsDown, ThumbsUp, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { buscarKb, salvarSolucao, taxaSucesso, votar, type KbSolucao } from "@/lib/kb";

export function KbPanel({ evento, refreshKey }: { evento: string; refreshKey: number }) {
  const [itens, setItens] = useState<KbSolucao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    try { setErro(null); setItens(await buscarKb(evento)); }
    catch (e) { setErro((e as Error).message); setItens([]); }
  }, [evento]);
  useEffect(() => { setItens(null); carregar(); }, [carregar, refreshKey]);

  return (
    <section className="mt-6 rounded-2xl border border-primary/30 bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary"><BookOpenCheck className="size-5" /></div>
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-primary">Base de conhecimento</div>
          <h2 className="text-lg font-semibold">Soluções recomendadas para este evento</h2>
        </div>
        <button onClick={() => setNovo(!novo)} className="ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
          <Plus className="size-4" /> Cadastrar solução
        </button>
      </div>

      {novo && <NovaSolucao evento={evento} onSaved={() => { setNovo(false); carregar(); }} />}

      <div className="mt-4 space-y-3">
        {itens === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Consultando a base…</div>
        ) : erro ? (
          <p className="text-sm text-destructive">Não foi possível consultar a base: {erro}</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solução cadastrada para eventos parecidos. Salve a solução de um chamado abaixo ou cadastre uma nova.</p>
        ) : itens.map((s, i) => <KbItem key={s.id} s={s} evento={evento} destaque={i === 0} onChange={carregar} />)}
      </div>
    </section>
  );
}

function KbItem({ s, evento, destaque, onChange }: { s: KbSolucao; evento: string; destaque: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(destaque);
  const [falhou, setFalhou] = useState(false);
  const [busy, setBusy] = useState(false);
  const taxa = taxaSucesso(s.positivos, s.negativos);
  const total = s.positivos + s.negativos;
  const tone = taxa === null ? "text-muted-foreground" : taxa >= 75 ? "text-success" : taxa >= 50 ? "text-warning" : "text-destructive";

  async function positivo() {
    setBusy(true);
    try { await votar(s.id, true, evento); toast.success("Obrigado! A solução ganhou credibilidade."); onChange(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <article className={`rounded-xl border bg-surface ${destaque ? "border-primary/50 shadow-glow" : ""}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 p-4 text-left">
        <div className={`w-16 shrink-0 text-center ${tone}`}>
          <div className="font-mono text-2xl font-semibold">{taxa === null ? "—" : `${taxa}%`}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">sucesso</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {destaque && <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-primary">RECOMENDADA</span>}
            <span className="font-mono text-muted-foreground">{Math.round(s.similaridade * 100)}% parecido</span>
            {s.ticket_numero && <span className="font-mono text-muted-foreground">#{s.ticket_numero}</span>}
          </div>
          <h3 className="mt-1 truncate font-medium">{s.evento}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="size-3" />
            {total === 0 ? "Ainda não testada por nenhum analista."
              : s.positivos_30d > 0 ? `Aplicada com sucesso ${s.positivos_30d} vez(es) nos últimos 30 dias · ${s.positivos}👍 ${s.negativos}👎 no total`
              : `Testada ${total} vez(es): ${s.positivos} funcionou, ${s.negativos} não funcionou`}
          </p>
          {!open && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{s.solucao.replace(/\s+/g, " ")}</p>}
        </div>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t p-4">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-sans text-sm leading-relaxed">{s.solucao}</pre>
          {s.autor && <p className="text-xs text-muted-foreground">Registrada por {s.autor}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Aplicou esta solução? Funcionou?</span>
            <button disabled={busy} onClick={positivo} aria-label="Funcionou"
              className="inline-flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-sm text-success hover:bg-success/20 disabled:opacity-50">
              <ThumbsUp className="size-4" /> Funcionou
            </button>
            <button disabled={busy} onClick={() => setFalhou(!falhou)} aria-label="Não funcionou"
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20 disabled:opacity-50">
              <ThumbsDown className="size-4" /> Não funcionou
            </button>
          </div>
          {falhou && <SolucaoCorreta s={s} evento={evento} onDone={() => { setFalhou(false); onChange(); }} />}
        </div>
      )}
    </article>
  );
}

function SolucaoCorreta({ s, evento, onDone }: { s: KbSolucao; evento: string; onDone: () => void }) {
  const [texto, setTexto] = useState("");
  const [autor, setAutor] = useState("");
  const [busy, setBusy] = useState(false);
  async function enviar() {
    if (texto.trim().length < 5) { toast.error("Descreva a solução que resolveu o problema."); return; }
    setBusy(true);
    try {
      await votar(s.id, false, evento, texto.trim());
      await salvarSolucao({ evento, solucao: texto.trim(), autor: autor.trim() || null, origem: "analista" });
      toast.success("Nova solução adicionada à base de conhecimento.");
      onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-lg border border-destructive/30 bg-background p-3">
      <p className="text-sm font-medium">Qual foi a solução correta?</p>
      <p className="text-xs text-muted-foreground">Ela será adicionada à base para este evento.</p>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} placeholder="Ações realizadas, causa encontrada, validação…"
        className="mt-2 w-full rounded-lg border bg-surface p-3 text-sm outline-none focus:shadow-glow" />
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={autor} onChange={(e) => setAutor(e.target.value)} placeholder="Seu nome (opcional)"
          className="h-9 flex-1 rounded-lg border bg-surface px-3 text-sm outline-none" />
        <button disabled={busy} onClick={enviar} className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Salvando…" : "Registrar solução"}
        </button>
      </div>
    </div>
  );
}

function NovaSolucao({ evento, onSaved }: { evento: string; onSaved: () => void }) {
  const [ev, setEv] = useState(evento);
  const [texto, setTexto] = useState("");
  const [autor, setAutor] = useState("");
  const [busy, setBusy] = useState(false);
  async function salvar() {
    if (ev.trim().length < 3 || texto.trim().length < 5) { toast.error("Preencha o evento e a solução."); return; }
    setBusy(true);
    try { await salvarSolucao({ evento: ev.trim(), solucao: texto.trim(), autor: autor.trim() || null, origem: "analista" }); toast.success("Solução cadastrada"); onSaved(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="mt-4 space-y-2 rounded-xl border bg-background p-4">
      <input value={ev} onChange={(e) => setEv(e.target.value)} className="h-10 w-full rounded-lg border bg-surface px-3 font-mono text-sm outline-none" placeholder="Nome do evento" />
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} placeholder="Solução aplicada"
        className="w-full rounded-lg border bg-surface p-3 text-sm outline-none focus:shadow-glow" />
      <div className="flex gap-2">
        <input value={autor} onChange={(e) => setAutor(e.target.value)} placeholder="Seu nome (opcional)" className="h-9 flex-1 rounded-lg border bg-surface px-3 text-sm outline-none" />
        <button disabled={busy} onClick={salvar} className="rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">Salvar</button>
      </div>
    </div>
  );
}
