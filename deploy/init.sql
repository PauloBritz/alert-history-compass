-- EventLens: estrutura completa do banco (PostgreSQL 14+ com pgvector)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.kb_solucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento text NOT NULL,
  solucao text NOT NULL,
  ticket_numero text,
  autor text,
  origem text NOT NULL DEFAULT 'otrs',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kb_solucoes_evento_trgm ON public.kb_solucoes USING gin (lower(evento) gin_trgm_ops);
CREATE UNIQUE INDEX kb_solucoes_unq ON public.kb_solucoes (lower(evento), md5(solucao));

CREATE TABLE public.kb_votos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solucao_id uuid NOT NULL REFERENCES public.kb_solucoes(id) ON DELETE CASCADE,
  positivo boolean NOT NULL,
  evento text,
  comentario text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kb_votos_sol ON public.kb_votos (solucao_id, created_at);


CREATE OR REPLACE FUNCTION public.kb_buscar(_texto text, _limite int DEFAULT 10)
RETURNS TABLE (id uuid, evento text, solucao text, ticket_numero text, autor text, origem text,
  created_at timestamptz, similaridade real, positivos bigint, negativos bigint, positivos_30d bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT s.id, s.evento, s.solucao, s.ticket_numero, s.autor, s.origem, s.created_at,
    similarity(lower(s.evento), lower(_texto)) AS similaridade,
    count(v.*) FILTER (WHERE v.positivo),
    count(v.*) FILTER (WHERE NOT v.positivo),
    count(v.*) FILTER (WHERE v.positivo AND v.created_at > now() - interval '30 days')
  FROM kb_solucoes s LEFT JOIN kb_votos v ON v.solucao_id = s.id
  WHERE similarity(lower(s.evento), lower(_texto)) > 0.3
  GROUP BY s.id
  ORDER BY (count(v.*) FILTER (WHERE v.positivo) - count(v.*) FILTER (WHERE NOT v.positivo)) DESC,
    similarity(lower(s.evento), lower(_texto)) DESC
  LIMIT _limite;
$$;
INSERT INTO public.kb_solucoes (evento, solucao, ticket_numero, autor) VALUES
('Alerta Badesul - LVHA3034M (LVHA3034M) Zabbix agent is not available (for 5m)',
E'Prezado(a) Cleber Ferrari,\nDemanda atualizada:\n- Fui acionado para verificar a indisponibilidade do agente Zabbix do servidor\nVM701086 \n\nInformações Importantes:\n- Validei que o diretorio /run/zabbix não estava com as permissões corretas\n\nAções Realizadas:\n- Analise de logs\n- Ajuste do diretorio /run/zabbix\n- restart do Agente\n\nValidação do monitoramento\n\nAções Pendentes:\n- Encerrar o chamado\n\nEvidências:\n- [copy/paste de e-mails e/ou prints do atendimento]\n--\nMarcos Vinicio Ribeiro de Oliveira\nInterOp – Central de Monitoramento e Operação\nFone: 55 51 3216 7030, 55 11 4063 7881\n--',
NULL, 'Marcos Vinicio Ribeiro de Oliveira') ON CONFLICT DO NOTHING;
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
