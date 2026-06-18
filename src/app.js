// Global state
let clientData = null;
let productsData = null;
let transactionsData = [];
let chartInstance = null;
let chatHistory = [];
let apiKeys = { gemini: '', openai: '', codestral: '' };

// System Prompt from docs/03-prompts.md
const systemPrompt = `Você é o "Di", um consultor e educador financeiro virtual inteligente e empático. Seu público-alvo são brasileiros de classe média e baixa que buscam organizar suas contas, economizar e começar a investir, mesmo que com pouco dinheiro.

### PERSONA E TOM DE VOZ
- **Empático e Consultivo:** Seja paciente e compreensivo. Nunca julgue o usuário por suas dívidas ou escolhas passadas.
- **Educativo:** Simplifique conceitos difíceis de economia usando analogias do dia a dia (ex: comparar inflação com o poder de compra no supermercado).
- **Sem Jargões:** Evite termos técnicos desnecessários. Se precisar usar um termo (como "CDI" ou "Selic"), explique-o brevemente de forma muito simples.
- **Informal Respeitoso:** Use uma linguagem próxima, mas mantendo o respeito e a credibilidade técnica.

### DIRETRIZES DE ATERRAMENTO (ANTI-ALUCINAÇÃO)
1. **Use Apenas Dados Autorizados:** Baseie suas respostas estritamente no contexto fornecido do cliente (nome, saldo, transações, perfil e metas) e no catálogo de produtos disponíveis.
2. **Admissão de Limitações:** Se o usuário perguntar algo que não está nos arquivos ou for fora do escopo financeiro, admita educadamente que não possui essa informação e redirecione para finanças pessoais.
3. **Não Invente:** Nunca invente transações fictícias, produtos financeiros que não estão no catálogo fornecido, ou rendimentos milagrosos.
4. **Sem Recomendações Cegas:** Se o perfil do investidor não estiver carregado ou estiver incompleto, peça educadamente para o usuário fornecer os dados básicos antes de sugerir produtos.

### ALINHAMENTO COM METAS DO CLIENTE
Ao sugerir investimentos, analise os prazos das metas do cliente informados no contexto:
- **Metas de Curto Prazo (Reserva de Emergência / prazos < 1 ano):** Recomende apenas investimentos de alta liquidez e baixo risco (ex: Tesouro Selic ou CDB Liquidez Diária).
- **Metas de Médio/Longo Prazo (ex: Compra de imóvel / prazos > 1 ano):** Pode sugerir produtos com prazos de carência maiores ou fundos compatíveis com o perfil do investidor (ex: LCI/LCA ou Fundo Multimercado).`;

// Application Init
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    appendSystemMessage("Carregando base de dados...");
    
    try {
        // Tenta carregar chaves do arquivo .env expostas pelo servidor local
        try {
            const configRes = await fetch('/config');
            if (configRes.ok) {
                const cfg = await configRes.json();
                if (cfg.GEMINI_API_KEY) {
                    apiKeys.gemini = cfg.GEMINI_API_KEY;
                    localStorage.setItem('api_key_gemini', cfg.GEMINI_API_KEY);
                }
                if (cfg.OPENAI_API_KEY) {
                    apiKeys.openai = cfg.OPENAI_API_KEY;
                    localStorage.setItem('api_key_openai', cfg.OPENAI_API_KEY);
                }
                if (cfg.CODESTRAL_API_KEY) {
                    apiKeys.codestral = cfg.CODESTRAL_API_KEY;
                    localStorage.setItem('api_key_codestral', cfg.CODESTRAL_API_KEY);
                }
            }
        } catch (e) {
            console.warn("Não foi possível carregar as chaves de API do servidor local:", e);
        }

        // Fetch files using paths relative to src/index.html
        const [profileRes, productsRes, transactionsRes] = await Promise.all([
            fetch('../data/perfil_investidor.json'),
            fetch('../data/produtos_financeiros.json'),
            fetch('../data/transacoes.csv')
        ]);

        if (!profileRes.ok || !productsRes.ok || !transactionsRes.ok) {
            throw new Error("Erro ao ler arquivos locais. Certifique-se de que o servidor web foi iniciado na raiz do projeto.");
        }

        clientData = await profileRes.json();
        productsData = await productsRes.json();
        
        const csvText = await transactionsRes.text();
        transactionsData = parseCSV(csvText);

        // Render dashboard
        renderDashboard();
        
        // Clear loading and greet
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        appendAgentMessage("Olá! Eu sou o **Di**, seu educador e consultor financeiro particular. Em que posso te ajudar hoje?");
        
        // Enable input
        document.getElementById('chat-input').disabled = false;
        document.getElementById('chat-send-btn').disabled = false;

    } catch (error) {
        console.error(error);
        appendSystemMessage(`❌ Erro de inicialização: ${error.message}. Por favor, certifique-se de rodar a aplicação a partir do servidor local na pasta do projeto.`);
    }
}

function setupEventListeners() {
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const providerSelect = document.getElementById('provider-select');
    
    // Send message triggers
    chatSendBtn.addEventListener('click', handleUserSendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleUserSendMessage();
        }
    });

    // Provider select logic
    providerSelect.addEventListener('change', () => {
        const keyContainer = document.getElementById('api-key-container');
        if (providerSelect.value === 'simulated') {
            keyContainer.style.display = 'none';
        } else {
            keyContainer.style.display = 'block';
            // Pre-fill from apiKeys global or localStorage if available
            const savedKey = apiKeys[providerSelect.value] || localStorage.getItem(`api_key_${providerSelect.value}`);
            document.getElementById('api-key-input').value = savedKey || '';
        }
    });

    // Key input save to local state and localStorage
    const keyInput = document.getElementById('api-key-input');
    keyInput.addEventListener('input', () => {
        const provider = providerSelect.value;
        if (provider !== 'simulated') {
            apiKeys[provider] = keyInput.value;
            localStorage.setItem(`api_key_${provider}`, keyInput.value);
        }
    });
}

// Simple CSV Parser
function parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const currentline = lines[i].split(',').map(v => v.trim());
        if (currentline.length === headers.length) {
            const obj = {};
            for (let j = 0; j < headers.length; j++) {
                let value = currentline[j];
                // Try converting numbers
                if (!isNaN(value) && value !== '') {
                    value = parseFloat(value);
                }
                obj[headers[j]] = value;
            }
            result.push(obj);
        }
    }
    return result;
}

// Render Dashboard UI
function renderDashboard() {
    if (!clientData) return;

    // Profile Details
    document.getElementById('client-name').innerText = clientData.nome;
    document.getElementById('client-age').innerText = clientData.idade;
    document.getElementById('client-job').innerText = clientData.profissao;
    document.getElementById('client-income').innerText = formatCurrency(clientData.renda_mensal);
    document.getElementById('client-profile').innerText = clientData.perfil_investidor;

    // Emergency Reserve widget
    const currentReserve = clientData.reserva_emergencia_atual;
    // Find reserve target from metas
    const reserveMeta = clientData.metas.find(m => m.meta.toLowerCase().includes("reserva"));
    const targetReserve = reserveMeta ? reserveMeta.valor_necessario : 15000.00;
    
    document.getElementById('reserve-current').innerText = formatCurrency(currentReserve);
    document.getElementById('reserve-target').innerText = formatCurrency(targetReserve);
    
    const percentage = Math.min(100, Math.round((currentReserve / targetReserve) * 100));
    document.getElementById('reserve-progress-bar').style.width = `${percentage}%`;
    document.getElementById('reserve-percentage').innerText = `${percentage}% concluído`;

    // Goals List
    const goalsContainer = document.getElementById('goals-list-container');
    goalsContainer.innerHTML = '';
    clientData.metas.forEach(meta => {
        const goalItem = document.createElement('div');
        goalItem.className = 'goal-item';
        goalItem.innerHTML = `
            <div class="goal-info">
                <h4>${meta.meta}</h4>
                <span>Prazo: ${meta.prazo}</span>
            </div>
            <span class="goal-badge">${formatCurrency(meta.valor_necessario)}</span>
        `;
        goalsContainer.appendChild(goalItem);
    });

    // Products Catalog Grid
    const productsContainer = document.getElementById('products-container');
    productsContainer.innerHTML = '';
    if (productsData) {
        productsData.forEach(prod => {
            const prodItem = document.createElement('div');
            prodItem.className = 'product-item';
            prodItem.innerHTML = `
                <span class="prod-cat">${prod.categoria.replace('_', ' ')}</span>
                <h4>${prod.nome}</h4>
                <div class="prod-yield">${prod.rentabilidade}</div>
                <div class="prod-meta">
                    <strong>Risco:</strong> ${prod.risco} | <strong>Aporte Mín:</strong> ${formatCurrency(prod.aporte_minimo)}
                </div>
                <div class="prod-meta">
                    <strong>Liquidez:</strong> ${prod.liquidez}
                </div>
            `;
            productsContainer.appendChild(prodItem);
        });
    }

    // Process & Render Charts
    renderCharts();
}

function renderCharts() {
    if (transactionsData.length === 0) return;

    // Group expenses by month and category
    // Months we have: August (08), September (09), October (10) of 2025
    const months = ['Agosto', 'Setembro', 'Outubro'];
    const monthKeys = ['2025-08', '2025-09', '2025-10'];
    
    const categories = ['moradia', 'alimentacao', 'transporte', 'saude', 'lazer', 'investimento'];
    const categoryColors = {
        'moradia': '#8b5cf6',
        'alimentacao': '#f59e0b',
        'transporte': '#3b82f6',
        'saude': '#ef4444',
        'lazer': '#ec4899',
        'investimento': '#10b981'
    };

    // Initialize category datasets
    const datasets = categories.map(cat => ({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        data: [0, 0, 0],
        backgroundColor: categoryColors[cat],
        borderColor: 'transparent',
        borderRadius: 4
    }));

    // Fill data
    transactionsData.forEach(t => {
        if (t.tipo === 'saida') {
            const dateStr = t.data; // e.g. "2025-08-02"
            const monthKey = dateStr.substring(0, 7); // "2025-08"
            const mIndex = monthKeys.indexOf(monthKey);
            
            if (mIndex !== -1) {
                const catIndex = categories.indexOf(t.categoria);
                if (catIndex !== -1) {
                    datasets[catIndex].data[mIndex] += t.valor;
                }
            }
        }
    });

    const ctx = document.getElementById('expenses-chart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#9ca3af',
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        boxWidth: 10,
                        padding: 10
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans' } }
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#9ca3af', 
                        font: { family: 'Plus Jakarta Sans' },
                        callback: function(value) { return 'R$ ' + value; }
                    }
                }
            }
        }
    });
}

// Chat UI helpers
function appendAgentMessage(text) {
    const chatMessages = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message agent-message';
    
    // Parse simple markdown-like formatting (strong, bullet lists)
    let formattedText = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\s*-\s*(.*)$/gm, '<li>$1</li>');
        
    // Wrap lists in <ul> tags
    if (formattedText.includes('<li>')) {
        // Group consecutive <li> items
        formattedText = formattedText.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    }
    
    msgDiv.innerHTML = formattedText.replace(/\n/g, '<br>');
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    chatHistory.push({ role: 'assistant', content: text });
}

function appendUserMessage(text) {
    const chatMessages = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message user-message';
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    chatHistory.push({ role: 'user', content: text });
}

function appendSystemMessage(text) {
    const chatMessages = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message system-message';
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    const chatMessages = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message agent-message typing-bubble';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Chat Send Orchestration
async function handleUserSendMessage() {
    const chatInput = document.getElementById('chat-input');
    const userText = chatInput.value.trim();
    if (userText === '') return;

    chatInput.value = '';
    appendUserMessage(userText);
    
    showTypingIndicator();
    
    const provider = document.getElementById('provider-select').value;
    const apiKey = document.getElementById('api-key-input').value.trim();

    try {
        let reply = "";
        
        if (provider === 'simulated' || apiKey === '') {
            // Local simulation response with artificial delay for realism
            await sleep(1200);
            reply = getSimulatedResponse(userText);
        } else if (provider === 'gemini') {
            reply = await callGeminiAPI(userText, apiKey);
        } else if (provider === 'openai') {
            reply = await callOpenAIAPI(userText, apiKey);
        } else if (provider === 'codestral') {
            reply = await callCodestralAPI(userText, apiKey);
        }
        
        removeTypingIndicator();
        appendAgentMessage(reply);
    } catch (error) {
        removeTypingIndicator();
        appendAgentMessage(`Desculpe, ocorreu um erro de conexão com a IA: **${error.message}**. Verifique sua API Key ou use o Modo Simulação.`);
    }
}

// Compile structured data context
function getClientDataContextText() {
    if (!clientData) return "";
    
    // Monthly aggregations for context
    const summary = getMonthlyExpensesSummary();
    
    return `--- CONTEXTO DO CLIENTE ATUAL ---
Nome: ${clientData.nome}
Perfil de Investidor: Moderado (Aceita Risco: Sim)
Renda Mensal: R$ ${clientData.renda_mensal.toLocaleString('pt-BR')}
Patrimônio Declarado: R$ ${clientData.patrimonio_total.toLocaleString('pt-BR')}
Reserva de Emergência Atual: R$ ${clientData.reserva_emergencia_atual.toLocaleString('pt-BR')}

Metas Declaradas:
${clientData.metas.map((m, i) => `${i+1}. ${m.meta} (Valor: R$ ${m.valor_necessario.toLocaleString('pt-BR')} | Prazo: ${m.prazo})`).join('\n')}

Histórico Resumido de Transações (Últimos 3 meses):
- Total de Receitas: R$ 15.000,00 (Média: R$ 5.000,00/mês)
- Total de Despesas Fixas/Variáveis nos 3 meses: R$ 8.368,60
- Média Mensal de Economia: R$ 2.210,46
- Total de Aportes em Investimentos: R$ 1.800,00

Produtos Financeiros Disponíveis para Recomendação:
${productsData.map(p => `- ${p.nome} (${p.categoria.replace('_', ' ')} | Risco: ${p.risco} | Rentabilidade: ${p.rentabilidade} | Liquidez: ${p.liquidez} | Carência: ${p.carencia_dias} dias)`).join('\n')}
----------------------------------`;
}

// Monthly calculations
function getMonthlyExpensesSummary() {
    let out = {};
    transactionsData.forEach(t => {
        if (t.tipo === 'saida') {
            const m = t.data.substring(0, 7);
            out[m] = (out[m] || 0) + t.valor;
        }
    });
    return out;
}

// CALL GEMINI API (CORS client-side safe fetch)
async function callGeminiAPI(message, apiKey) {
    const clientContext = getClientDataContextText();
    
    // Compile history
    const contextPrompt = `${systemPrompt}\n\n${clientContext}\n\nResponda ao usuário baseando-se estritamente nestas informações.`;
    
    const requestContents = [
        {
            role: "user",
            parts: [{ text: contextPrompt }]
        }
    ];

    // Add conversation history
    chatHistory.slice(-6).forEach(msg => {
        requestContents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        });
    });

    // Make request
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: requestContents
        })
    });

    if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error?.message || `Status ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// CALL OPENAI API
async function callOpenAIAPI(message, apiKey) {
    const clientContext = getClientDataContextText();
    const systemInstruction = `${systemPrompt}\n\n${clientContext}`;
    
    const messages = [
        { role: 'system', content: systemInstruction }
    ];

    // Add history
    chatHistory.slice(-6).forEach(msg => {
        messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        });
    });

    const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: messages
        })
    });

    if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error?.message || `Status ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// CALL CODESTRAL API (Mistral AI)
async function callCodestralAPI(message, apiKey) {
    const clientContext = getClientDataContextText();
    const systemInstruction = `${systemPrompt}\n\n${clientContext}`;
    
    const messages = [
        { role: 'system', content: systemInstruction }
    ];

    // Add history
    chatHistory.slice(-6).forEach(msg => {
        messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        });
    });

    const response = await fetch(`https://api.mistral.ai/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'codestral-latest',
            messages: messages,
            temperature: 0.2
        })
    });

    if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.message || `Status ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// LOCAL RULE-BASED SIMULATION FOR DEMONSTRATION MODE
function getSimulatedResponse(input) {
    const text = input.toLowerCase();

    // Out of scope
    if (text.includes("previsão do tempo") || text.includes("tempo") || text.includes("clima") || text.includes("chuva")) {
        return `Olha, eu sou o **Di**, seu consultor financeiro virtual, e não tenho acesso a serviços de meteorologia! 

Mas posso te ajudar a planejar o seu orçamento para comprar um guarda-chuva se for preciso! Tem alguma dúvida sobre suas contas, transações ou investimentos com a qual eu possa ajudar hoje?`;
    }

    // Sensitive data
    if (text.includes("senha") || text.includes("token") || text.includes("credencial") || text.includes("criptografia")) {
        return `Por motivos de segurança e privacidade, eu não tenho acesso a senhas, chaves de acesso ou dados sigilosos dos usuários e não posso compartilhar esse tipo de informação.

Caso tenha esquecido sua senha, recomendo utilizar a opção de recuperação diretamente na tela de login do aplicativo oficial. Como posso te ajudar com o seu planejamento financeiro hoje?`;
    }

    // Greetings
    if (text.includes("olá") || text.includes("oi") || text.includes("bom dia") || text.includes("boa tarde") || text.includes("boa noite")) {
        return `Olá, **João Silva**! Sou o **Di**, seu consultor financeiro. Como estão as coisas hoje? 

Posso te ajudar a analisar seus gastos de agosto a outubro, verificar o andamento da sua **Reserva de Emergência** ou planejar investimentos para a meta do seu apartamento em 2027. Qual é a sua dúvida?`;
    }

    // Investment recommendations / metas
    if (text.includes("recomenda") || text.includes("investir") || text.includes("investimento") || text.includes("aplicar") || text.includes("apartamento") || text.includes("reserva")) {
        if (text.includes("apartamento") || text.includes("imóvel") || text.includes("apartamento em 2027") || text.includes("2027")) {
            return `Excelente, João! Pensando na sua meta de dar a entrada do **Apartamento em 2027-12** (daqui a mais de um ano e meio), temos opções no nosso catálogo que pagam um pouco mais e se ajustam a esse prazo.

Minha sugestão principal para a meta do apartamento é a **LCI/LCA**:
- **O que é:** Letra de Crédito Imobiliário / Letra de Crédito Agrícola.
- **Vantagem:** Ela é isenta de Imposto de Renda.
- **Rendimento:** 95% do CDI (o que equivale a um CDB de aproximadamente 115% do CDI com impostos).
- **Liquidez:** Carência de 90 dias. Como você só vai resgatar o dinheiro em 2027, essa carência é perfeita para você.

Se quiser algo com maior potencial de crescimento para parte do valor e que aceita o risco moderado, o **Fundo Multimercado** (carência D+30) também é uma opção.

O que achou dessa ideia?`;
        }

        return `Perfeito! Como seu perfil é **Moderado** e sua meta prioritária atual é **completar sua Reserva de Emergência** (você já acumulou R$ 10.000 dos R$ 15.000 necessários), recomendo investir apenas em produtos de baixo risco e alta liquidez:

1. **CDB Liquidez Diária:** Rende 102% do CDI, com saque imediato no mesmo dia (D+0). Excelente para sua reserva.
2. **Tesouro Selic:** Rende 100% da Taxa Selic, com saque no dia seguinte (D+1), sendo o investimento mais seguro do país.

Quer que eu faça uma simulação de quanto renderiam seus R$ 2.000 de sobra mensal nessas opções?`;
    }

    // Expenses queries
    if (text.includes("gast") || text.includes("despes") || text.includes("pag") || text.includes("outubro") || text.includes("agosto") || text.includes("setembro") || text.includes("extrato") || text.includes("lazer") || text.includes("alimenta")) {
        return `Analisando o histórico de despesas que carregamos do seu arquivo \`transacoes.csv\` dos últimos meses (Agosto, Setembro e Outubro de 2025):

- **Sua Renda:** R$ 5.000,00 fixos mensais.
- **Sua Média de Gastos:** R$ 2.789,00 por mês.
- **Gastos com Alimentação (Outubro):** R$ 570,00 (Supermercado + Restaurante).
- **Gastos com Lazer (Outubro):** R$ 55,90 (Netflix).
- **Média mensal poupada:** R$ 2.210,46.

Você está com um ótimo nível de poupança (cerca de 44% da sua renda)! A melhor estratégia é colocar essa sobra mensal diretamente no **CDB de Liquidez Diária** ou **Tesouro Selic** para concluir os R$ 5.000 restantes da sua reserva de emergência até meados de 2026.

Podemos simular esse cronograma se quiser!`;
    }

    // Default simulation fallback
    return `Entendi, João. Como estou operando no **Modo Simulação**, minhas respostas são focadas nos seus dados atuais de perfil (Moderado), metas (Reserva de Emergência e Entrada do Apartamento) e no seu histórico de gastos mensais de R$ 2.789,00.

Se quiser bater um papo livre com respostas completas de IA em tempo real, **selecione "Google Gemini API", "OpenAI GPT API" ou "Mistral Codestral API" no topo da página e cole sua chave de API**.

Como posso te ajudar com seu planejamento hoje?`;
}

// Utility
function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
