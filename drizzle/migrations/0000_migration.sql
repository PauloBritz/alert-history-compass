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

GRANT SELECT, INSERT ON public.kb_solucoes TO anon, authenticated;
GRANT SELECT, INSERT ON public.kb_votos TO anon, authenticated;
GRANT ALL ON public.kb_solucoes, public.kb_votos TO service_role;

ALTER TABLE public.kb_solucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_votos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb read" ON public.kb_solucoes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "kb insert" ON public.kb_solucoes FOR INSERT TO anon, authenticated
  WITH CHECK (length(evento) BETWEEN 3 AND 500 AND length(solucao) BETWEEN 5 AND 20000);
CREATE POLICY "votos read" ON public.kb_votos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "votos insert" ON public.kb_votos FOR INSERT TO anon, authenticated
  WITH CHECK (comentario IS NULL OR length(comentario) <= 20000);

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
GRANT EXECUTE ON FUNCTION public.kb_buscar(text, int) TO anon, authenticated;

INSERT INTO public.kb_solucoes (evento, solucao, ticket_numero, autor) VALUES
('Alerta Badesul - LVHA3034M (LVHA3034M) Zabbix agent is not available (for 5m)',
E'Prezado(a) Cleber Ferrari,\nDemanda atualizada:\n- Fui acionado para verificar a indisponibilidade do agente Zabbix do servidor\nVM701086 \n\nInformações Importantes:\n- Validei que o diretorio /run/zabbix não estava com as permissões corretas\n\nAções Realizadas:\n- Analise de logs\n- Ajuste do diretorio /run/zabbix\n- restart do Agente\n\nValidação do monitoramento\n\nAções Pendentes:\n- Encerrar o chamado\n\nEvidências:\n- [copy/paste de e-mails e/ou prints do atendimento]\n--\nMarcos Vinicio Ribeiro de Oliveira\nInterOp – Central de Monitoramento e Operação\nFone: 55 51 3216 7030, 55 11 4063 7881\n--',
NULL, 'Marcos Vinicio Ribeiro de Oliveira');