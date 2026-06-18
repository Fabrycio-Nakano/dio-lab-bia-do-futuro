# Base de Conhecimento

## Dados Utilizados

O agente financeiro utiliza uma base de conhecimento híbrida contendo dados estruturados locais (arquivos mockados) e referências de dados externos públicos para enriquecer a inteligência de negócios.

### Dados Locais (`data/`)

| Arquivo | Formato | Utilização no Agente | Colunas / Chaves Principais |
|---------|---------|---------------------|-----------------------------|
| `historico_atendimento.csv` | CSV | Contextualizar interações anteriores do cliente | `data`, `canal`, `tema`, `resumo`, `resolvido` |
| `perfil_investidor.json` | JSON | Personalizar recomendações de investimento e verificar metas | `nome`, `idade`, `renda_mensal`, `perfil_investidor`, `metas` |
| `produtos_financeiros.json` | JSON | Sugerir produtos de investimento compatíveis com perfil e prazos | `nome`, `categoria`, `risco`, `rentabilidade`, `liquidez`, `carencia_dias` |
| `transacoes.csv` | CSV | Analisar padrão de gastos e identificar capacidade de poupança | `data`, `descricao`, `categoria`, `valor`, `tipo` |

### Dados Externos (Hugging Face)

Para expandir a base e permitir análises de notícias financeiras, análise de sentimentos do mercado e perguntas de finanças gerais, sugerimos a integração com os seguintes datasets públicos:

1. **[lucas-leme/Sentiments-FinBERT-PT-BR](https://huggingface.co/datasets/lucas-leme/Sentiments-FinBERT-PT-BR):**
   * **Utilização:** Permite ao agente analisar o sentimento (positivo, negativo, neutro) de notícias financeiras do mercado brasileiro. Pode ser usado para justificar por que o Tesouro Selic ou fundos de ações estão em momentos mais ou menos propícios.
2. **[sweatSmile/FinanceQA](https://huggingface.co/datasets/sweatSmile/FinanceQA):**
   * **Utilização:** Dataset de perguntas e respostas sobre relatórios financeiros e conceitos gerais de finanças. Útil para servir como base de dados vetorial (RAG) para sanar dúvidas teóricas complexas dos usuários sobre conceitos de investimentos e economia.

---

## Adaptações nos Dados

Para garantir um protótipo de alta fidelidade e com capacidade analítica aprimorada, os dados mockados originais foram expandidos:

1. **Enriquecimento Histórico (`transacoes.csv`):** O histórico de transações do cliente (João Silva) foi expandido para **3 meses completos** (Agosto, Setembro e Outubro de 2025). Isso possibilita análises comparativas de evolução de gastos e identificação de economias recorrentes.
2. **Atributos de Resgate (`produtos_financeiros.json`):** Adicionamos chaves de `"liquidez"` e `"carencia_dias"` em cada produto para permitir que a LLM faça escolhas corretas de ativos baseando-se nos prazos das metas do usuário.
3. **Consistência de Risco (`perfil_investidor.json`):** Alinhamos o campo `"aceita_risco"` para `true` para corresponder de forma coerente com o perfil classificado como `"moderado"`.

---

## Estratégia de Integração

### Como os dados são carregados?

Os arquivos locais de dados são carregados no início de cada sessão de interação usando bibliotecas nativas e manipuladores de dados:
* **JSONs (`perfil_investidor.json` e `produtos_financeiros.json`):** Carregados com a biblioteca `json` nativa do Python e guardados no estado da sessão do Chatbot (ex: `st.session_state` no Streamlit).
* **CSVs (`transacoes.csv` e `historico_atendimento.csv`):** Carregados na memória utilizando a biblioteca `pandas` para rápida filtragem, agrupamento e cálculos estatísticos (ex: média de gastos mensais por categoria).

### Como os dados são usados no prompt?

O agente adota uma abordagem de **Prompt Grounding** (Aterramento de Prompt) para evitar alucinações. O contexto do cliente é compilado dinamicamente a cada mensagem e injetado no System Prompt da seguinte maneira:

1. **Contexto de Perfil:** O perfil do usuário, renda e metas são expostos como metadados estruturados.
2. **Resumo Financeiro:** O código calcula dinamicamente o total de despesas e receitas dos últimos meses com base em `transacoes.csv`, passando apenas agregados consolidados (evitando estourar a janela de tokens da LLM).
3. **Catálogo de Ofertas:** Os produtos disponíveis em `produtos_financeiros.json` são passados como a "única lista de opções válidas de investimentos" que o agente pode sugerir.

---

## Exemplo de Contexto Montado

O System Prompt recebe os dados consolidados estruturados no seguinte formato:

```markdown
--- CONTEXTO DO CLIENTE ATUAL ---
Nome: João Silva
Perfil de Investidor: Moderado (Aceita Risco: Sim)
Renda Mensal: R$ 5.000,00
Patrimônio Declarado: R$ 15.000,00
Reserva de Emergência Atual: R$ 10.000,00

Metas Declaradas:
1. Completar reserva de emergência (Valor: R$ 15.000,00 | Prazo: 2026-06)
2. Entrada do apartamento (Valor: R$ 50.000,00 | Prazo: 2027-12)

Histórico Resumido de Transações (Últimos 3 meses):
- Total de Receitas: R$ 15.000,00 (Média: R$ 5.000,00/mês)
- Total de Despesas Fixas/Variáveis: R$ 8.368,60
- Média Mensal de Poupança: R$ 2.210,46
- Total de Aportes em Investimentos: R$ 1.800,00

Produtos Financeiros Disponíveis para Recomendação:
- Tesouro Selic (Renda Fixa | Risco: Baixo | Rentabilidade: 100% da Selic | Liquidez: D+1 | Carência: 0 dias)
- CDB Liquidez Diária (Renda Fixa | Risco: Baixo | Rentabilidade: 102% do CDI | Liquidez: D+0 | Carência: 0 dias)
- LCI/LCA (Renda Fixa | Risco: Baixo | Rentabilidade: 95% do CDI | Liquidez: Após 90 dias | Carência: 90 dias)
- Fundo Multimercado (Fundo | Risco: Médio | Rentabilidade: CDI + 2% | Liquidez: D+30 | Carência: 30 dias)
- Fundo de Ações (Fundo | Risco: Alto | Rentabilidade: Variável | Liquidez: D+3 | Carência: 0 dias)
----------------------------------
```
