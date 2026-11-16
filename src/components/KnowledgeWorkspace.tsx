import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, History, Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api, type Analyst, type Knowledge, type Occurrence, type Solution, type EvaluationResult, type OccurrenceHistory } from '@/lib/api';

export function LocalLogin({ onLogin }: { onLogin: (user: Analyst) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  return <form className="mt-6 flex flex-wrap items-end gap-3 border-y py-5" onSubmit={async e => { e.preventDefault(); setBusy(true); try { onLogin(await api<Analyst>('/auth/login', 'POST', { username, password })); setPassword(''); } catch (error) { toast.error((error as Error).message); } finally { setBusy(false); } }}>
    <label className="text-sm">Usuário<input required autoComplete="username" aria-label="Usuário" value={username} onChange={e => setUsername(e.target.value)} className="mt-1 block rounded-lg border bg-surface p-2" /></label>
    <label className="text-sm">Senha<input required type="password" autoComplete="current-password" aria-label="Senha" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block rounded-lg border bg-surface p-2" /></label>
    <Button disabled={busy} type="submit">Entrar</Button>
  </form>;
}

export function KnowledgeWorkspace({ initial, onOccurrence, refreshKey }: { initial: Knowledge; onOccurrence: (occurrence: Occurrence) => void; refreshKey: number }) {
  const [knowledge, setKnowledge] = useState(initial); const [classification, setClassification] = useState(initial.occurrence.type_name || '');
  const [form, setForm] = useState(false); const [history, setHistory] = useState<OccurrenceHistory | null>(null);
  const [legacy, setLegacy] = useState<Array<{ id: string; procedure: string; original_event: string; author: string }> | null>(null);
  const oid = initial.occurrence.id;
  async function reload() { const k = await api<Knowledge>(`/occurrences/${oid}/recommendations`); setKnowledge(k); onOccurrence(k.occurrence); if (history) setHistory(await api<OccurrenceHistory>(`/occurrences/${oid}/history`)); }
  useEffect(() => { setKnowledge(initial); setClassification(initial.occurrence.type_name || ''); setHistory(null); setForm(false); }, [initial]);
  useEffect(() => { if (refreshKey) void reload().catch(e => toast.error(e.message)); }, [refreshKey]);
  return <section className="mt-6 space-y-4 border-y border-primary/30 py-5">
    <div className="flex flex-wrap items-center gap-3"><BookOpenCheck className="size-5 text-primary" /><h2 className="text-lg font-semibold">Base de conhecimento</h2><Button className="ml-auto shadow-glow" onClick={() => setForm(!form)}><Plus className="size-4" /> Cadastrar solução</Button><Button variant="outline" onClick={async () => { try { setHistory(await api<OccurrenceHistory>(`/occurrences/${oid}/history`)); } catch (e) { toast.error((e as Error).message); } }}><History className="size-4" /> Histórico</Button></div>
    <p className="break-words font-mono text-sm text-primary">{knowledge.occurrence.original_title}</p>
    <form className="flex flex-wrap items-center gap-2" onSubmit={async e => { e.preventDefault(); try { await api(`/occurrences/${oid}/classification`, 'PUT', { name: classification }); await reload(); } catch (e) { toast.error((e as Error).message); } }}>
      <label className="text-sm text-muted-foreground">Tipo técnico<input aria-label="Tipo técnico" required minLength={2} maxLength={100} value={classification} onChange={e => setClassification(e.target.value)} placeholder="Não classificado" className="ml-2 rounded-lg border bg-surface p-2 text-foreground" /></label><Button variant="outline" type="submit">Confirmar classificação</Button>
    </form>
    {!knowledge.occurrence.type_id && <p className="text-sm text-warning">Classificação pendente. Confirme o tipo técnico antes de cadastrar ou avaliar soluções.</p>}
    <Button variant="ghost" onClick={async () => { try { setLegacy(legacy ? null : await api('/legacy/solutions')); } catch (e) { toast.error((e as Error).message); } }}>Consultar soluções legadas</Button>
    {legacy && <div className="space-y-3 border-t pt-3">{legacy.map(s => <article key={s.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{s.original_event}</p><p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">{s.procedure}</p><Button variant="outline" disabled={!knowledge.occurrence.type_id} onClick={async () => { try { await api(`/occurrences/${oid}/legacy/${s.id}`, 'POST'); await reload(); toast.success('Solução associada sem transferir avaliações legadas.'); } catch (e) { toast.error((e as Error).message); } }}>Associar ao tipo atual</Button></article>)}</div>}
    {form && <AppliedForm oid={oid} classified={!!knowledge.occurrence.type_id} onSaved={() => { setForm(false); void reload().catch(e => toast.error(e.message)); }} />}
    {!knowledge.solutions.length && <p className="text-sm text-muted-foreground">Nenhuma solução associada a este tipo de evento. Valide os procedimentos históricos abaixo ou cadastre a solução aplicada.</p>}
    {knowledge.solutions.map((s, i) => <SolutionRating key={`${oid}-${s.id}`} oid={oid} solution={s} onSaved={reload} classified={!!knowledge.occurrence.type_id} applied={knowledge.occurrence.applied_solution_id === s.id} recommended={i === 0 && s.total > 0} />)}
    {history !== null && <HistoryView history={history} onClose={() => setHistory(null)} />}
  </section>;
}
function HistoryView({ history: h, onClose }: { history: OccurrenceHistory; onClose: () => void }) {
  return <div className="space-y-3 border-t pt-4">
    <div className="flex justify-between"><h3 className="font-semibold">Histórico da ocorrência</h3><Button variant="ghost" onClick={onClose}>Fechar</Button></div>
    <p className="break-words text-sm">{h.occurrence.original_title}</p>
    <p className="break-words text-xs text-muted-foreground">{h.occurrence.id} · {h.occurrence.status} · {h.occurrence.type_name || 'Não classificado'} · {h.occurrence.context?.tenant || 'Cliente não informado'} · {h.occurrence.context?.host || 'Host não informado'} · {h.occurrence.received_at}</p>
    <h4 className="text-sm font-medium">Recomendações</h4>{h.recommendations.map(r => <p key={r.id} className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{r.snapshot.procedure} · {r.recommended_type} · {r.created_at}</p>)}
    <h4 className="text-sm font-medium">Avaliações</h4>{h.evaluations.map(e => <div key={e.id} className="space-y-1 border-l pl-3 text-sm"><p className={e.positive ? 'text-success' : 'text-destructive'}>{e.positive ? 'Funcionou' : 'Não funcionou'} · {e.evaluated_type} · {e.username} · {e.created_at}</p><p className="whitespace-pre-wrap break-words">{e.procedure}</p>{e.comment && <p className="whitespace-pre-wrap break-words text-muted-foreground">Comentário: {e.comment}</p>}{e.corrective_procedure && <p className="whitespace-pre-wrap break-words">Procedimento corretivo cadastrado: {e.corrective_procedure}</p>}</div>)}
    <h4 className="text-sm font-medium">Soluções efetivamente aplicadas</h4>{h.applications.map(a => <p key={a.id} className="whitespace-pre-wrap break-words text-sm">{a.procedure} · {a.type_name} · {a.username} · {a.created_at} · {a.resolved ? 'Ocorrência resolvida' : 'Aplicação registrada'}{a.comment && ` · ${a.comment}`}</p>)}
    {!h.applications.length && <p className="whitespace-pre-wrap text-sm">{h.applied ? `${h.applied.procedure}\n${h.applied.author} · Registro anterior` : 'Ainda não registrada'}</p>}
    <h4 className="text-sm font-medium">Classificações e auditoria</h4>{h.audit.map(a => <p key={a.id} className="break-words text-xs text-muted-foreground">{a.action} · {a.username} · {a.created_at} · {JSON.stringify(a.details)}</p>)}
  </div>;
}
export function SolutionRating({ oid, solution: s, onSaved, recommended = false, classified = true, applied = false }: { oid: string; solution: Solution; onSaved: () => void | Promise<void>; recommended?: boolean; classified?: boolean; applied?: boolean }) {
  const [failed, setFailed] = useState(false); const [done, setDone] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [correct, setCorrect] = useState(''); const [comment, setComment] = useState(''); const [error, setError] = useState(''); const [application, setApplication] = useState(false); const [resolved, setResolved] = useState(false);
  const attempt = useRef<{ key: string; payload: string } | null>(null);
  useEffect(() => { attempt.current = null; setDone(null); setError(''); setFailed(false); }, [oid, s.id]);
  async function refresh() { try { await onSaved(); } catch (e) { toast.error(`Registro salvo, mas a atualização falhou: ${(e as Error).message}`); } }
  async function vote(positive: boolean) {
    if (!classified) { setError('Confirme o tipo do evento antes de avaliar'); return; }
    setBusy(true); setError('');
    const payload = { solution_id: s.id, positive, comment, ...(!positive && correct.trim() ? { correct_procedure: correct.trim() } : {}) };
    const serialized = JSON.stringify(payload);
    if (!attempt.current || attempt.current.payload !== serialized) attempt.current = { key: crypto.randomUUID(), payload: serialized };
    try {
      const result = await api<EvaluationResult>(`/occurrences/${oid}/evaluations`, 'POST', { ...payload, attempt_key: attempt.current.key });
      if (!result.id) throw new Error('A API não confirmou a avaliação.');
      setDone(positive); setFailed(false); toast.success('Avaliação registrada para este tipo de evento.'); await refresh();
    } catch (e) { setError((e as Error).message); toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <article className={`space-y-3 rounded-lg border p-4 ${recommended ? 'border-primary/50 bg-surface' : 'bg-card'}`}>
    <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-lg text-primary">{s.taxa_sucesso === null ? 'AINDA NÃO VALIDADA' : `${s.taxa_sucesso.toLocaleString('pt-BR')}% de sucesso`}</span>{recommended && <span className="text-xs text-success">RECOMENDADA</span>}{applied && <span className="text-xs text-info">APLICADA</span>}<span className="text-xs text-muted-foreground">{s.origin} · {s.author}</span></div>
    <p className="text-xs text-muted-foreground">{s.positivos} positivas · {s.negativos} negativas · {s.total} avaliações · Confiança Wilson: {(s.confidence * 100).toFixed(1)}%</p>
    <p className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{s.procedure}</p>
    {s.sources?.map((source, i) => <p key={`${source.ticket_number}-${i}`} className="text-xs text-muted-foreground">OTRS #{source.ticket_number} · {String(source.metadata['queue'] || '')} · {String(source.metadata['client'] || '')}</p>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!classified && <p className="text-sm text-warning">Confirme o tipo do evento antes de avaliar.</p>}
    {done !== null ? <div role="status" className={`flex flex-wrap items-center gap-2 text-sm ${done ? 'text-success' : 'text-destructive'}`}>Avaliação registrada: {done ? 'Funcionou' : 'Não funcionou'}<Button variant="outline" disabled={busy} onClick={() => { setDone(null); attempt.current = null; setCorrect(''); setComment(''); }}>Nova tentativa</Button></div> : <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !classified} onClick={() => vote(true)}><ThumbsUp className="size-4 text-success" /> Funcionou</Button><Button variant="outline" disabled={busy || !classified} onClick={() => setFailed(!failed)}><ThumbsDown className="size-4 text-destructive" /> Não funcionou</Button></div>}
    {failed && <form className="space-y-2" onSubmit={e => { e.preventDefault(); void vote(false); }}><label className="block text-sm">Procedimento corretivo (opcional)<textarea minLength={5} maxLength={20000} aria-label="Procedimento correto" value={correct} onChange={e => setCorrect(e.target.value)} className="mt-1 block w-full rounded-lg border bg-background p-3" rows={5} /></label><input maxLength={20000} value={comment} onChange={e => setComment(e.target.value)} aria-label="Comentário" placeholder="Comentário adicional" className="w-full rounded-lg border bg-background p-2" /><Button disabled={busy} type="submit" className="h-auto whitespace-normal text-left">Registrar avaliação negativa</Button></form>}
    <Button variant="ghost" disabled={busy || !classified} onClick={() => setApplication(!application)}>Registrar aplicação</Button>
    {application && <form className="space-y-2 border-t pt-3" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await api(`/occurrences/${oid}/applications`, 'POST', { solution_id: s.id, resolved }); setApplication(false); toast.success('Aplicação registrada.'); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resolved} onChange={e => setResolved(e.target.checked)} />Ocorrência resolvida</label><Button disabled={busy} type="submit">Confirmar aplicação</Button></form>}
  </article>;
}
function AppliedForm({ oid, onSaved, classified }: { oid: string; onSaved: () => void; classified: boolean }) {
  const [procedure, setProcedure] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="space-y-2 border-t pt-3" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await api(`/occurrences/${oid}/solutions`, 'POST', { procedure, applied: false }); onSaved(); toast.success('Solução cadastrada na KB.'); } catch (e) { setError((e as Error).message); toast.error((e as Error).message); } finally { setBusy(false); } }}><label className="block text-sm">Procedimento da solução<textarea required minLength={5} maxLength={20000} aria-label="Solução aplicada" value={procedure} onChange={e => setProcedure(e.target.value)} className="mt-2 w-full rounded-lg border bg-surface p-3" rows={5} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy || !classified} type="submit">Salvar na KB</Button></form>;
}
export function AdminSettings() {
  const [minimum, setMinimum] = useState(''); const [success, setSuccess] = useState(''); const [wilson, setWilson] = useState('');
  const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [role,setRole]=useState('analyst');
  return <div className="space-y-4 border-t pt-4"><form className="flex flex-wrap gap-2" onSubmit={async e => { e.preventDefault(); try { await api('/settings/confidence','PUT',{min_evaluations:Number(minimum),min_success:Number(success),wilson_lower:Number(wilson)});toast.success('Critérios de confiança salvos.'); } catch(e){toast.error((e as Error).message);} }}><label className="text-xs">Mínimo de avaliações<input required type="number" min={1} value={minimum} onChange={e=>setMinimum(e.target.value)} className="block w-36 rounded-lg border bg-surface p-2" /></label><label className="text-xs">Sucesso mínimo (%)<input required type="number" min={0} max={100} step="0.1" value={success} onChange={e=>setSuccess(e.target.value)} className="block w-36 rounded-lg border bg-surface p-2" /></label><label className="text-xs">Limite Wilson (0–1)<input required type="number" min={0} max={1} step="0.01" value={wilson} onChange={e=>setWilson(e.target.value)} className="block w-36 rounded-lg border bg-surface p-2" /></label><Button type="submit">Salvar critérios</Button></form><form className="flex flex-wrap gap-2" onSubmit={async e=>{e.preventDefault();try{await api('/users','POST',{username,password,role});setPassword('');toast.success('Usuário criado.');}catch(e){toast.error((e as Error).message);}}}><input required aria-label="Novo usuário" placeholder="Novo usuário" value={username} onChange={e=>setUsername(e.target.value)} className="rounded-lg border bg-surface p-2"/><input required minLength={12} type="password" aria-label="Senha do novo usuário" placeholder="Senha (12+ caracteres)" value={password} onChange={e=>setPassword(e.target.value)} className="rounded-lg border bg-surface p-2"/><select aria-label="Permissão" value={role} onChange={e=>setRole(e.target.value)} className="rounded-lg border bg-surface p-2"><option value="analyst">Analista</option><option value="admin">Administrador</option></select><Button type="submit">Criar usuário</Button></form></div>;
}
