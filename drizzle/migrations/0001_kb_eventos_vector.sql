CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE public.kb_solucoes ADD COLUMN IF NOT EXISTS embedding vector(768);
COMMENT ON COLUMN public.kb_solucoes.embedding IS 'Embedding do evento+solução para busca semântica (RAG futura)';

CREATE TABLE public.kb_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento text NOT NULL,
  status text NOT NULL DEFAULT 'aguardando_solucao',
  solucao_id uuid REFERENCES public.kb_solucoes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolvido_em timestamptz
);
CREATE INDEX kb_eventos_evento ON public.kb_eventos (lower(evento));
GRANT SELECT, INSERT, UPDATE ON public.kb_eventos TO anon, authenticated;
GRANT ALL ON public.kb_eventos TO service_role;
ALTER TABLE public.kb_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eventos read" ON public.kb_eventos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "eventos insert" ON public.kb_eventos FOR INSERT TO anon, authenticated
  WITH CHECK (length(evento) BETWEEN 3 AND 500 AND status = 'aguardando_solucao');
CREATE POLICY "eventos update" ON public.kb_eventos FOR UPDATE TO anon, authenticated
  USING (status = 'aguardando_solucao') WITH CHECK (status IN ('aguardando_solucao','resolvido'));