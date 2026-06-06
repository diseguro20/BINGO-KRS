/**
 * Instagram Assistant Extension v1.5
 * Content Script
 */

(function() {
    // Evita injetar em frames secundários
    if (window.self !== window.top) return;

    // Wrapper de armazenamento compatível com Extensão (chrome.storage) e F12 Console (localStorage)
    const storage = {
        get: function(key) {
            return new Promise((resolve) => {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get([key], (result) => resolve(result[key]));
                } else {
                    try {
                        const val = localStorage.getItem('ig_assist_' + key);
                        resolve(val ? JSON.parse(val) : null);
                    } catch(e) {
                        resolve(null);
                    }
                }
            });
        },
        set: function(key, value) {
            return new Promise((resolve) => {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({ [key]: value }, resolve);
                } else {
                    try {
                        localStorage.setItem('ig_assist_' + key, JSON.stringify(value));
                    } catch(e) {}
                    resolve();
                }
            });
        }
    };

    // Remove qualquer painel existente
    const existingPanel = document.getElementById('antigravity-instagram-panel');
    if (existingPanel) existingPanel.remove();
    const existingBubble = document.getElementById('antigravity-instagram-bubble');
    if (existingBubble) existingBubble.remove();

    // 1. Cria o botão bolha flutuante para abrir/fechar o painel
    const bubble = document.createElement('div');
    bubble.id = 'antigravity-instagram-bubble';
    bubble.style.position = 'fixed';
    bubble.style.bottom = '25px';
    bubble.style.right = '25px';
    bubble.style.width = '56px';
    bubble.style.height = '56px';
    bubble.style.borderRadius = '50%';
    bubble.style.background = 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)';
    bubble.style.boxShadow = '0 6px 20px rgba(220, 39, 67, 0.4)';
    bubble.style.cursor = 'pointer';
    bubble.style.zIndex = '9999998';
    bubble.style.display = 'flex';
    bubble.style.alignItems = 'center';
    bubble.style.justifyContent = 'center';
    bubble.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    bubble.style.userSelect = 'none';

    // SVG do logo do Instagram em linhas
    bubble.innerHTML = `
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
        </svg>
    `;

    document.body.appendChild(bubble);

    // Efeitos de Hover na bolha
    bubble.addEventListener('mouseenter', () => {
        bubble.style.transform = 'scale(1.1) rotate(5deg)';
        bubble.style.boxShadow = '0 8px 24px rgba(220, 39, 67, 0.6)';
    });
    bubble.addEventListener('mouseleave', () => {
        bubble.style.transform = 'scale(1) rotate(0deg)';
        bubble.style.boxShadow = '0 6px 20px rgba(220, 39, 67, 0.4)';
    });

    // 2. Cria o container do painel
    const container = document.createElement('div');
    container.id = 'antigravity-instagram-panel';
    container.style.position = 'fixed';
    container.style.top = '30px';
    container.style.right = '30px';
    container.style.zIndex = '9999999';
    container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    container.style.display = 'none'; // Inicialmente oculto
    
    // Cria o Shadow DOM
    const shadow = container.attachShadow({mode: 'open'});
    
    // Estilos CSS do painel
    const style = document.createElement('style');
    style.textContent = `
        :host {
            --bg-glass: rgba(15, 15, 20, 0.93);
            --border-glass: rgba(255, 255, 255, 0.08);
            --text-main: #f5f5f7;
            --text-muted: #8e8e93;
            --accent-gradient: linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
            --btn-start-grad: linear-gradient(135deg, #00b09b, #96c93d);
            --btn-stop-grad: linear-gradient(135deg, #ff416c, #ff4b2b);
            --panel-width: 380px;
        }

        .panel-wrapper {
            width: var(--panel-width);
            background: var(--bg-glass);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid var(--border-glass);
            border-radius: 16px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
            color: var(--text-main);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            user-select: none;
            box-sizing: border-box;
        }

        .header {
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid var(--border-glass);
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .title-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .title-icon {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--accent-gradient);
            box-shadow: 0 0 10px rgba(220, 39, 67, 0.6);
        }

        .title {
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.5px;
            background: var(--accent-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .version {
            font-size: 10px;
            color: var(--text-muted);
            font-weight: normal;
        }

        .close-btn {
            background: none;
            border: none;
            color: var(--text-muted);
            font-size: 20px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
            transition: color 0.2s;
        }

        .close-btn:hover {
            color: #ff5f56;
        }

        .tabs {
            display: flex;
            background: rgba(0, 0, 0, 0.3);
            border-bottom: 1px solid var(--border-glass);
        }

        .tab-btn {
            flex: 1;
            padding: 14px;
            background: none;
            border: none;
            color: var(--text-muted);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
            border-bottom: 2px solid transparent;
            letter-spacing: 0.5px;
        }

        .tab-btn.active {
            color: var(--text-main);
            border-bottom: 2px solid #e6683c;
            background: rgba(255, 255, 255, 0.02);
        }

        .content {
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            box-sizing: border-box;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        label {
            font-size: 10px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 700;
        }

        .input-row {
            display: flex;
            gap: 12px;
        }

        .input-wrapper {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .input-wrapper span {
            font-size: 9px;
            color: var(--text-muted);
        }

        input[type="number"] {
            width: 100%;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-glass);
            border-radius: 8px;
            color: var(--text-main);
            font-size: 14px;
            outline: none;
            box-sizing: border-box;
            transition: all 0.2s;
        }

        input[type="number"]:focus {
            border-color: rgba(230, 104, 60, 0.6);
            background: rgba(255, 255, 255, 0.08);
        }

        .checkbox-container {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
            cursor: pointer;
            padding: 4px 0;
        }

        .checkbox-container input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: #e6683c;
            cursor: pointer;
        }

        .btn-action {
            padding: 12px 18px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            border: none;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .btn-start {
            background: var(--btn-start-grad);
            box-shadow: 0 4px 15px rgba(0, 176, 155, 0.3);
        }

        .btn-start:hover {
            opacity: 0.95;
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(0, 176, 155, 0.4);
        }

        .btn-stop {
            background: var(--btn-stop-grad);
            box-shadow: 0 4px 15px rgba(255, 75, 43, 0.3);
        }

        .btn-stop:hover {
            opacity: 0.95;
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(255, 75, 43, 0.4);
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid var(--border-glass);
            color: var(--text-main);
            font-size: 11px;
            padding: 10px 14px;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .btn-secondary.scanning {
            background: rgba(240, 148, 51, 0.2);
            border-color: #f09433;
            color: #ffeaa7;
            animation: pulse-border 1.5s infinite;
        }

        @keyframes pulse-border {
            0% { border-color: rgba(240, 148, 51, 0.4); }
            50% { border-color: rgba(240, 148, 51, 1); }
            100% { border-color: rgba(240, 148, 51, 0.4); }
        }

        /* Dashboard Stats */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            background: rgba(0, 0, 0, 0.25);
            border-radius: 10px;
            padding: 12px;
            border: 1px solid var(--border-glass);
        }

        .stat-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }

        .stat-val {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-main);
        }

        .stat-lbl {
            font-size: 9px;
            color: var(--text-muted);
            text-transform: uppercase;
            margin-top: 4px;
            letter-spacing: 0.5px;
        }

        /* Console Log Container */
        .terminal {
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid var(--border-glass);
            border-radius: 10px;
            padding: 12px;
            height: 140px;
            overflow-y: auto;
            font-family: "Courier New", Courier, monospace;
            font-size: 11px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            scroll-behavior: smooth;
            box-sizing: border-box;
        }

        .log-entry {
            line-height: 1.4;
            word-break: break-all;
        }

        .log-time {
            color: #70a1ff;
            margin-right: 6px;
            font-weight: bold;
        }

        .log-info { color: #f5f5f7; }
        .log-success { color: #2ed573; font-weight: 600; }
        .log-warning { color: #ffa502; }
        .log-error { color: #ff4757; font-weight: 600; }

        /* Security Disclaimer Box */
        .alert-box {
            background: rgba(255, 165, 2, 0.08);
            border-left: 4px solid #ffa502;
            padding: 12px;
            border-radius: 6px;
            font-size: 11px;
            color: #ffeaa7;
            line-height: 1.45;
        }

        .alert-box strong {
            color: #ffa502;
        }

        /* Pulse State Indicator */
        .status-indicator {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            font-weight: 700;
            color: var(--text-muted);
        }

        .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #8e8e93;
            transition: all 0.3s;
        }

        .dot.active {
            background: #2ed573;
            box-shadow: 0 0 10px #2ed573;
            animation: pulse 1.8s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.25); opacity: 0.5; }
            100% { transform: scale(1); opacity: 1; }
        }
    `;
    
    shadow.appendChild(style);
    
    // Estrutura HTML do Painel
    const panel = document.createElement('div');
    panel.className = 'panel-wrapper';
    
    panel.innerHTML = `
        <div class="header" id="panel-header">
            <div class="title-group">
                <div class="title-icon"></div>
                <span class="title">Instagram Assistant</span>
                <span class="version">v1.5</span>
            </div>
            <div class="status-indicator">
                <div class="dot" id="status-dot"></div>
                <span id="status-text">INATIVO</span>
                <button id="btn-logout" style="background: none; border: none; color: #ff5f56; font-size: 10px; cursor: pointer; font-weight: bold; margin-left: 8px; display: none; padding: 0; text-transform: uppercase; letter-spacing: 0.5px;">Sair</button>
            </div>
            <button class="close-btn" id="panel-close">&times;</button>
        </div>
        
        <!-- TELA DE LOGIN -->
        <div id="panel-login" style="display: flex; flex-direction: column; gap: 16px; padding: 20px; box-sizing: border-box;">
            <div style="text-align: center; margin-bottom: 8px;">
                <h3 style="margin: 0 0 4px 0; font-size: 15px; color: var(--text-main); font-weight: bold; letter-spacing: 0.5px;">Acesso Restrito</h3>
                <span style="font-size: 11px; color: var(--text-muted);">Faça login para utilizar a ferramenta</span>
            </div>
            <div class="form-group">
                <label>Usuário</label>
                <input type="text" id="login-username" style="width: 100%; padding: 10px 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); border-radius: 8px; color: var(--text-main); font-size: 14px; outline: none; box-sizing: border-box;" placeholder="Usuário">
            </div>
            <div class="form-group">
                <label>Senha</label>
                <input type="password" id="login-password" style="width: 100%; padding: 10px 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-glass); border-radius: 8px; color: var(--text-main); font-size: 14px; outline: none; box-sizing: border-box;" placeholder="Senha">
            </div>
            <div id="login-error" style="color: #ff4757; font-size: 11px; text-align: center; display: none; font-weight: bold;">Usuário ou senha incorretos!</div>
            <button class="btn-action btn-start" id="btn-login-submit" style="width: 100%;">Entrar</button>
        </div>

        <!-- CONTROLES DO PAINEL (BLOQUEADO INICIALMENTE) -->
        <div id="panel-controls" style="display: none; flex-direction: column;">
            <div class="tabs">
                <button class="tab-btn active" id="tab-btn-follow">SEGUIR AUTOMÁTICO</button>
                <button class="tab-btn" id="tab-btn-unfollow">DEIXAR DE SEGUIR</button>
            </div>
            
            <div class="content">
                <div class="alert-box">
                    <strong>ATENÇÃO:</strong> O Instagram monitora a velocidade das ações. Para sua segurança, use intervalos recomendados (15 a 45 seg) e evite ultrapassar 100-150 ações por dia para evitar bloqueio de conta.
                </div>
                
                <!-- ABA SEGUIR -->
                <div class="tab-content active" id="tab-follow">
                    <div class="form-group">
                        <label>Filtro de Gênero Inteligente</label>
                        <label class="checkbox-container">
                            <input type="checkbox" id="follow-females-only">
                            <span>Seguir apenas perfis FEMININOS (Heurística)</span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label>Intervalo Randômico (segundos)</label>
                        <div class="input-row">
                            <div class="input-wrapper">
                                <input type="number" id="follow-min-delay" value="20" min="5">
                                <span>Mínimo (s)</span>
                            </div>
                            <div class="input-wrapper">
                                <input type="number" id="follow-max-delay" value="45" min="6">
                                <span>Máximo (s)</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Limite de Seguidores nesta sessão</label>
                        <input type="number" id="follow-limit" value="40" min="1">
                    </div>
                    
                    <button class="btn-action btn-start" id="btn-follow-toggle">Iniciar Seguir</button>

                    <!-- HISTÓRICO DE AÇÕES -->
                    <div style="border-top: 1px solid var(--border-glass); margin-top: 14px; padding-top: 12px;">
                        <div id="toggle-history-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                            <span style="font-size: 10px; color: var(--text-muted); font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Seguidos nesta sessão (<span id="history-count">0</span>)</span>
                            <span id="history-arrow" style="font-size: 10px; color: var(--text-muted); transition: transform 0.2s; transform: rotate(0deg);">▼</span>
                        </div>
                        <div id="history-container" style="display: none; flex-direction: column; gap: 8px; max-height: 140px; overflow-y: auto; margin-top: 10px; padding-right: 4px; box-sizing: border-box;">
                            <!-- Perfis seguidos serão inseridos dinamicamente -->
                        </div>
                        <div style="text-align: right;">
                            <button id="btn-clear-history" style="background: none; border: none; color: #ff4757; font-size: 9px; cursor: pointer; text-transform: uppercase; font-weight: bold; margin-top: 8px; display: none; padding: 0; letter-spacing: 0.5px;">Limpar Histórico</button>
                        </div>
                    </div>
                </div>
                
                <!-- ABA DEIXAR DE SEGUIR -->
                <div class="tab-content" id="tab-unfollow">
                    <div class="form-group">
                        <label>Filtro de Não-Seguidores</label>
                        <label class="checkbox-container">
                            <input type="checkbox" id="unfollow-non-followers-only">
                            <span>Apenas quem NÃO me segue de volta</span>
                        </label>
                    </div>

                    <button class="btn-secondary" id="btn-scan-followers">
                        Escanear Não-Seguidores (<span id="scan-count">0</span> salvos)
                    </button>

                    <div class="form-group">
                        <label>Intervalo Randômico (segundos)</label>
                        <div class="input-row">
                            <div class="input-wrapper">
                                <input type="number" id="unfollow-min-delay" value="20" min="5">
                                <span>Mínimo (s)</span>
                            </div>
                            <div class="input-wrapper">
                                <input type="number" id="unfollow-max-delay" value="45" min="6">
                                <span>Máximo (s)</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>Limite de Unfollows nesta sessão</label>
                        <input type="number" id="unfollow-limit" value="40" min="1">
                    </div>
                    
                    <button class="btn-action btn-start" id="btn-unfollow-toggle">Iniciar Unfollows</button>
                </div>
                
                <!-- DASHBOARD DE METRICAS -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <span class="stat-val" id="stat-processed">0</span>
                        <span class="stat-lbl">Analisados</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-val" id="stat-success">0</span>
                        <span class="stat-lbl">Sucessos</span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-val" id="stat-errors">0</span>
                        <span class="stat-lbl">Erros</span>
                    </div>
                </div>
                
                <!-- LOGGER TERMINAL -->
                <div class="form-group">
                    <label>Logs do Sistema</label>
                    <div class="terminal" id="log-terminal">
                        <div class="log-entry">
                            <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
                            <span class="log-info">Painel Extensão v1.5 pronto. Clique na bolha do Instagram para abrir/fechar.</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    shadow.appendChild(panel);
    document.body.appendChild(container);
    
    // Toggle visual do painel ao clicar na bolha
    let panelVisible = false;
    bubble.addEventListener('click', () => {
        if (panelVisible) {
            container.style.display = 'none';
            panelVisible = false;
        } else {
            container.style.display = 'block';
            panelVisible = true;
            
            // Corrige se estiver posicionado fora da tela
            const rect = container.getBoundingClientRect();
            if (rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
                container.style.top = '30px';
                container.style.right = '30px';
                container.style.left = 'auto';
            }
        }
    });

    // Seleciona elementos do Shadow DOM
    const get = (sel) => shadow.querySelector(sel);
    
    const panelHeader = get('#panel-header');
    const closeBtn = get('#panel-close');
    const tabFollowBtn = get('#tab-btn-follow');
    const tabUnfollowBtn = get('#tab-btn-unfollow');
    const tabFollowContent = get('#tab-follow');
    const tabUnfollowContent = get('#tab-unfollow');
    const btnFollowToggle = get('#btn-follow-toggle');
    const btnUnfollowToggle = get('#btn-unfollow-toggle');
    const btnScanFollowers = get('#btn-scan-followers');
    const scanCountLabel = get('#scan-count');
    
    const statusDot = get('#status-dot');
    const statusText = get('#status-text');
    
    const statProcessed = get('#stat-processed');
    const statSuccess = get('#stat-success');
    const statErrors = get('#stat-errors');
    const logTerminal = get('#log-terminal');
    
    // Estado da Automação
    let isRunning = false;
    let currentMode = null; // 'follow' ou 'unfollow'
    let timeoutId = null;
    let successCount = 0;
    let processedCount = 0;
    let errorCount = 0;
    let lastVisitedPath = window.location.pathname;
    
    // Listas de relação carregadas
    let nonFollowersSet = new Set();
    let isScanningBackground = false;

    // --- BANCO DE DADOS DE GÊNEROS (HEURÍSTICA APRIMORADA) ---
    const femaleNames = [
        'maria', 'ana', 'julia', 'júlia', 'carla', 'fernanda', 'gabriela', 'camila', 'patricia', 'patrícia', 
        'leticia', 'letícia', 'larissa', 'amanda', 'luana', 'aline', 'bruna', 'jessica', 'jéssica', 'vanessa', 
        'mariana', 'carolina', 'carol', 'isabela', 'isabel', 'isa', 'beatriz', 'bia', 'bianca', 
        'renata', 'tatiane', 'tati', 'andreia', 'andréia', 'priscila', 'pri', 'juliana', 'ju', 'rafaela', 
        'rafa', 'talita', 'monica', 'mônica', 'sandra', 'cristina', 'cris', 'daniela', 'dani', 'eliana', 
        'gabriele', 'gabi', 'sabrina', 'flavia', 'flávia', 'carina', 'giovana', 'giovanna', 'gi', 'luciana', 'lu', 
        'sarah', 'sara', 'clara', 'sophia', 'sofia', 'helena', 'alice', 'valentina', 'laura', 
        'manuela', 'manu', 'lorena', 'cecilia', 'cecília', 'heloisa', 'heloísa', 'helo', 
        'yasmin', 'emilly', 'emily', 'eduarda', 'duda', 'vitoria', 'vitória', 'vi', 'rebeca', 'agatha', 'catarina', 
        'livia', 'lívia', 'milena', 'mi', 'nicole', 'brenda', 'alicia', 'ester', 'barbara', 'bárbara',
        'debora', 'débora', 'deby', 'marisa', 'regina', 'silvia', 'sílvia', 'teresa', 'tereza', 'solange',
        'elizabeth', 'eliza', 'adriana', 'dri', 'marcela', 'nathalia', 'natalia', 'naty',
        'pamela', 'pâmela', 'nayara', 'naiara', 'karina', 'tamires', 'thais', 'thaís', 'tais', 'taís', 'ariane',
        'suelen', 'suellen', 'michele', 'michelle', 'kelly', 'paola', 'paloma', 'ingrid',
        'stefany', 'stephanie', 'jenifer', 'jennifer', 'joyce', 'giselle', 'gisele', 'liv', 're'
    ];

    const femaleNicknames = [
        'bella', 'belle', 'nanda', 'aninha', 'bru', 'gabi', 'carol', 'bell', 'isa', 'duda', 
        'manu', 'lulu', 'tati', 'pati', 'mari', 'rebeca', 'juju', 'cacau', 'kaka', 'keke',
        'nathy', 'dani', 'pri', 'rafinha', 'isinha', 'lety', 'lari', 'tata', 'vivi'
    ];

    const femaleKeywords = [
        'makeup', 'maquiagem', 'unhas', 'nails', 'cilios', 'lashes', 'sobrancelha', 'brows', 
        'beauty', 'beleza', 'fashion', 'modafeminina', 'mulher', 'girl', 'girls', 'lady', 'ladies', 
        'queen', 'princess', 'princesa', 'mamae', 'mãe', 'mae', 'materna', 'ela', 'she', 'her', 
        'dra', 'professora', 'nutricionista', 'psicologa', 'esteticista', 'hair', 'cabelo'
    ];

    const maleNames = [
        'fabricio', 'fabrício', 'joao', 'joão', 'jose', 'josé', 'pedro', 'lucas', 'mateus', 'matheus', 
        'felipe', 'philippe', 'gabriel', 'thiago', 'tiago', 'diego', 'marcos', 'marcus', 'andre', 'andré', 
        'rodrigo', 'bruno', 'gustavo', 'rafael', 'daniel', 'marcelo', 'alexandre', 'ricardo', 'fernando', 
        'paulo', 'carlos', 'roberto', 'eduardo', 'luiz', 'luis', 'luís', 'guilherme', 'otavio', 'otávio', 
        'vitor', 'vítor', 'victor', 'hugo', 'leonardo', 'leo', 'léo', 'igor', 'douglas', 'arthur', 'artur', 
        'caio', 'heitor', 'samuel', 'enzo', 'miguel', 'davi', 'murilo', 'renan', 'alex', 'alan', 'kleber', 
        'cleber', 'everton', 'weverton', 'willian', 'william', 'wellington', 'jorge', 'antonio', 'antônio', 
        'francisco', 'manoel', 'manuel', 'valter', 'walter', 'gilberto', 'claudio', 'cláudio', 'mauro', 
        'cesar', 'césar', 'fabio', 'fábio', 'ronaldo', 'adriano', 'rogerio', 'rogério', 'marcio', 'márcio', 
        'jonas', 'jonathan', 'jhonatan', 'marcel', 'hudson', 'robson', 'sandro', 'junior', 'júnior', 'neto', 
        'filho', 'pai', 'senhor', 'sr', 'mr', 'boy', 'guy', 'man', 'men', 'king', 'prince', 'brother', 'bro',
        'marido', 'namorado', 'zayn', 'zayn7'
    ];

    function getProfileGender(username, displayName) {
        const userLower = username.toLowerCase();
        const displayLower = displayName.toLowerCase();
        
        const containsWord = (text, wordList) => {
            return wordList.some(word => {
                const regex = new RegExp(`(^|[_\\.\\s\\d])${word}([_\\.\\s\\d]|$)`, 'i');
                return regex.test(text);
            });
        };

        const matchesFemalePattern = (text) => {
            if (/[a-z]+inha\b/.test(text) || /[a-z]+zinha\b/.test(text)) return true;
            if (/(_|\.)[a-z]*a\b/.test(text)) return true;
            return false;
        };

        if (containsWord(displayLower, maleNames) || containsWord(userLower, maleNames)) {
            return 'MALE';
        }
        
        const hasFemaleIndicator = 
            containsWord(displayLower, femaleNames) || 
            containsWord(userLower, femaleNames) || 
            containsWord(userLower, femaleNicknames) || 
            containsWord(displayLower, femaleNicknames) ||
            containsWord(userLower, femaleKeywords) || 
            containsWord(displayLower, femaleKeywords) ||
            matchesFemalePattern(userLower);

        if (hasFemaleIndicator) {
            return 'FEMALE';
        }
        
        return 'UNKNOWN';
    }
    
    function log(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-${type}">${message}</span>`;
        logTerminal.appendChild(entry);
        logTerminal.scrollTop = logTerminal.scrollHeight;
    }
    
    // Drag painel
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    panelHeader.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
        panelHeader.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        container.style.left = `${e.clientX - offsetX}px`;
        container.style.top = `${e.clientY - offsetY}px`;
        container.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            panelHeader.style.cursor = 'move';
        }
    });
    
    closeBtn.addEventListener('click', () => {
        container.style.display = 'none';
        panelVisible = false;
    });
    
    tabFollowBtn.addEventListener('click', () => {
        if (isRunning || isScanningBackground) return;
        tabFollowBtn.classList.add('active');
        tabUnfollowBtn.classList.remove('active');
        tabFollowContent.classList.add('active');
        tabUnfollowContent.classList.remove('active');
    });
    
    tabUnfollowBtn.addEventListener('click', () => {
        if (isRunning || isScanningBackground) return;
        tabUnfollowBtn.classList.add('active');
        tabFollowBtn.classList.remove('active');
        tabUnfollowContent.classList.add('active');
        tabFollowContent.classList.remove('active');
    });
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    function findButtonsByText(textOptions) {
        const selectors = 'button, div[role="button"], div[role="menuitem"], span, div';
        const elements = Array.from(document.querySelectorAll(selectors));
        return elements.filter(el => {
            const txt = el.innerText ? el.innerText.trim().toLowerCase() : '';
            if (!txt) return false;
            const isMatch = textOptions.some(opt => txt === opt);
            if (!isMatch) return false;
            return el.querySelectorAll('*').length <= 2;
        });
    }

    function findFollowButtons() {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        return buttons.filter(btn => {
            const txt = btn.innerText ? btn.innerText.trim().toLowerCase() : '';
            if (!txt) return false;
            const matchesFollow = txt.includes('seguir') || txt.includes('follow');
            const matchesExclude = txt.includes('seguindo') || 
                                  txt.includes('following') || 
                                  txt.includes('solicitado') || 
                                  txt.includes('requested') || 
                                  txt.includes('deixar de seguir') || 
                                  txt.includes('unfollow');
            return matchesFollow && !matchesExclude;
        });
    }

    function findUnfollowButtons() {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        return buttons.filter(btn => {
            const txt = btn.innerText ? btn.innerText.trim().toLowerCase() : '';
            if (!txt) return false;
            const matchesUnfollow = txt.includes('seguindo') || 
                                    txt.includes('following') || 
                                    txt.includes('solicitado') || 
                                    txt.includes('requested') || 
                                    txt.includes('deixar de seguir') || 
                                    txt.includes('unfollow');
            return matchesUnfollow;
        });
    }

    function getScrollContainer() {
        const activeDialog = document.querySelector('div[role="dialog"]');
        if (activeDialog) {
            const scrollDiv = activeDialog.querySelector('div._aano') || activeDialog.querySelector('div[style*="overflow-y: auto"]');
            if (scrollDiv) return scrollDiv;
        }
        const suggestionsScroll = document.querySelector('div._aano');
        if (suggestionsScroll) return suggestionsScroll;
        return window;
    }

    function extractUsernameFromUrl(url) {
        if (!url) return null;
        try {
            let path = url.split('?')[0];
            if (path.startsWith('http')) {
                path = new URL(path).pathname;
            }
            const parts = path.split('/').filter(Boolean);
            if (parts.length > 0) {
                const user = parts[0].toLowerCase().trim();
                if (!['explore', 'direct', 'stories', 'emails', 'developer', 'about', 'legal', 'help', 'p', 'reels', 'accounts'].includes(user)) {
                    return user;
                }
            }
        } catch(e) {}
        return null;
    }

    function getUsernameFromRow(row) {
        const links = Array.from(row.querySelectorAll('a[href]'));
        for (const link of links) {
            const href = link.getAttribute('href');
            const user = extractUsernameFromUrl(href);
            if (user) return user;
        }
        return null;
    }

    function getDisplayNameFromRow(row, username) {
        const elements = Array.from(row.querySelectorAll('span, div'));
        for (const el of elements) {
            if (el.children.length === 0) {
                const txt = el.innerText ? el.innerText.trim() : '';
                if (txt && txt.toLowerCase() !== username.toLowerCase() && 
                    !['seguir', 'follow', 'seguindo', 'following', 'solicitado', 'requested', 'deixar de seguir', 'unfollow'].includes(txt.toLowerCase())) {
                    return txt;
                }
            }
        }
        return '';
    }

    // Detecta se estamos na página de perfil principal de alguém e extrai as info
    function getProfilePageInfo() {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        if (pathParts.length === 0) return null;
        
        const username = pathParts[0].toLowerCase().trim();
        if (['explore', 'direct', 'stories', 'emails', 'developer', 'about', 'legal', 'help', 'p', 'reels', 'accounts'].includes(username)) {
            return null;
        }
        
        let displayName = '';
        const headerSpans = Array.from(document.querySelectorAll('header section span'));
        for (const span of headerSpans) {
            const txt = span.innerText ? span.innerText.trim() : '';
            if (txt && txt !== username && !txt.includes('seguidores') && !txt.includes('seguindo') && !txt.includes('publicações')) {
                displayName = txt;
                break;
            }
        }
        
        return { username, displayName };
    }

    function getIgAppId() {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
            const text = script.textContent;
            if (text) {
                const match = text.match(/"appId":"(\d+)"/);
                if (match) return match[1];
            }
        }
        return '936619743392459';
    }
    
    // --- LÓGICA DO ESCANEADOR DE NÃO-SEGUIDORES (CRUZAMENTO 100% EXATO VIA API) ---
    btnScanFollowers.addEventListener('click', () => {
        if (isRunning) {
            log('Pare a automação ativa primeiro.', 'warning');
            return;
        }

        if (isScanningBackground) {
            isScanningBackground = false;
        } else {
            startScanningBackgroundRelations();
        }
    });

    // Baixa ambas as listas (Seguidores e Seguindo) e realiza a comparação perfeita em memória
    async function startScanningBackgroundRelations() {
        isScanningBackground = true;
        btnScanFollowers.innerText = 'Buscando...';
        btnScanFollowers.classList.add('scanning');
        
        statusDot.classList.add('active');
        statusText.innerText = 'ESCANEANDO...';
        statusText.style.color = '#ffa502';
        
        nonFollowersSet.clear();
        const followingList = [];
        const followersList = [];
        
        try {
            log('Iniciando varredura de relações em segundo plano...', 'info');

            // 1. Obter ID do usuário logado
            let loggedUserId = null;
            try {
                loggedUserId = document.cookie.split('; ').find(row => row.startsWith('ds_user_id='))?.split('=')[1];
            } catch(e) {}
            
            if (!loggedUserId) {
                loggedUserId = window._sharedData?.config?.viewerId;
            }
            
            if (!loggedUserId) {
                const scripts = Array.from(document.querySelectorAll('script'));
                for (const s of scripts) {
                    const text = s.textContent;
                    if (text) {
                        const match = text.match(/"viewerId"\s*:\s*"(\d+)"/) || 
                                      text.match(/"userId"\s*:\s*"(\d+)"/) || 
                                      text.match(/"actorID"\s*:\s*"(\d+)"/) ||
                                      text.match(/"ds_user_id"\s*:\s*"(\d+)"/);
                        if (match) {
                            loggedUserId = match[1];
                            break;
                        }
                    }
                }
            }
            
            if (!loggedUserId) {
                throw new Error('Não foi possível identificar o ID do seu perfil logado. Recarregue a página.');
            }
            
            const appId = getIgAppId();
            const csrfToken = document.cookie.split('; ').find(row => row.startsWith('csrftoken='))?.split('=')[1];
            const reqHeaders = {
                'X-Requested-With': 'XMLHttpRequest',
                'X-IG-App-ID': appId
            };
            if (csrfToken) {
                reqHeaders['X-CSRFToken'] = csrfToken;
            }

            // Passo 1: Buscar quem você segue (Following)
            log('Passo 1/2: Carregando a lista de quem você segue...', 'info');
            let maxId = '';
            let hasNext = true;
            
            while (hasNext && isScanningBackground) {
                let url = `/api/v1/friendships/${loggedUserId}/following/?count=200`;
                if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;
                
                const response = await fetch(url, {
                    headers: reqHeaders
                });
                
                if (response.status === 429) {
                    log('Aviso: Aguardando 12 segundos devido a limites do Instagram...', 'warning');
                    await sleep(12000);
                    continue;
                }
                if (!response.ok) throw new Error(`Status HTTP ${response.status}`);
                
                const data = await response.json();
                if (data.users && data.users.length > 0) {
                    data.users.forEach(u => {
                        if (u.username) followingList.push(u.username.toLowerCase().trim());
                    });
                    log(`Seguindo: ${followingList.length} perfis carregados...`, 'info');
                }
                maxId = data.next_max_id;
                hasNext = !!maxId;
                
                if (hasNext) await sleep(1500);
            }
            
            if (!isScanningBackground) return;
            
            // Passo 2: Buscar seus seguidores (Followers)
            log('Passo 2/2: Carregando a lista dos seus seguidores...', 'info');
            maxId = '';
            hasNext = true;
            
            while (hasNext && isScanningBackground) {
                let url = `/api/v1/friendships/${loggedUserId}/followers/?count=200`;
                if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;
                
                const response = await fetch(url, {
                    headers: reqHeaders
                });
                
                if (response.status === 429) {
                    log('Aviso: Aguardando 12 segundos devido a limites do Instagram...', 'warning');
                    await sleep(12000);
                    continue;
                }
                if (!response.ok) throw new Error(`Status HTTP ${response.status}`);
                
                const data = await response.json();
                if (data.users && data.users.length > 0) {
                    data.users.forEach(u => {
                        if (u.username) followersList.push(u.username.toLowerCase().trim());
                    });
                    log(`Seguidores: ${followersList.length} perfis carregados...`, 'info');
                }
                maxId = data.next_max_id;
                hasNext = !!maxId;
                
                if (hasNext) await sleep(1500);
            }
            
            if (!isScanningBackground) return;
            
            // Passo 3: Cruzamento de dados de forma 100% precisa
            log('Passo 3/3: Cruzando os dados...', 'info');
            const followersSet = new Set(followersList);
            
            followingList.forEach(user => {
                if (!followersSet.has(user)) {
                    nonFollowersSet.add(user);
                }
            });
            
            await storage.set('nonFollowers', Array.from(nonFollowersSet));
            scanCountLabel.innerText = nonFollowersSet.size;
            log(`Sucesso! De ${followingList.length} perfis que você segue, ${nonFollowersSet.size} NÃO te seguem de volta.`, 'success');
            
        } catch(err) {
            log(`Erro ao realizar a varredura: ${err.message}`, 'error');
        } finally {
            isScanningBackground = false;
            btnScanFollowers.innerText = `Escanear Não-Seguidores (${nonFollowersSet.size} salvos)`;
            btnScanFollowers.classList.remove('scanning');
            
            statusDot.classList.remove('active');
            statusText.innerText = 'INATIVO';
            statusText.style.color = 'var(--text-muted)';
        }
    }
    
    // --- LÓGICA DE INICIAR / PARAR AUTOMACÃO ---
    function startAutomation(mode) {
        if (isRunning) return;
        
        isRunning = true;
        currentMode = mode;
        
        statusDot.classList.add('active');
        statusText.innerText = mode === 'follow' ? 'SEGUINDO...' : 'UNFOLLOW...';
        statusText.style.color = '#2ed573';
        
        if (mode === 'follow') {
            btnFollowToggle.innerText = 'Parar Automação';
            btnFollowToggle.className = 'btn-action btn-stop';
        } else {
            btnUnfollowToggle.innerText = 'Parar Automação';
            btnUnfollowToggle.className = 'btn-action btn-stop';
        }
        
        log(`Automação iniciada no modo: ${mode === 'follow' ? 'SEGUIR' : 'UNFOLLOW'}`, 'info');
        executeStep();
    }
    
    function stopAutomation() {
        if (!isRunning) return;
        
        isRunning = false;
        if (timeoutId) clearTimeout(timeoutId);
        
        statusDot.classList.remove('active');
        statusText.innerText = 'INATIVO';
        statusText.style.color = 'var(--text-muted)';
        
        btnFollowToggle.innerText = 'Iniciar Seguir';
        btnFollowToggle.className = 'btn-action btn-start';
        btnUnfollowToggle.innerText = 'Iniciar Unfollows';
        btnUnfollowToggle.className = 'btn-action btn-start';
        
        log('Automação interrompida.', 'warning');
    }
    
    btnFollowToggle.addEventListener('click', () => {
        if (isRunning && currentMode === 'follow') {
            stopAutomation();
        } else if (!isRunning) {
            startAutomation('follow');
        }
    });
    
    btnUnfollowToggle.addEventListener('click', () => {
        if (isRunning && currentMode === 'unfollow') {
            stopAutomation();
        } else if (!isRunning) {
            startAutomation('unfollow');
        }
    });
    
    // --- LOOP PRINCIPAL DE EXECUÇÃO ---
    async function executeStep() {
        if (!isRunning) return;
        
        if (window.location.pathname !== lastVisitedPath) {
            lastVisitedPath = window.location.pathname;
            log(`Navegação para: ${lastVisitedPath}. Adaptando elementos...`, 'info');
        }

        const minDelay = parseInt(get(`#${currentMode}-min-delay`).value, 10) || 15;
        const maxDelay = parseInt(get(`#${currentMode}-max-delay`).value, 10) || 35;
        const limit = parseInt(get(`#${currentMode}-limit`).value, 10) || 40;
        
        if (successCount >= limit) {
            log(`Limite atingido (${limit} ações com sucesso). Encerrando.`, 'success');
            stopAutomation();
            return;
        }
        
        let didAction = false;
        const activeDialog = document.querySelector('div[role="dialog"]');
        const profileInfo = getProfilePageInfo();

        // CASO A: Estamos em uma página de perfil individual principal (e nenhuma listagem aberta)
        if (profileInfo && !activeDialog) {
            const username = profileInfo.username;
            const displayName = profileInfo.displayName;

            if (currentMode === 'follow') {
                const followButtons = findFollowButtons().filter(btn => {
                    return !btn.getAttribute('data-ag-visited');
                });

                if (followButtons.length > 0) {
                    const btn = followButtons[0];
                    btn.setAttribute('data-ag-visited', 'true');

                    const onlyFemales = get('#follow-females-only').checked;
                    if (onlyFemales) {
                        const gender = getProfileGender(username, displayName);
                        if (gender !== 'FEMALE') {
                            log(`[Filtro Gênero] Pulando perfil @${username} (Gênero: ${gender === 'MALE' ? 'Masculino' : 'Indefinido'})`, 'info');
                            processedCount++;
                            statProcessed.innerText = processedCount;
                            timeoutId = setTimeout(executeStep, 3000);
                            return;
                        }
                    }

                    try {
                        btn.style.outline = '3px solid #00b09b';
                        await sleep(800);
                        btn.click();
                        setTimeout(() => { if (btn) btn.style.outline = ''; }, 1200);

                        processedCount++;
                        successCount++;
                        statProcessed.innerText = processedCount;
                        statSuccess.innerText = successCount;
                        log(`Seguiu perfil: @${username} (${displayName})`, 'success');
                        
                        try {
                            const history = await storage.get('followedHistory') || [];
                            history.push({
                                username: username,
                                displayName: displayName,
                                url: `https://www.instagram.com/${username}/`,
                                timestamp: new Date().toLocaleString()
                            });
                            await storage.set('followedHistory', history);
                            await renderFollowHistory();
                        } catch(e) {}
                        
                        didAction = true;
                    } catch(err) {
                        errorCount++;
                        statErrors.innerText = errorCount;
                        log(`Erro ao seguir perfil @${username}: ${err.message}`, 'error');
                    }
                } else {
                    log('Aguardando botão "Seguir" ou navegação para outro perfil...', 'info');
                    timeoutId = setTimeout(executeStep, 3000);
                    return;
                }
            } else if (currentMode === 'unfollow') {
                const followingButtons = findUnfollowButtons().filter(btn => {
                    return !btn.getAttribute('data-ag-visited');
                });

                if (followingButtons.length > 0) {
                    const btn = followingButtons[0];
                    btn.setAttribute('data-ag-visited', 'true');

                    const onlyNonFollowers = get('#unfollow-non-followers-only').checked;
                    if (onlyNonFollowers) {
                        if (nonFollowersSet.size === 0) {
                            log('Erro: Lista de não-seguidores vazia. Escaneie primeiro!', 'error');
                            stopAutomation();
                            return;
                        }
                        const followsBack = !nonFollowersSet.has(username);
                        if (followsBack) {
                            log(`Pulando perfil @${username} (te segue de volta).`, 'info');
                            processedCount++;
                            statProcessed.innerText = processedCount;
                            timeoutId = setTimeout(executeStep, 3000);
                            return;
                        }
                    }

                    try {
                        btn.style.outline = '3px solid #ff416c';
                        await sleep(800);
                        btn.click();
                        setTimeout(() => { if (btn) btn.style.outline = ''; }, 1200);

                        await sleep(1500);
                        const confirmButtons = findButtonsByText(['deixar de seguir', 'unfollow']);
                        if (confirmButtons.length > 0) {
                            confirmButtons[0].click();
                            processedCount++;
                            successCount++;
                            statProcessed.innerText = processedCount;
                            statSuccess.innerText = successCount;
                            log(`Deixou de seguir perfil: @${username}`, 'success');
                            didAction = true;
                        } else {
                            log('Botão de confirmação de Unfollow não encontrado.', 'warning');
                            const cancelButtons = findButtonsByText(['cancelar', 'cancel']);
                            if (cancelButtons.length > 0) cancelButtons[0].click();
                        }
                    } catch(err) {
                        errorCount++;
                        statErrors.innerText = errorCount;
                        log(`Erro ao dar Unfollow no perfil: ${err.message}`, 'error');
                    }
                } else {
                    log('Aguardando botão "Seguindo" ou navegação para outro perfil...', 'info');
                    timeoutId = setTimeout(executeStep, 3000);
                    return;
                }
            }
        } 
        // CASO B: Processando uma listagem (lista de seguidores/seguindo aberta ou sugestões na página)
        else {
            if (currentMode === 'follow') {
                const onlyFemales = get('#follow-females-only').checked;
                const followButtons = findFollowButtons().filter(btn => {
                    return !btn.getAttribute('data-ag-visited');
                });
                
                if (followButtons.length === 0) {
                    log('Nenhum botão de Seguir visível. Rola a página...', 'warning');
                    const scrollContainer = getScrollContainer();
                    if (scrollContainer === window) window.scrollBy(0, 450);
                    else scrollContainer.scrollTop += 450;
                    
                    timeoutId = setTimeout(executeStep, 3500);
                    return;
                }
                
                const btn = followButtons[0];
                const row = btn.closest('div[role="dialog"] div, li, div');
                const username = row ? getUsernameFromRow(row) : null;
                const displayName = row && username ? getDisplayNameFromRow(row, username) : '';
                
                btn.setAttribute('data-ag-visited', 'true');

                // Filtragem inteligente feminina
                if (onlyFemales && username) {
                    const gender = getProfileGender(username, displayName);
                    if (gender !== 'FEMALE') {
                        log(`[Filtro Gênero] Pulando @${username} (Gênero: ${gender === 'MALE' ? 'Masculino' : 'Indefinido'})`, 'info');
                        processedCount++;
                        statProcessed.innerText = processedCount;
                        timeoutId = setTimeout(executeStep, 600);
                        return;
                    }
                }
                
                try {
                    btn.scrollIntoView({ block: 'center', inline: 'nearest' });
                    btn.style.outline = '3px solid #00b09b';
                    btn.style.outlineOffset = '2px';
                    
                    await sleep(800);
                    btn.click();
                    
                    setTimeout(() => { if (btn) btn.style.outline = ''; }, 1200);
                    
                    processedCount++;
                    successCount++;
                    statProcessed.innerText = processedCount;
                    statSuccess.innerText = successCount;
                    
                    log(`Seguiu: @${username || 'Usuário'} (${displayName})`, 'success');
                    
                    try {
                        const history = await storage.get('followedHistory') || [];
                        history.push({
                            username: username || 'Usuário',
                            displayName: displayName,
                            url: username ? `https://www.instagram.com/${username}/` : window.location.href,
                            timestamp: new Date().toLocaleString()
                        });
                        await storage.set('followedHistory', history);
                        await renderFollowHistory();
                    } catch(e) {}
                    
                    didAction = true;
                    
                } catch (err) {
                    errorCount++;
                    processedCount++;
                    statErrors.innerText = errorCount;
                    statProcessed.innerText = processedCount;
                    log(`Erro ao seguir: ${err.message}`, 'error');
                }
                
            } else if (currentMode === 'unfollow') {
                const onlyNonFollowers = get('#unfollow-non-followers-only').checked;

                if (onlyNonFollowers && nonFollowersSet.size === 0) {
                    log('Erro: Sua lista de não-seguidores está vazia. Execute a busca de não-seguidores primeiro!', 'error');
                    stopAutomation();
                    return;
                }

                const followingButtons = findUnfollowButtons().filter(btn => {
                    return !btn.getAttribute('data-ag-visited');
                });
                
                if (followingButtons.length === 0) {
                    log('Nenhum perfil "Seguindo" não-visitado nesta listagem. Rola a página...', 'warning');
                    const scrollContainer = getScrollContainer();
                    if (scrollContainer === window) window.scrollBy(0, 450);
                    else scrollContainer.scrollTop += 450;
                    
                    timeoutId = setTimeout(executeStep, 3500);
                    return;
                }
                
                const btn = followingButtons[0];
                const row = btn.closest('div[role="dialog"] div, li, div');
                const username = row ? getUsernameFromRow(row) : null;
                
                btn.setAttribute('data-ag-visited', 'true');

                // Filtro de quem segue de volta
                if (onlyNonFollowers && username) {
                    const followsBack = !nonFollowersSet.has(username);
                    if (followsBack) {
                        log(`Pulando @${username} (te segue de volta).`, 'info');
                        processedCount++;
                        statProcessed.innerText = processedCount;
                        timeoutId = setTimeout(executeStep, 600);
                        return;
                    }
                }
                
                try {
                    btn.scrollIntoView({ block: 'center', inline: 'nearest' });
                    btn.style.outline = '3px solid #ff416c';
                    btn.style.outlineOffset = '2px';
                    
                    await sleep(800);
                    btn.click();
                    
                    setTimeout(() => { if (btn) btn.style.outline = ''; }, 1200);
                    await sleep(1500);
                    
                    const confirmButtons = findButtonsByText(['deixar de seguir', 'unfollow']);
                    
                    if (confirmButtons.length > 0) {
                        confirmButtons[0].click();
                        
                        processedCount++;
                        successCount++;
                        statProcessed.innerText = processedCount;
                        statSuccess.innerText = successCount;
                        
                        log(`Deixou de seguir: @${username || 'Usuário'}`, 'success');
                        didAction = true;
                    } else {
                        log('Botão de confirmação de Unfollow não encontrado. Cancelando modal.', 'warning');
                        const cancelButtons = findButtonsByText(['cancelar', 'cancel']);
                        if (cancelButtons.length > 0) cancelButtons[0].click();
                        else {
                            const modalOverlay = document.querySelector('div[role="presentation"]');
                            if (modalOverlay) modalOverlay.click();
                        }
                        errorCount++;
                        processedCount++;
                        statErrors.innerText = errorCount;
                        statProcessed.innerText = processedCount;
                    }
                    
                } catch (err) {
                    errorCount++;
                    processedCount++;
                    statErrors.innerText = errorCount;
                    statProcessed.innerText = processedCount;
                    log(`Erro ao dar Unfollow: ${err.message}`, 'error');
                }
            }
        }
        
        // Cooldown randômico após executar uma ação
        if (didAction) {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            log(`Aguardando ${delay} segundos para o próximo ciclo...`, 'info');
            timeoutId = setTimeout(executeStep, delay * 1000);
        } else {
            timeoutId = setTimeout(executeStep, 3000);
        }
    }

    // Select login/history components in Shadow DOM
    const loginView = get('#panel-login');
    const controlsView = get('#panel-controls');
    const loginUsernameInput = get('#login-username');
    const loginPasswordInput = get('#login-password');
    const loginError = get('#login-error');
    const btnLoginSubmit = get('#btn-login-submit');
    const btnLogout = get('#btn-logout');

    const toggleHistoryHeader = get('#toggle-history-header');
    const historyContainer = get('#history-container');
    const historyArrow = get('#history-arrow');
    const historyCountLabel = get('#history-count');
    const btnClearHistory = get('#btn-clear-history');

    // History Toggle Event Listener
    let historyExpanded = false;
    toggleHistoryHeader.addEventListener('click', () => {
        historyExpanded = !historyExpanded;
        if (historyExpanded) {
            historyContainer.style.display = 'flex';
            historyArrow.style.transform = 'rotate(180deg)';
        } else {
            historyContainer.style.display = 'none';
            historyArrow.style.transform = 'rotate(0deg)';
        }
    });

    async function renderFollowHistory() {
        const history = await storage.get('followedHistory') || [];
        historyCountLabel.innerText = history.length;
        historyContainer.innerHTML = '';
        
        if (history.length === 0) {
            historyContainer.innerHTML = `<div style="font-size: 10px; color: var(--text-muted); text-align: center; padding: 8px 0;">Nenhum perfil seguido.</div>`;
            btnClearHistory.style.display = 'none';
            return;
        }
        
        btnClearHistory.style.display = 'inline-block';
        
        for (let i = history.length - 1; i >= 0; i--) {
            const item = history[i];
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-glass); border-radius: 6px; padding: 6px 10px; font-size: 11px; margin-bottom: 4px; box-sizing: border-box;';
            div.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <a href="${item.url}" target="_blank" style="color: #70a1ff; text-decoration: none; font-weight: bold;">@${item.username}</a>
                    <span style="font-size: 9px; color: var(--text-muted);">${item.displayName || ''}</span>
                </div>
                <span style="font-size: 9px; color: var(--text-muted);">${item.timestamp.split(' ')[1] || item.timestamp}</span>
            `;
            historyContainer.appendChild(div);
        }
    }

    btnClearHistory.addEventListener('click', async () => {
        if (confirm('Deseja limpar todo o histórico de seguidos?')) {
            await storage.set('followedHistory', []);
            renderFollowHistory();
        }
    });

    async function checkLoginState() {
        const loggedIn = await storage.get('isLoggedIn');
        if (loggedIn) {
            loginView.style.display = 'none';
            controlsView.style.display = 'flex';
            btnLogout.style.display = 'inline-block';
        } else {
            loginView.style.display = 'flex';
            controlsView.style.display = 'none';
            btnLogout.style.display = 'none';
        }
    }

    btnLoginSubmit.addEventListener('click', async () => {
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value;
        
        if (username === 'segd' && password === 'segd123') {
            loginError.style.display = 'none';
            loginUsernameInput.value = '';
            loginPasswordInput.value = '';
            await storage.set('isLoggedIn', true);
            await checkLoginState();
        } else {
            loginError.style.display = 'block';
        }
    });

    loginPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnLoginSubmit.click();
    });

    btnLogout.addEventListener('click', async () => {
        stopAutomation();
        await storage.set('isLoggedIn', false);
        await checkLoginState();
    });

    async function initStorageData() {
        const list = await storage.get('nonFollowers') || [];
        nonFollowersSet = new Set(list);
        scanCountLabel.innerText = nonFollowersSet.size;
        
        await renderFollowHistory();
        await checkLoginState();
    }

    initStorageData();
})();
