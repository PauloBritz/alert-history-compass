# Revisão transversal do fluxo V2

## Regra
Cadastrar uma solução, registrar sua aplicação e avaliar seu resultado são ações distintas. Pesquisas devem recuperar o histórico da ocorrência correta, sem misturar clientes ou alterar o encerramento já registrado.

## Inventário conferido por leitura do código

| Local / caminho | Verificação e resultado |
|---|---|
| Tela principal, análise manual | Identidade contextual/manual; corrigida limpeza de resultados anteriores e descarte de respostas atrasadas |
| Importação JSON/arquivo | Mesmo endpoint de ocorrência; contexto host/IP importado, carregamento protegido, respostas versionadas |
| Lista KB, AppliedForm | Cadastro com applied=false; não envia avaliação; falhas liberam controles |
| SolutionRating na KB | POST /evaluations positivo/negativo; corretivo opcional; ID confirmado antes do sucesso; retry preserva tentativa |
| TicketCard/FeedbackTicket de cada artigo OTRS | Cadastro separado da avaliação; corrigida atualização de eficácia quando outra lista muda e confirmação de ID de cadastro |
| Aplicação nas duas listas | Endpoint /applications separado; corrigida confirmação de ID e bloqueio de aplicação em ocorrência encerrada |
| Classificação e associação legada | Tipo e escopo atuais; corrigida serialização de criação de vínculos com correções concorrentes |
| Recommendations/get_link/save_solution | Trava de ocorrência também nestes caminhos, não apenas evaluate; estatísticas por tipo/escopo |
| Evaluate e corretivo | Transação única, tentativa global/fingerprint, preserva solução original e não resolve |
| History e HistoryView | Consulta exclusivamente por ocorrência, nome do tipo na avaliação, comentários, corretivo, aplicações e auditoria |
| Identidade Python | Contexto completo ou ID externo escopado; não mescla títulos; recebimento original preservado |
| Domain statistics/sufficient | Wilson e política existentes preservados; nenhuma alteração de limiares |
| KbPanel antigo e wrappers JS | Sem import na rota, mas mantinham votos globais/resolução implícita se reativados; removidos do código V2. Não eram funcionalidades ativas |
| SQL legado kb_buscar/baseline | Função de estatística legada separada; preservada, sem executar SQL ou alterar exemplos/registros |
| SQL 001/002 | Lidos; 002 continua apenas revisável, não executada. Schema de teste separado |
| manage.py e Dockerfile-api | Runner só por comando explícito; startup Python não executa migrations |
| Dockerfile/compose do editor | Modelo anterior não corresponde ao kit V2; não executado nem usado na entrega. ZIP preserva compose V2 anterior com API Python |
| Jobs, cron, triggers de avaliação | Não encontrados no código inspecionado; não há job adicional de votação/resolução no V2 |
| Login/config/roles | Código lido; políticas, usuários, permissões e settings não alterados |

## Correções adicionais desta revisão
- Estado encerrado não pode ser reaberto/substituído por nova aplicação, inclusive via contrato antigo applied=true. Rejeição 409 antes de registros parciais; nenhuma ocorrência existente foi modificada.
- Removidos apenas módulos de código obsoleto do V2: KbPanel.tsx, kb.ts, kb.functions.ts, kb.db.server.ts. Dados, SQL e testes aritméticos legados permanecem.
- Locks de ocorrência precedem fonte OTRS em save_solution; associação e recomendações serializam com classificação, evitando histórico/vínculo de tipos diferentes durante concorrência.
- Respostas atrasadas de análise/importação não substituem a ocorrência atual; sair da conta limpa o atendimento exibido.
- As duas listas atualizam eficácia e estado de aplicação; cards reiniciam feedback após mudança real de tipo.
- Corrigida largura mínima dos trilhos OTRS no celular, descoberta ao validar artigos reais do exemplo já existente.

## Evidências executadas
- **30 testes Python aprovados**, PostgreSQL 17 UTF-8 descartável, 12,06s; aviso único de depreciação Starlette/httpx.
- **14 testes frontend aprovados**: todos anteriores preservados, incluindo erros/retentativas e aplicação em encerrados.
- Playwright com login e API Python/PostgreSQL reais de teste: importação JSON, cadastro de artigo, positivo, eficácia atualizada nas **duas listas**, aplicação explícita com resolução, aplicações desabilitadas nas **duas listas** e leitura posterior do histórico. Desktop 1280×1800 e celular 390×844 inspecionados, sem overflow horizontal após correção; sem erros JavaScript.
- Falhas intermediárias do script: primeiro verificava atualização antes de concluir; corrigida espera. Depois revelou overflow no grid OTRS, corrigido no produto e reexecutado com sucesso. Contagens de testes de navegador são acumuladas no banco descartável, não são dados do proprietário.

## Limites que permanecem
Nenhum servidor LIVE/V2, migration de produção, implantação, systemd ou configuração do proprietário foi alterado. O motor oficial OTRS e a rede real não estão disponíveis: adapter lido e ausência 503 testada, consulta real não verificada. Código efetivamente servido na VM, SQL 002 aplicada a clone do banco real, Docker completo, HTTPS e backup/restore continuam não verificados. Pacote preserva configuração local da entrega V2 anterior; nova compilação de produção do ZIP não foi executada. Schema/snapshots Drizzle V2 continuam pendentes conforme documentação anterior. Dados antigos sem contexto não foram mesclados ou corrigidos.