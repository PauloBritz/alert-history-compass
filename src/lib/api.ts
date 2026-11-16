export function apiBase() {
  return (typeof window === 'undefined' ? '' : localStorage.getItem('eventlens.api')) || import.meta.env['VITE_API_URL'] || '/api';
}
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${apiBase().replace(/\/$/, '')}${path}`, {
    method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-EventLens': '1' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `API respondeu ${response.status}` }));
    throw new Error(typeof error.detail === 'string' ? error.detail : `API respondeu ${response.status}. Verifique os dados informados.`);
  }
  return response.json() as Promise<T>;
}
export interface EventContext { tenant: string; host: string; ips: string[]; environment: string; source: string; system: string; technical_context: string; external_id?: string | null }
export interface Occurrence { id: string; original_title: string; type_id: string | null; type_name: string | null; status: string; context?: EventContext; received_at?: string; applied_solution_id?: string | null }
export interface EvaluationResult { id: string; duplicate: boolean; corrective_solution_id: string | null }
export interface OccurrenceHistory {
  occurrence: Occurrence;
  recommendations: Array<{ id: string; solution_id: string; recommended_type: string; snapshot: { procedure?: string }; created_at: string }>;
  evaluations: Array<{ id: string; positive: boolean; username: string; evaluated_type: string; created_at: string; procedure: string; comment: string; corrective_procedure: string | null }>;
  applied: { procedure: string; author: string } | null;
  applications: Array<{ id: string; procedure: string; type_name: string; username: string; comment: string; resolved: boolean; created_at: string }>;
  audit: Array<{ id: string; action: string; created_at: string; username: string; details: Record<string, unknown> }>;
}
export interface Solution { id: string; procedure: string; author: string; origin: string; positivos: number; negativos: number; total: number; taxa_sucesso: number | null; confidence: number; validation: string; sources: Array<{ ticket_number: string; metadata: Record<string, unknown> }> }
export interface Knowledge { occurrence: Occurrence; solutions: Solution[]; otrs_required: boolean; policy: { min_evaluations: number; min_success: number; wilson_lower: number } | null }
export interface Analyst { id: string; username: string; role: 'admin' | 'analyst' }
