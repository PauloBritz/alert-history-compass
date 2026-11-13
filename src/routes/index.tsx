import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, Clock, Copy, ExternalLink, FileJson,
  History, Loader2, Network, Repeat, Search, Server, Settings2, Sparkles, Tag, ThumbsDown, ThumbsUp, User, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { DEMOS, artigosDe, parseResultado, type Candidato, type Decisao, type Resultado } from "@/lib/otrs";
import { KnowledgeWorkspace, LocalLogin, SolutionRating, AdminSettings } from "@/components/KnowledgeWorkspace";
import { api, type Analyst, type Knowledge, type Occurrence, type Solution } from "@/lib/api";
import { Button } from "@/components/ui/button";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EventLens · Histórico OTRS para eventos de monitoramento" },
      { name: "description", content: "Encontre chamados OTRS parecidos com eventos do Zabbix e veja as soluções aplicadas." },
      { property: "og:title", content: "EventLens · Histórico OTRS" },
      { property: "og:description", content: "Análise de eventos de monitoramento com histórico de chamados e soluções." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const OTRS_BASE_DEFAULT = "https://centraldeservicos.interop.com.br/otrs/index.pl";

const DECISAO: Record<Decisao, { titulo: string; icon: typeof Repeat; tone: string; ring: string }> = {
  JA_EXISTE_ABERTO: { titulo: "Já existe chamado aberto", icon: AlertTriangle, tone: "text-destructive", ring: "border-destructive/50 bg-destructive/10" },
  RECORRENCIA: { titulo: "Evento recorrente", icon: Repeat, tone: "text-warning", ring: "border-warning/50 bg-warning/10" },
  REVISAR: { titulo: "Revisar relacionados", icon: Search, tone: "text-info", ring: "border-info/50 bg-info/10" },
  NOVO: { titulo: "Evento sem histórico", icon: Sparkles, tone: "text-success", ring: "border-success/50 bg-success/10" },
};

function Index() {
  const [data, setData] = useState<Resultado>({ evento: "", candidatos: [], palavras: [], pesos: {}, host: null, ips: [], categorias: [], periodo: {}, buscas_realizadas: [], chamados_encontrados: 0, chamados_analisados: 0, resumo: { mesmo_evento: 0, relacionados: 0, ainda_abertos: 0 }, decisao: "NOVO", mensagem: "" });
  const [texto, setTexto] = useState("");
  const [analyst, setAnalyst] = useState<Analyst | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [occurrence, setOccurrence] = useState<Occurrence | null>(null);
  const [otrsError, setOtrsError] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [otrsBase, setOtrsBase] = useState(OTRS_BASE_DEFAULT);
  const [panel, setPanel] = useState<null | "json" | "config">(null);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "abertos" | "duplicados">("todos");

  useEffect(() => {
    setApiUrl(localStorage.getItem("eventlens.api") ?? "");
    setOtrsBase(localStorage.getItem("eventlens.otrs") ?? OTRS_BASE_DEFAULT);
    void api<Analyst>("/auth/me").then(setAnalyst).catch(() => {});
  }, []);

  async function analisar() {
    if (!texto.trim()) return;
    if (!analyst) { toast.info("Entre na sua conta antes de analisar."); return; }
    setLoading(true); setOtrsError(""); setKnowledge(null); setOccurrence(null);
    try {
      const o = await api<Occurrence>("/occurrences", "POST", { title: texto });
      setOccurrence(o);
      const k = await api<Knowledge>(`/occurrences/${o.id}/recommendations`);
      setKnowledge(k);
      setData({ ...data, evento: o.original_title, candidatos: [], chamados_analisados: 0, chamados_encontrados: 0, resumo: { mesmo_evento: 0, relacionados: 0, ainda_abertos: 0 }, decisao: "NOVO", mensagem: "" });
      if (k.otrs_required) {
        try { const result = await api<Resultado>(`/occurrences/${o.id}/otrs`, "POST"); setData({ ...result, evento: o.original_title }); }
        catch (e) { setOtrsError((e as Error).message); }
      }
      toast.success("Consulta à base concluída");
    } catch (e) { toast.error((e as Error).message); } finally {
      setLoading(false);
    }
  }

  async function importar() {
    try {
      const d = parseResultado(raw);
      if (!analyst) throw new Error("Entre na sua conta antes de importar.");
      const o = await api<Occurrence>("/occurrences", "POST", { title: d.evento });
      setOccurrence(o); setKnowledge(await api<Knowledge>(`/occurrences/${o.id}/recommendations`));
      setData(d); setTexto(d.evento); setPanel(null); setRaw("");
      toast.success("JSON importado");
    } catch (e) { toast.error((e as Error).message); }
  }

  const candidatos = useMemo(() => data.candidatos.filter((c) =>
    filtro === "abertos" ? c.aberto : filtro === "duplicados" ? c.classe === "PROVAVEL_DUPLICADO" : true), [data, filtro]);

  const [kbKey, setKbKey] = useState(0);

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" />
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-glow">
            <Activity className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">EventLens</div>
            <div className="font-mono text-[11px] text-muted-foreground">OTRS · histórico de chamados</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs text-muted-foreground sm:flex">
              <span className={`size-2 rounded-full ${apiUrl ? "bg-success pulse-dot text-success" : "bg-muted-foreground"}`} />
              {analyst ? analyst.username : "Não autenticado"}
            </span>
            {analyst && <Button variant="ghost" onClick={async () => { await api("/auth/logout", "POST"); setAnalyst(null); setKnowledge(null); setOccurrence(null); }}>Sair</Button>}
            <HeaderBtn onClick={() => setPanel(panel === "json" ? null : "json")} icon={FileJson}>Importar JSON</HeaderBtn>
            <HeaderBtn onClick={() => setPanel(panel === "config" ? null : "config")} icon={Settings2}>Config</HeaderBtn>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Busca */}
        <section className="grid-bg rounded-2xl border bg-surface p-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Evento de monitoramento</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Já vimos esse problema antes?</h1>
          <form onSubmit={(e) => { e.preventDefault(); analisar(); }} className="mt-5 flex flex-col gap-3 md:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-xl border bg-background px-4 focus-within:shadow-glow">
              <Search className="size-4 text-muted-foreground" />
              <input value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder='Cole o evento do Zabbix, ex.: "Badesul - Host SRV01 is Down"'
                className="h-12 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground" />
            </div>
            <Button disabled={loading} type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Analisar
            </Button>
          </form>


          {panel === "json" && (
            <div className="mt-5 rounded-xl border bg-background p-4">
              <p className="text-sm text-muted-foreground">Cole a saída de <code className="font-mono text-primary">python api_otrs_consulta_3.py evento "..." --json</code></p>
              <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8}
                className="mt-3 w-full rounded-lg border bg-surface p-3 font-mono text-xs outline-none focus:shadow-glow" placeholder='{ "evento": "...", "candidatos": [...] }' />
              <div className="mt-3 flex justify-end gap-2">
                <label className="cursor-pointer rounded-lg border px-4 py-2 text-sm hover:bg-accent">
                  Abrir arquivo
                  <input type="file" accept=".json,.txt" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRaw(await f.text()); }} />
                </label>
                <button onClick={importar} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Carregar</button>
              </div>
            </div>
          )}
          {panel === "config" && (
            <div className="mt-5 grid gap-4 rounded-xl border bg-background p-4 md:grid-cols-2">
              <Field label="URL do backend Python" value={apiUrl}
                onChange={(v) => { setApiUrl(v); localStorage.setItem("eventlens.api", v); }} />
              <Field label="Endereço do OTRS (links dos chamados)" value={otrsBase}
                onChange={(v) => { setOtrsBase(v); localStorage.setItem("eventlens.otrs", v); }} />
{analyst?.role === "admin" && <div className="md:col-span-2"><AdminSettings /></div>}
            </div>
          )}
        </section>

        {!analyst && <LocalLogin onLogin={setAnalyst} />}
        {knowledge && <KnowledgeWorkspace initial={knowledge} onOccurrence={setOccurrence} refreshKey={kbKey} />}
        {otrsError && <p className="mt-4 text-sm text-warning">{otrsError}</p>}
        {knowledge && <p className="mt-3 text-sm text-muted-foreground">{knowledge.otrs_required ? "Valide as soluções recomendadas e os procedimentos históricos. Caso nenhuma seja útil, cadastre a solução aplicada." : "Soluções da KB atendem aos critérios de confiança configurados."}</p>}
        {data.evento && !otrsError && data.candidatos.length > 0 && <Decision data={data} />}
        {data.evento && <>

        {/* KPIs */}
        <section className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi icon={History} label="Chamados analisados" value={data.chamados_analisados} />
          <Kpi icon={Repeat} label="Provável mesmo evento" value={data.resumo.mesmo_evento} tone="text-warning" />
          <Kpi icon={Network} label="Relacionados" value={data.resumo.relacionados} tone="text-info" />
          <Kpi icon={AlertTriangle} label="Ainda abertos" value={data.resumo.ainda_abertos} tone="text-destructive" />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <EventPanel data={data} />

          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Procedimentos históricos do OTRS <span className="font-mono text-sm text-muted-foreground">({candidatos.length})</span></h2>
              <div className="flex rounded-lg border p-1 text-xs">
                {(["todos", "duplicados", "abertos"] as const).map((f) => (
                  <button key={f} onClick={() => setFiltro(f)}
                    className={`rounded-md px-3 py-1.5 capitalize transition ${filtro === f ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
                ))}
              </div>
            </div>
            {candidatos.length === 0 ? (
              <div className="grid place-items-center rounded-2xl border border-dashed p-12 text-center">
                <CheckCircle2 className="size-10 text-success" />
                <p className="mt-3 font-medium">Nenhum chamado parecido</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Tente ampliar o período com <code className="font-mono">--days</code> ou baixar o <code className="font-mono">--min-score</code>.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidatos.map((c, i) => <TicketCard key={c.ticket_id} c={c} otrsBase={otrsBase} defaultOpen={i === 0} feedback={true} occurrenceId={occurrence?.id ?? null} evento={data.evento} onSaved={() => setKbKey((k) => k + 1)} />)}
              </div>
            )}

          </section>
        </div>
        </>}
      </main>
    </div>
  );
}

function HeaderBtn({ onClick, icon: Icon, children }: { onClick: () => void; icon: typeof Search; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground">
      <Icon className="size-4" /><span className="hidden sm:inline">{children}</span>
    </button>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-lg border bg-surface px-3 font-mono text-sm text-foreground outline-none focus:shadow-glow" />
    </label>
  );
}

function Decision({ data }: { data: Resultado }) {
  const d = DECISAO[data.decisao] ?? DECISAO.REVISAR;
  const Icon = d.icon;
  return (
    <section className={`mt-6 flex items-start gap-4 rounded-2xl border p-5 ${d.ring}`}>
      <div className={`grid size-11 shrink-0 place-items-center rounded-xl bg-background ${d.tone}`}><Icon className="size-5" /></div>
      <div>
        <div className={`font-mono text-xs uppercase tracking-widest ${d.tone}`}>Recomendação</div>
        <div className="text-xl font-semibold">{d.titulo}</div>
        <p className="mt-1 text-sm text-muted-foreground">{data.decisao === "NOVO" ? "Nenhum chamado parecido no período. Valide se alguma das soluções recomendadas abaixo pode solucionar este evento. Caso nenhuma seja útil, clique em ‘+ Cadastrar solução’ e registre a solução aplicada ao final do atendimento." : data.mensagem}</p>
      </div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, tone = "text-primary" }: { icon: typeof Search; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <Icon className={`size-4 ${tone}`} />
      <div className="mt-3 font-mono text-3xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function EventPanel({ data }: { data: Resultado }) {
  const max = Math.max(1, ...Object.values(data.pesos));
  return (
    <aside className="h-fit space-y-5 rounded-2xl border bg-card p-5 lg:sticky lg:top-20">
      <div>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Evento</div>
        <div className="mt-1 break-words font-mono text-sm text-primary">{data.evento}</div>
      </div>
      <div>
        <div className="mb-2 text-xs text-muted-foreground">Palavras-chave e peso</div>
        <div className="space-y-2">
          {data.palavras.map((p) => (
            <div key={p}>
              <div className="flex justify-between font-mono text-xs"><span>{p}</span><span className="text-muted-foreground">{(data.pesos[p] ?? 1).toFixed(2)}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((data.pesos[p] ?? 1) / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <dl className="space-y-3 text-sm">
        <Info icon={Server} label="Host" value={data.host || "—"} />
        <Info icon={Network} label="IPs" value={data.ips.length ? data.ips.join(", ") : "—"} />
        <Info icon={Clock} label="Período" value={`${data.periodo.desde ?? "?"} → ${data.periodo.ate ?? "agora"}`} />
      </dl>
      <div>
        <div className="mb-2 text-xs text-muted-foreground">Tipo de problema</div>
        <div className="flex flex-wrap gap-1.5">
          {data.categorias.length ? data.categorias.map((c) => (
            <span key={c} className="rounded-md bg-warning/15 px-2 py-0.5 font-mono text-xs text-warning">{c}</span>
          )) : <span className="text-xs text-muted-foreground">não identificado</span>}
        </div>
      </div>
      <div className="border-t pt-4 font-mono text-[11px] text-muted-foreground">
        {data.buscas_realizadas.length} busca(s) · {data.chamados_encontrados} encontrado(s)
      </div>
    </aside>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Search; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-mono text-xs">{value}</dd></div>
    </div>
  );
}

function ScoreRing({ score, tone }: { score: number; tone: string }) {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <div className={`relative size-14 shrink-0 ${tone}`}>
      <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(score, 100) / 100)} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-sm font-semibold text-foreground">{score}</span>
    </div>
  );
}

function FeedbackTicket({ c, oid, solucao, autor, articleId, sourceDate, onSaved }: { c: Candidato; oid: string; solucao: string; autor: string; articleId?: string; sourceDate: string; onSaved: () => void }) {
  const [solution, setSolution] = useState<Solution | null>(null);
  async function save() {
    try {
      const r = await api<{id: string}>(`/occurrences/${oid}/solutions`, "POST", { procedure: solucao, source: { ticket_number: c.numero, article_id: articleId ?? null, ticket_title: c.titulo, author: autor, source_date: sourceDate, content: solucao, metadata: c } });
      const k = await api<Knowledge>(`/occurrences/${oid}/recommendations`);
      setSolution(k.solutions.find(s => s.id === r.id) ?? null); onSaved();
    } catch (e) { toast.error((e as Error).message); }
  }
  return solution ? <SolutionRating oid={oid} solution={solution} onSaved={async () => { const k = await api<Knowledge>(`/occurrences/${oid}/recommendations`); setSolution(k.solutions.find(s => s.id === solution.id) ?? null); onSaved(); }} /> : <div className="border-t p-4"><p className="mb-2 text-xs text-muted-foreground">AINDA NÃO VALIDADA para o tipo de evento atual</p><Button variant="outline" onClick={save}><PlusIcon /> Salvar na KB e avaliar</Button></div>;
}
function PlusIcon() { return <Wrench className="size-4" />; }

function TicketCard({ c, otrsBase, defaultOpen, feedback, occurrenceId, evento, onSaved }: { c: Candidato; otrsBase: string; defaultOpen: boolean; feedback?: boolean; occurrenceId: string | null; evento: string; onSaved: () => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const artigos = artigosDe(c);
  const resumo = artigos[artigos.length - 1]?.texto.replace(/\s+/g, " ");
  async function salvarNaBase(texto: string, autor: string) {
    try {
      if (!occurrenceId) throw new Error("Analise o evento antes de salvar.");
      await api(`/occurrences/${occurrenceId}/solutions`, "POST", { procedure: texto, source: { ticket_number: c.numero, ticket_title: c.titulo, author: autor, content: texto, metadata: c } });
      toast.success("Solução salva na base de conhecimento"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
  }
  const dup = c.classe === "PROVAVEL_DUPLICADO";
  const tone = dup ? "text-warning" : c.classe === "RELACIONADO" ? "text-info" : "text-muted-foreground";
  const link = `${otrsBase}?Action=AgentTicketZoom;TicketID=${c.ticket_id}`;
  return (
    <article className={`rounded-2xl border bg-card transition hover:border-primary/40 ${c.aberto ? "border-destructive/40" : ""}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-4 p-4 text-left">
        <ScoreRing score={c.score} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-md px-2 py-0.5 font-mono font-medium ${dup ? "bg-warning/15 text-warning" : "bg-info/15 text-info"}`}>
              {dup ? "MUITO PARECIDO" : "RELACIONADO"}
            </span>
            <span className={`rounded-md px-2 py-0.5 font-mono ${c.aberto ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
              {c.aberto ? "ABERTO" : "ENCERRADO"}
            </span>
            <span className="font-mono text-muted-foreground">#{c.numero}</span>
          </div>
          <h3 className="mt-1.5 truncate font-medium">{c.titulo}</h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><User className="size-3" />{c.dono || "—"}</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-3" />{c.criado}</span>
            {c.duracao && <span className="inline-flex items-center gap-1"><History className="size-3" />{c.duracao}</span>}
          </div>
          {resumo && (
            <p className="mt-2 line-clamp-2 rounded-md border-l-2 border-primary bg-surface px-2 py-1 text-xs text-muted-foreground">
              <Wrench className="mr-1 inline size-3 text-primary" />{resumo}
            </p>
          )}
        </div>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {feedback && occurrenceId && artigos.length > 0 && artigos.map((n, i) => <FeedbackTicket key={`${occurrenceId}-${c.numero}-${i}`} c={c} oid={occurrenceId} solucao={n.texto} autor={n.autor} sourceDate={n.criado} {...(n.id ? { articleId: n.id } : {})} onSaved={onSaved} />)}
      {open && (
        <div className="space-y-4 border-t p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <Mini label="Estado" value={c.estado} />
            <Mini label="Fila" value={c.fila || "—"} />
            <Mini label="Cliente" value={c.cliente || "—"} />
            <Mini label="Encerramento" value={c.tipo_encerramento || "—"} />
            <Mini label="Causa" value={c.causa || "—"} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {c.palavras_iguais.map((p) => <Chip key={p} cls="bg-success/15 text-success">✓ {p}</Chip>)}
            {c.palavras_parecidas.map((p) => <Chip key={p} cls="bg-warning/15 text-warning">≈ {p}</Chip>)}
            {c.palavras_faltando.map((p) => <Chip key={p} cls="bg-muted text-muted-foreground line-through">{p}</Chip>)}
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {c.motivos.map((m) => <li key={m} className="flex gap-2"><Tag className="mt-0.5 size-3 shrink-0" />{m}</li>)}
          </ul>
          {artigos.length > 0 && (
            <div className="text-xs font-medium text-primary">Solução aplicada{c.solucao?.origem ? ` · ${c.solucao.origem}` : ""}</div>
          )}
          {artigos.map((n, i) => (
            <div key={i} className="rounded-xl border-l-2 border-primary bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <Wrench className="size-3 text-primary" />{n.autor} · {n.criado}
                <button onClick={() => salvarNaBase(n.texto, n.autor.split(" via ")[0] ?? n.autor)}
                  className="ml-auto rounded-md border px-2 py-0.5 font-sans text-xs text-foreground hover:border-primary hover:text-primary">
                  Salvar na base
                </button>
              </div>
              {"assunto" in n && n.assunto && <div className="mt-1 text-xs text-muted-foreground">{n.assunto}</div>}
              <p className="mt-2 max-h-80 overflow-auto whitespace-pre-line text-sm">{n.texto}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              Abrir no OTRS <ExternalLink className="size-3.5" />
            </a>
            <button onClick={() => { navigator.clipboard.writeText(c.numero); toast.success("Número copiado"); }}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
              <Copy className="size-3.5" /> Copiar nº
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface p-2.5"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-0.5 text-sm">{value}</div></div>;
}
function Chip({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`rounded-md px-2 py-0.5 font-mono text-xs ${cls}`}>{children}</span>;
}
