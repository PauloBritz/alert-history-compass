# EventLens V2 — revisão e implantação controlada

Atualização desta entrega: leia também FLOW-SWEEP.md, com inventário dos caminhos e 44 testes aprovados. Os módulos JS obsoletos mencionados abaixo foram removidos do V2; os dados e funções SQL legados permanecem intactos.

Esta entrega altera apenas código. Nenhum servidor, LIVE, serviço systemd, configuração de produção ou banco existente foi acessado. A migração `backend/sql/002_flow_integrity.sql` **não foi executada**, nem mesmo no banco de testes. Os testes usaram `backend/tests/schema.sql`, uma estrutura descartável separada.

## Diagnóstico

1. `/occurrences` recebia apenas título e `external_id=NULL`: cada pesquisa gerava outro UUID. O histórico era corretamente restrito ao UUID, mas a interface abandonava a ocorrência anterior.
2. `FeedbackTicket` primeiro salvava `/solutions`; o rótulo “Salvar na KB e avaliar” sugeria uma avaliação que ainda exigia outra ação. `AppliedForm` misturava cadastro com resolução. Removido o cadastro duplicado de artigos dentro de `TicketCard`: agora há um único cadastro por artigo, seguido pelos controles de avaliação.
3. Negativa com corretivo chamava `save_solution(applied=True)`, encerrando o incidente e substituindo a solução aplicada. Agora grava avaliação e corretivo atomicamente, mantendo a solução original e sem mudar o estado da ocorrência.
4. Positiva fechava automaticamente o incidente. Agora atualiza somente a eficácia. A aplicação é uma operação separada; só `resolved=true` no registro explícito fecha a ocorrência. `Solution.applied=true` antigo permanece compatível como registro de aplicação **sem resolução**.
5. Idempotência comparava o vínculo da classificação atual, criava vínculos durante verificação e não comparava comentário/corretivo/usuário. Agora usa trava global da tentativa, fingerprint imutável e não altera registros no retry. Retorna 409 para reutilização incompatível.
6. Classificação repetida gerava correção redundante. Agora não altera nada quando o tipo é igual. Histórico traz nome do tipo na avaliação, comentários, corretivo vinculado, aplicações e auditoria.
7. Eficácia era global por tipo/solução, inclusive entre clientes. Novos vínculos têm escopo cliente/ambiente/origem/sistema. Hosts do mesmo escopo compartilham eficácia do mesmo tipo, mas seus históricos permanecem separados.

## Identidade e compatibilidade

- Com ID externo: hash de ID e escopo. O mesmo ID em outro cliente/origem é distinto. Reuso com host/contexto conflitante retorna 409; não associa silenciosamente.
- Sem ID externo, com contexto: hash do título normalizado **mais todo contexto**, incluindo cliente, host, IPs, ambiente, origem, sistema e contexto técnico.
- Sem contexto suficiente: chave manual aleatória por pesquisa na sessão do navegador; repetir a mesma pesquisa nessa sessão recupera o UUID. **Não é deduplicação global pelo título**. Em outra sessão é outra ocorrência; use contexto/ID estável para continuidade entre navegadores.
- “Criar uma nova ocorrência” fornece um novo token, preservado para consultas posteriores nessa sessão. Integrações podem enviar um `new_occurrence` UUID estável para identificar uma nova instância legítima.
- O título e `received_at` originais ficam intactos; nova pesquisa gera auditoria `searched`, não reescreve recebimento.
- As três ocorrências antigas mencionadas no pedido NÃO foram mescladas nem reclassificadas. Continuam consultáveis pelos respectivos UUIDs. Contexto ausente não pode ser inventado. Uma reconciliação histórica exige revisão humana separada.
- Vínculos antigos ficam em escopo `legacy`. Não entram automaticamente na eficácia contextual nova. Soluções legadas podem ser associadas explicitamente; seus votos antigos continuam separados.
- Campo `external_id` antigo permanece intacto e único; novos IDs externos são guardados em `context.external_id`, eliminando conflitos globais sem apagar o legado.
- O histórico é exclusivamente da ocorrência atual; não há histórico agregado de eventos “parecidos”.

## Arquivos completos e tabela de alterações

O ZIP contém os arquivos completos, não diffs. A base é o pacote local V2 anterior, preservando configuração independente de nuvem; os arquivos abaixo foram atualizados a partir do projeto corrigido.

| Caminho | Estado | Alteração / motivo | Impacto |
|---|---|---|---|
| backend/main.py | Alterado | Identidade, escopo, avaliação, aplicação, histórico | Persistência consistente |
| backend/identity.py | Novo | Normalização e hash contextual | Sem deduplicação por título |
| backend/sql/002_flow_integrity.sql | Novo | Campos, índices e aplicações | Exige aprovação e aplicação manual |
| backend/tests/test_knowledge.py | Alterado | Mantém 14 testes, corrige semântica negativa e protege banco | Segurança dos testes |
| backend/tests/test_flow.py | Novo | 14 regressões de integridade | Valida persistência real |
| backend/tests/schema.sql | Novo | Estrutura descartável pós-alteração | Testa sem executar migrations |
| src/lib/api.ts | Alterado | Contratos de contexto, histórico e avaliação | Erros HTTP claros |
| src/components/KnowledgeWorkspace.tsx | Alterado | Avaliação e aplicação separadas, atualização/histórico | Retentativas sem bloqueio |
| src/routes/index.tsx | Alterado | Contexto, continuidade manual, cadastro único OTRS | Caminhos da tela coerentes |
| src/test/knowledge-flow.test.tsx | Novo | Contratos e falhas da interface | 7 testes novos |
| src/test/kb.test.ts | Alterado somente import | Mantém os 3 testes e asserts anteriores | Sem camada de banco obsoleta |
| src/lib/kb-statistics.ts | Novo | Extração da aritmética legada sem mudança de regra | Testes independentes de servidor |
| src/lib/kb.ts | Alterado no editor | Reexporta helper; wrapper obsoleto excluído do pacote como antes | Nenhum segundo backend no export |
| deploy/Dockerfile-api | Alterado | Remove migração no startup | Reiniciar API não altera banco |
| deploy/REVIEW-flow.md | Novo | Diagnóstico e procedimentos | Revisão operacional |
| AGENTS.md | Alterado | Regras estruturais documentadas | Consistência futura |
| roadmap.md | Alterado | Situação e limitações | Escopo transparente |

## Migração SQL: revisão, validação e rollback

Arquivo integral: `backend/sql/002_flow_integrity.sql`. Alterações aditivas; troca a restrição única de links por solução/tipo/escopo. Não contém DELETE, backfill ou mesclagem. Preserva FKs e IDs antigos. `identity_key` é nullable com índice único parcial; antigos NULL não são conflitados. A migração deve ser revisada contra o schema real, incluindo nomes de constraints e índices customizados.

Antes de aprovar: verificar tamanho das tabelas, locks, espaço, backup, esquema UTF-8 e duplicidades por `(solution_id,type_id,scope_key)`; conferir constraints com `pg_constraint`/`pg_indexes`. A criação de índices é transacional e pode bloquear gravações; usar janela controlada. Não é hot deployment: backend antigo não conhece o novo índice composto e não pode operar simultaneamente com o novo.

Em clone autorizado do banco: aplicar 002 numa transação, conferir colunas/índices/FKs, contagens antes/depois e leitura de histórico legado. Executar duas vezes para verificar repetibilidade. **Este procedimento de migration não foi executado aqui**; a estrutura final foi testada separadamente.

Rollback preferido: restaurar backup completo do V2 e código anterior, em janela sem gravações. Não remover colunas/tabela com dados novos. Recriar a unicidade antiga pode falhar porque agora existe a mesma solução/tipo em mais de um escopo. Fazer downgrade só de código não é seguro. Qualquer exportação/reconciliação de dados criados após o backup precisa de revisão; restaurar backup perde essas gravações se não forem preservadas.

## Procedimento operacional — executar somente após aprovação da equipe

1. **Inventário**: identificar diretório/porta/banco/proxy exclusivos do V2; comparar código servido e fonte, checksum dos arquivos e data dos artefatos frontend. Confirmar que o LIVE usa serviços e banco distintos. Se compartilham banco, interromper e revisar o escopo antes de executar.
2. **Backup**: copiar o release atual e configurações para diretório protegido (`cp -a /CAMINHO/V2 /BACKUPS/V2-DATA`); usar `pg_dump --format=custom --file=/BACKUPS/v2-DATA.dump "$DATABASE_URL"` com conexão exclusiva do V2; guardar checksums e testar restauração em banco clone. Não copiar/registrar segredos em tickets. As variáveis/caminhos devem ser preenchidos pela equipe, não são valores reais fornecidos.
3. **Revisão**: comparar o ZIP com o release V2 real. Não substituir `api_otrs_consulta.py`, sua configuração nem dependências do motor. Preservar `OTRS_SCRIPT=/opt/eventlens/backend/api_otrs_consulta.py`, origens, cookies e conexão próprios do servidor.
4. **Pré-validação**: instalar dependências em ambiente separado; executar testes só em banco descartável. Compilar frontend com `bun install --frozen-lockfile && bun run build` no release candidato. Não apontar testes ao banco operacional. Conferir que `/api/` vai para Python e que o frontend servido é o novo artefato.
5. **Janela aprovada**: colocar somente V2 em manutenção com o mecanismo operacional já existente, sem alterar systemd/configurações. Confirmar ausência de gravadores antigos. Equipe aplica a SQL revisada via psql em transação (`psql --single-transaction -v ON_ERROR_STOP=1 "$DATABASE_URL" -f backend/sql/002_flow_integrity.sql`). Registrar checksum/data no ledger existente sob revisão para que `backend.manage migrate` não reaplique por engano; não usar o runner automático indiscriminadamente.
6. **Atualização**: trocar somente arquivos backend/frontend V2 pelo release validado; conservar config e motor do proprietário. A equipe reinicia apenas o processo V2 pelo procedimento existente. Dockerfile agora inicia API sem migration automática; ambientes que têm overrides/scripts antigos devem remover a execução automática após revisão própria, não executar compose da entrega cegamente sobre LIVE.
7. **Validação funcional**: login → evento com cliente/host → classificação → cadastro KB → positivo → negativo sem corretivo → negativo com corretivo → histórico → pesquisar novamente → outro cliente/host → aplicação explícita com/sem resolução. Comparar UUID, status, avaliações, corretivo e auditoria no PostgreSQL real. Simular erro HTTP e retry da mesma tentativa.
8. **Logs**: confirmar POST `/solutions` separado de POST `/evaluations`, códigos 200/409/422/500 esperados, GET `/history`, e nenhuma chamada do LIVE. Verificar logs do processo V2 pelo mecanismo existente, sem alterar serviço. Não registrar cookies/senhas. Confrontar versão do código e artefato frontend servido; limpar cache só do V2 se necessário.
9. **Rollback**: manter V2 sem gravações, salvar dados posteriores ao backup para análise, restaurar dump em clone e validar antes de trocar banco/código. Voltar juntos schema e release anterior. Nunca apagar tabelas/linhas em produção como atalho.

## Testes reproduzíveis (apenas banco descartável)

Criar banco exclusivo UTF-8 chamado `eventlens_flow_test`; aplicar **somente** `backend/tests/schema.sql` para os testes deste código (não é migration). Configurar DATABASE_URL para esse banco e `EVENTLENS_TEST_DATABASE=isolated COOKIE_SECURE=false`, executar `python -m pytest backend/tests -v`. A fixture recusa outro nome e limpa apenas as tabelas V2 desse banco de testes. `bunx vitest run` executa a suíte frontend.

## Limitações

- Migração SQL, backup/restore, Docker completo e implantação real NÃO executados.
- Motor OTRS oficial não disponível neste ambiente; seu código/comportamento não foi modificado, e a falha 503 é explícita. Teste de rede real continua com a equipe.
- Não foi possível comparar o frontend efetivamente servido na VM com os fontes; a relação rota → componentes → HTTP foi conferida na prévia local e testada contra Python/PostgreSQL descartável. A verificação da VM é obrigatória.
- Contexto omitido é escopo desconhecido, não identidade de cliente verificada. A origem deve enviar cliente/contexto confiáveis. Não é uma implementação de permissões multi-tenant: analistas autenticados mantêm o modelo de acesso interno atual.
- As classificações de avaliações antigas sem snapshot continuam usando o vínculo antigo como fallback; dados que nunca foram registrados não podem ser recuperados com segurança.
- O schema de teste comprova o código pós-alteração, não compatibilidade de execução da SQL contra o seu banco real.