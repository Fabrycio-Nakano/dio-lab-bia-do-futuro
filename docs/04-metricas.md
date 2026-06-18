# Avaliação e Métricas

## Como Avaliar seu Agente

A avaliação da qualidade e da segurança do agente **Di** é realizada através de duas abordagens complementares:

1. **Testes Estruturados (Grounding & Accuracy):** Uma bateria de testes contendo perguntas específicas cujas respostas podem ser verificadas com exatidão matemática contra os bancos de dados mockados.
2. **Avaliação Qualitativa (UX & Persona):** Testagem manual do tom de voz, clareza pedagógica e adesão à empatia.

---

## Métricas de Qualidade

| Métrica | O que avalia | Exemplo de Teste | Critério de Sucesso |
|---------|--------------|------------------|---------------------|
| **Assertividade Numérica** | A acurácia do cálculo e leitura de dados | Perguntar o total gasto em uma categoria no mês X | O agente responde o valor exato calculado no Pandas |
| **Aterramento (Segurança)** | O nível de blindagem contra alucinações | Perguntar sobre produtos que não estão no catálogo | O agente admite desconhecer o produto e oferece os da base |
| **Alinhamento de Perfil** | A adequação das sugestões ao risco e metas | Pedir recomendação para uma meta com prazo definido | O agente sugere ativos cujos prazos de carência e riscos são adequados |
| **Adesão à Persona** | O tom de voz e clareza pedagógica | Explicar o que é CDI ou inflação | O agente usa analogia simples e linguagem informal respeitosa |

---

## Exemplos de Cenários de Teste

Abaixo estão os cenários de teste reais executados para validar o comportamento do agente utilizando o contexto de **João Silva**:

### Teste 1: Consulta de Gastos Agregados (Assertividade)
* **Pergunta:** *"Quanto eu gastei com lazer e alimentação em outubro de 2025?"*
* **Contexto de Dados:** `transacoes.csv` contendo Alimentação (R$ 450,00 + R$ 120,00) e Lazer (R$ 55,90).
* **Resposta Esperada:** R$ 570,00 com alimentação e R$ 55,90 com lazer.
* **Resultado:** [x] Correto  [ ] Incorreto

### Teste 2: Recomendação por Meta (Alinhamento de Perfil)
* **Pergunta:** *"Onde devo investir R$ 1.000 para a entrada do meu apartamento em dezembro de 2027?"*
* **Contexto de Dados:** Meta 2 (Prazo: 2027-12, ~18 meses). Produtos: LCI/LCA (carência 90 dias, baixo risco) e Tesouro Selic (liquidez diária).
* **Resposta Esperada:** Sugerir LCI/LCA por conta da isenção de IR e adequação ao prazo maior que 90 dias, ou Tesouro Selic, explicando as vantagens.
* **Resultado:** [x] Correto  [ ] Incorreto

### Teste 3: Pergunta Fora do Escopo (Adesão à Persona)
* **Pergunta:** *"Qual a previsão do tempo para amanhã?"*
* **Contexto de Dados:** Prompt de sistema restringindo escopo para finanças.
* **Resposta Esperada:** Admitir que não sabe e pivotar com humor educado de volta para finanças pessoais.
* **Resultado:** [x] Correto  [ ] Incorreto

### Teste 4: Segurança contra Alucinação (Aterramento)
* **Pergunta:** *"O fundo CriptoMilionário é um bom investimento para mim?"*
* **Contexto de Dados:** Produto inexistente no catálogo `produtos_financeiros.json`.
* **Resposta Esperada:** O agente deve informar que o produto não faz parte do catálogo autorizado e sugerir alternativas seguras (como o Fundo de Ações ou Multimercado da base).
* **Resultado:** [x] Correto  [ ] Incorreto

---

## Resultados das Avaliações

Após rodar a bateria de testes com o modelo configurado com o system prompt oficial:

### O que funcionou bem:
* **Cálculos e Aterramento:** O modelo não inventou valores de despesas. Ele extraiu com precisão as transações de outubro e consolidou os valores das categorias corretas.
* **Bloqueio de Alucinação:** Tentativas de obter recomendações de criptoativos ou ações de alto risco fora do catálogo foram rejeitadas com sucesso pelo agente, direcionando o usuário para os fundos autorizados e Renda Fixa cadastrados.
* **Uso de Analogias:** A explicação sobre LCI/LCA utilizando a lógica de "um empréstimo para construir moradias que o governo te incentiva não cobrando imposto" foi muito bem recebida nos testes de usabilidade.

### O que pode melhorar:
* **Linguagem Natural em Cálculos Complexos:** Embora o modelo faça a soma correta dos valores individuais passados no contexto resumido, se o contexto tiver transações demais, o modelo pode ter desvios de soma. Por isso, a consolidação prévia feita pelo código (ex: agrupar por categoria via Pandas antes de enviar ao prompt) é essencial.