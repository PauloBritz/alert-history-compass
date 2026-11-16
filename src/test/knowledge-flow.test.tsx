import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SolutionRating, KnowledgeWorkspace } from '@/components/KnowledgeWorkspace';
import { api, type Solution } from '@/lib/api';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const mocked = vi.mocked(api);
const solution: Solution = { id: 'solution-1', procedure: 'Restart and validate service', author: 'Analyst', origin: 'analista', positivos: 0, negativos: 0, total: 0, taxa_sucesso: null, confidence: 0, validation: 'AINDA NÃO VALIDADA', sources: [] };
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

describe('Evaluation persistence contract', () => {
  it('posts positive evaluation, not solution creation, and refreshes only after persistence', async () => {
    const refreshed = vi.fn(); mocked.mockResolvedValue({ id: 'eval-1', duplicate: false });
    render(<SolutionRating oid="occ-1" solution={solution} onSaved={refreshed} />);
    fireEvent.click(screen.getByRole('button', { name: 'Funcionou' }));
    await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    expect(mocked).toHaveBeenCalledWith('/occurrences/occ-1/evaluations', 'POST', expect.objectContaining({ solution_id: 'solution-1', positive: true, attempt_key: expect.any(String) }));
    expect(mocked.mock.calls.some(([path]) => path.endsWith('/solutions'))).toBe(false);
  });

  it('negative evaluation works without corrective procedure', async () => {
    mocked.mockResolvedValue({ id: 'eval-2' });
    render(<SolutionRating oid="occ-1" solution={solution} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Não funcionou' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar avaliação negativa' }));
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    expect(mocked.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ positive: false }));
    expect(mocked.mock.calls[0]?.[2]).not.toHaveProperty('correct_procedure');
  });

  it('sends negative result with corrective procedure and comment independently of application', async () => {
    mocked.mockResolvedValue({ id: 'eval-3' });
    render(<SolutionRating oid="occ-1" solution={solution} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Não funcionou' }));
    fireEvent.change(screen.getByLabelText('Procedimento correto'), { target: { value: 'Replace damaged hardware' } });
    fireEvent.change(screen.getByLabelText('Comentário'), { target: { value: 'Failure confirmed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar avaliação negativa' }));
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    expect(mocked.mock.calls[0]?.[2]).toEqual(expect.objectContaining({ positive: false, correct_procedure: 'Replace damaged hardware', comment: 'Failure confirmed' }));
    expect(mocked.mock.calls.some(([path]) => path.endsWith('/applications'))).toBe(false);
  });

  it('allows same-attempt retry after HTTP failure and never refreshes on failed write', async () => {
    const refreshed = vi.fn(); mocked.mockRejectedValueOnce(new Error('API respondeu 503')).mockResolvedValueOnce({ id: 'eval-4' });
    render(<SolutionRating oid="occ-1" solution={solution} onSaved={refreshed} />);
    const positive = screen.getByRole('button', { name: 'Funcionou' });
    fireEvent.click(positive);
    await waitFor(() => expect(positive).toBeEnabled());
    expect(refreshed).not.toHaveBeenCalled();
    fireEvent.click(positive);
    await waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    expect(mocked.mock.calls[0]?.[2]).toEqual(mocked.mock.calls[1]?.[2]);
  });

  it('does not accept missing persisted evaluation id', async () => {
    const refreshed = vi.fn(); mocked.mockResolvedValue({});
    render(<SolutionRating oid="occ-1" solution={solution} onSaved={refreshed} />);
    const positive=screen.getByRole('button', { name: 'Funcionou' });
    fireEvent.click(positive);
    await waitFor(() => expect(positive).toBeEnabled());
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('never evaluates unclassified occurrences', () => {
    render(<SolutionRating oid="occ-1" solution={solution} onSaved={vi.fn()} classified={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Funcionou' }));
    expect(mocked).not.toHaveBeenCalled();
  });

  it('saving a solution requests applied=false and sends no evaluation', async () => {
    mocked.mockResolvedValue({ id: 'saved-solution' });
    render(<KnowledgeWorkspace initial={{ occurrence: { id: 'occ-1', original_title: 'LINK DOWN', type_id: 'type-1', type_name: 'LINK DOWN', status: 'pending' }, solutions: [], otrs_required: true, policy: null }} onOccurrence={vi.fn()} refreshKey={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar solução' }));
    fireEvent.change(screen.getByLabelText('Solução aplicada'), { target: { value: 'Restart failed service' } });
    // Prevent unrelated reload failure from influencing the creation contract.
    mocked.mockResolvedValueOnce({ id: 'saved-solution' }).mockResolvedValueOnce({ occurrence: { id: 'occ-1', status: 'pending' }, solutions: [], otrs_required: true, policy: null });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar na KB' }));
    await waitFor(() => expect(mocked).toHaveBeenCalledWith('/occurrences/occ-1/solutions', 'POST', { procedure: 'Restart failed service', applied: false }));
    expect(mocked.mock.calls.some(([path]) => path.endsWith('/evaluations'))).toBe(false);
  });
});