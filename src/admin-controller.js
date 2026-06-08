/**
 * BINGOKRS - Controlador do Painel do Administrador (admin.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { 
  criarEstadoInicial, 
  sortearProximaBola, 
  processarEstadoJogo, 
  gerarCartela90Bolas,
  avancarProximaRodada,
  verificarELimparEstadoSeAntigo
} from './game.js';

// Estado local do administrador
let estado = criarEstadoInicial();
let autoDrawRunning = false;
let autoAdvanceTimeoutId = null;

// Web Worker para o Sorteio Automático (evita throttling do navegador em background/minimizado)
const workerAutoDrawCode = `
  let timerId = null;
  let pauseTimeoutId = null;
  let isPaused = false;

  self.onmessage = function(e) {
    if (e.data.action === 'start') {
      if (timerId) clearInterval(timerId);
      isPaused = false;
      timerId = setInterval(() => {
        if (!isPaused) {
          self.postMessage('tick');
        }
      }, e.data.interval);
    } else if (e.data.action === 'stop') {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      if (pauseTimeoutId) {
        clearTimeout(pauseTimeoutId);
        pauseTimeoutId = null;
      }
      isPaused = false;
    } else if (e.data.action === 'pause') {
      isPaused = true;
      if (pauseTimeoutId) clearTimeout(pauseTimeoutId);
      pauseTimeoutId = setTimeout(() => {
        isPaused = false;
        pauseTimeoutId = null;
        self.postMessage('resumed');
      }, e.data.duration);
    }
  };
`;
let autoDrawWorker = null;
let autoDrawFallbackInterval = null;
try {
  const blobAutoDraw = new Blob([workerAutoDrawCode], { type: 'application/javascript' });
  autoDrawWorker = new Worker(URL.createObjectURL(blobAutoDraw));
  autoDrawWorker.onmessage = function(e) {
    if (e.data === 'tick') {
      executarTickAutoSorteio();
    } else if (e.data === 'resumed') {
      console.log('[AUTO-DRAW-WORKER] Pausa de prêmio encerrada. Sorteio retomado.');
    }
  };
} catch (err) {
  console.warn('[ADMIN] Web Worker para auto-sorteio falhou (CSP ou incompatibilidade). Usando fallback de setInterval.', err);
}
let premioPausado = false; // Pausa o auto-sorteio quando sai prêmio
let winnersAnterior = { quadra: 0, quina: 0, bingo: 0, acumulado: 0 }; // Track winner counts
let resettingGame = false; // Evita que o reset seja sobrescrito por snapshots antigos

// Elementos do DOM - Console e Sorteio
const gameStatusText = document.getElementById('game-status-text');
const gameStatusBadge = document.getElementById('game-status-badge');
const btnDrawBall = document.getElementById('btn-draw-ball');
const btnAutoDraw = document.getElementById('btn-auto-draw');
const btnPauseDraw = document.getElementById('btn-pause-draw');
const btnResetGame = document.getElementById('btn-reset-game');
const btnNextRound = document.getElementById('btn-next-round');
const autoDrawSpeed = document.getElementById('auto-draw-speed');
const drawnCountValue = document.getElementById('drawn-count-value');
const ballsLogContainer = document.getElementById('balls-log-container');

// Campos de Configuração
const inputSorteioId = document.getElementById('input-sorteio-id');
const inputCupomVal = document.getElementById('input-cupom-val');
const inputValQuadra = document.getElementById('input-val-quadra');
const inputValQuina = document.getElementById('input-val-quina');
const inputValBingo = document.getElementById('input-val-bingo');
const inputValAcumulado = document.getElementById('input-val-acumulado');
const inputValAcumuladoLimit = document.getElementById('input-val-acumulado-limit');
const btnSaveSettings = document.getElementById('btn-save-settings');

// Ganhadores
const winnersContainer = document.getElementById('winners-container');
const totalCardsValue = document.getElementById('total-cards-value');
const nextCardsValue = document.getElementById('next-cards-value');

// Campos de Direcionamento de Prêmio (Rigging)
const riggingControlBox = document.getElementById('rigging-control-box');
const riggingStatusMsg = document.getElementById('rigging-status-msg');
const riggingFields = document.getElementById('rigging-fields');
const selectAdminForcedPdv = document.getElementById('select-admin-forced-pdv');
const selectAdminRiggingProb = document.getElementById('select-admin-rigging-prob');
const btnSaveAdminRigging = document.getElementById('btn-save-admin-rigging');
const selectAdminRiggingRound = document.getElementById('select-admin-rigging-round');
const selectAdminRiggingMode = document.getElementById('select-admin-rigging-mode');
const groupAdminForcedPdv = document.getElementById('group-admin-forced-pdv');
const riggingAgentBox = document.getElementById('rigging-agent-box');
const riggingAgentStats = document.getElementById('rigging-agent-stats');
const riggingGeneralSummaryBox = document.getElementById('rigging-general-summary-box');
const riggingSummaryContent = document.getElementById('rigging-summary-content');
const checkboxRiggingQuadra = document.getElementById('checkbox-rigging-quadra');
const checkboxRiggingQuina = document.getElementById('checkbox-rigging-quina');
const checkboxRiggingBingo = document.getElementById('checkbox-rigging-bingo');
const inputRiggingAcumuladoLimit = document.getElementById('input-rigging-acumulado-limit');

let ultimoMetricas = null;

// Elementos de Agendamento da Rodada
const btnCancelCountdown = document.getElementById('btn-cancel-countdown');

// Campos do Painel da TV
const selectBottomPanel = document.getElementById('select-bottom-panel');
const inputPanelTitle = document.getElementById('input-panel-title');
const textareaPanelText = document.getElementById('textarea-panel-text');
const btnSavePanel = document.getElementById('btn-save-panel');

// Elementos do DOM - Autenticação
const loginOverlay = document.getElementById('login-overlay');
const loginErrorMsg = document.getElementById('login-error-msg');
const formLogin = document.getElementById('form-login');
const inputLoginEmail = document.getElementById('login-email');
const inputLoginPassword = document.getElementById('login-password');
const btnLoginSubmit = document.getElementById('btn-login-submit');
const btnLogout = document.getElementById('btn-logout');

// Elementos do DOM - Abas
const tabGame = document.getElementById('tab-game');
const tabRigging = document.getElementById('tab-rigging');
const tabMetrics = document.getElementById('tab-metrics');
const tabPdvs = document.getElementById('tab-pdvs');
const tabApi = document.getElementById('tab-api');
const containerTabGame = document.getElementById('container-tab-game');
const containerTabRigging = document.getElementById('container-tab-rigging');
const containerTabMetrics = document.getElementById('container-tab-metrics');
const containerTabPdvs = document.getElementById('container-tab-pdvs');
const containerTabApi = document.getElementById('container-tab-api');
const pdvsListTbody = document.getElementById('pdvs-list-tbody');

// Elementos do Formulário de Gateway Pix
const formGatewayPix = document.getElementById('form-gateway-pix');
const selectGatewayType = document.getElementById('select-gateway-type');
const inputApiUrl = document.getElementById('input-api-url');
const inputClientId = document.getElementById('input-client-id');
const inputClientSecret = document.getElementById('input-client-secret');
const inputChavePix = document.getElementById('input-chave-pix');
const btnSaveGateway = document.getElementById('btn-save-gateway');

// Elementos do Modal de PDVs
const modalPdvAdmin = document.getElementById('modal-pdv-admin');
const modalPdvTitle = document.getElementById('modal-pdv-title');
const formPdvAdmin = document.getElementById('form-pdv-admin');
const inputPdvNome = document.getElementById('input-pdv-nome');
const inputPdvWhatsapp = document.getElementById('input-pdv-whatsapp');
const inputPdvEndereco = document.getElementById('input-pdv-endereco');
const selectPdvComissaoTipo = document.getElementById('select-pdv-comissao-tipo');
const inputPdvComissaoValor = document.getElementById('input-pdv-comissao-valor');
const sectionOperadorCredenciais = document.getElementById('section-operador-credenciais');
const inputOpNome = document.getElementById('input-op-nome');
const inputOpEmail = document.getElementById('input-op-email');
const inputOpSenha = document.getElementById('input-op-senha');
const btnNovoPdv = document.getElementById('btn-novo-pdv');
const btnModalClose = document.getElementById('btn-modal-close');
const btnPdvCancel = document.getElementById('btn-pdv-cancel');
const btnPdvSaveSubmit = document.getElementById('btn-pdv-save-submit');

// Elementos do DOM - Métricas Financeiras
const metRevenue = document.getElementById('met-revenue');
const metPayout = document.getElementById('met-payout');
const metProfit = document.getElementById('met-profit');
const metMargin = document.getElementById('met-margin');
const metricsPdvTbody = document.getElementById('metrics-pdv-tbody');
const metAvgTicket = document.getElementById('met-avg-ticket');
const metRatio = document.getElementById('met-ratio');
const metRiggingStatus = document.getElementById('met-rigging-status');
const metFinancialHealth = document.getElementById('met-financial-health');

// Elementos do DOM - Comissões por PDV
const comissoesPdvList = document.getElementById('comissoes-pdv-list');
const inputComissaoPdvNome = document.getElementById('input-comissao-pdv-nome');
const selectComissaoTipo = document.getElementById('select-comissao-tipo');
const inputComissaoValor = document.getElementById('input-comissao-valor');
const btnSaveComissao = document.getElementById('btn-save-comissao');

// Cache de comissões carregadas
let cacheComissoes = {};

// Flag para não sobrescrever formulário enquanto o usuário digita no carregamento
let camposPreenchidosIniciais = false;

/**
 * Atualiza todos os componentes visuais do painel administrativo
 */
function renderizarAdmin(novoEstado) {
  if (!novoEstado) return;

  // Auto-limpeza de rodada antiga/bugada
  const estadoLimpo = verificarELimparEstadoSeAntigo(novoEstado);
  if (estadoLimpo) {
    console.log(`[ADMIN] Rodada antiga corrigida. Salvando novo estado...`);
    FirebaseHelper.salvarEstadoJogo(estadoLimpo);
    return;
  }

  // Se estamos resetando o jogo, ignora snapshots que ainda contêm bolas sorteadas
  if (resettingGame) {
    if (novoEstado.drawnBalls && novoEstado.drawnBalls.length > 0) {
      console.log("[ADMIN] Ignorando snapshot antigo do Firestore durante o reset do jogo.");
      return;
    } else {
      resettingGame = false; // Confirmado pelo banco que o reset foi salvo
    }
  }

  // Previne retrocesso de estado se o snapshot do Firestore for mais antigo (lagging)
  // que o estado local atual do administrador (evita travamentos e repetição de bolas)
  if (estado && estado.gameId === novoEstado.gameId) {
    const localCount = estado.drawnBalls ? estado.drawnBalls.length : 0;
    const novoCount = novoEstado.drawnBalls ? novoEstado.drawnBalls.length : 0;
    if (novoCount < localCount) {
      console.warn(`[ADMIN] Ignorando snapshot antigo. Firestore: ${novoCount} bolas, Local: ${localCount} bolas.`);
      return;
    }
  }

  estado = novoEstado;

  const rodadaAtivaFila = estado.rodadasQueue ? estado.rodadasQueue.find(r => r.gameId === estado.gameId) : null;
  const jaTemRodadaAtivaDaFila = rodadaAtivaFila && (rodadaAtivaFila.status === 'PLAYING' || rodadaAtivaFila.status === 'FINISHED');

  // Se a rodada atual estiver ociosa e houver rodadas agendadas, avança automaticamente
  if (estado.status === 'WAITING' && 
      !jaTemRodadaAtivaDaFila &&
      !estado.countdownEndTime && 
      (!estado.drawnBalls || estado.drawnBalls.length === 0) && 
      (estado.rodadasQueue && estado.rodadasQueue.length > 0)) {
    console.log("[PROGRAMAÇÃO] Canal ocioso detectado com rodadas na fila. Carregando rodada programada...");
    estado = avancarProximaRodada(estado);
    FirebaseHelper.salvarEstadoJogo(estado);
    return;
  }

  // 1. Atualiza Status do Jogo
  gameStatusText.innerText = obterTextoStatus(estado.status);
  gameStatusBadge.className = 'game-status-box';
  gameStatusBadge.classList.add(`status-${estado.status.toLowerCase()}`);

  // 2. Bolas sorteadas
  drawnCountValue.innerText = estado.drawnBalls.length;
  
  // Lista em chip das bolas sorteadas
  ballsLogContainer.innerHTML = '';
  if (estado.drawnBalls.length === 0) {
    ballsLogContainer.innerHTML = `<span class="empty-log">Nenhuma bola sorteada ainda.</span>`;
  } else {
    // Renderiza em ordem de sorteio
    estado.drawnBalls.forEach(num => {
      const chip = document.createElement('div');
      chip.className = 'drawn-ball-chip';
      chip.innerText = num.toString().padStart(2, '0');
      ballsLogContainer.appendChild(chip);
    });
    // Rola para o final automaticamente
    ballsLogContainer.scrollTop = ballsLogContainer.scrollHeight;
  }

  // 3. Formulário de Configuração (Preenche na inicialização ou quando o ID do sorteio muda)
  const idSorteioAtualNoInput = inputSorteioId.value;
  if (!camposPreenchidosIniciais || idSorteioAtualNoInput !== estado.gameId) {
    if (document.activeElement !== inputSorteioId) inputSorteioId.value = estado.gameId;
    if (document.activeElement !== inputCupomVal) inputCupomVal.value = estado.prizes.cupom;
    if (document.activeElement !== inputValQuadra) inputValQuadra.value = estado.prizes.quadra;
    if (document.activeElement !== inputValQuina) inputValQuina.value = estado.prizes.quina;
    if (document.activeElement !== inputValBingo) inputValBingo.value = estado.prizes.bingo;
    if (document.activeElement !== inputValAcumulado) inputValAcumulado.value = estado.prizes.acumulado;
    if (document.activeElement !== inputValAcumuladoLimit) inputValAcumuladoLimit.value = estado.acumuladoLimiteBola !== undefined ? estado.acumuladoLimiteBola : 44;

    if (document.activeElement !== selectBottomPanel) selectBottomPanel.value = estado.bottomPanelSettings.type;
    if (document.activeElement !== inputPanelTitle) inputPanelTitle.value = estado.bottomPanelSettings.title;
    if (document.activeElement !== textareaPanelText) textareaPanelText.value = estado.bottomPanelSettings.text;

    if (estado.drawSpeed && document.activeElement !== autoDrawSpeed) {
      autoDrawSpeed.value = estado.drawSpeed.toString();
    }

    camposPreenchidosIniciais = true;
  }

  // 4. Simulador de PDV
  const cardsCount = estado.cards ? estado.cards.length : 0;
  totalCardsValue.innerText = cardsCount;
  nextCardsValue.innerText = estado.nextCards ? estado.nextCards.length : 0;

  // 4.5. Atualiza Painel de Direcionamento de Prêmio (Rigging)
  atualizarPainelDirecionamento();

  // 5. Ganhadores
  winnersContainer.innerHTML = '';
  const categoriasGanhadores = ['acumulado', 'bingo', 'quina', 'quadra'];
  let temGanhador = false;

  categoriasGanhadores.forEach(cat => {
    const lista = estado.winners[cat];
    if (lista && lista.length > 0) {
      temGanhador = true;
      lista.forEach(winner => {
        const item = document.createElement('div');
        item.className = `winner-item type-${cat}`;
        item.innerHTML = `
          <span><strong>${cat.toUpperCase()}</strong> - Cartela <strong>${winner.cardId}</strong></span>
          <span>PDV: ${winner.pdv} (Ordem: ${winner.ordemSorteio})</span>`;
        winnersContainer.appendChild(item);
      });
    }
  });

  if (!temGanhador) {
    winnersContainer.innerHTML = `<span class="empty-log">Nenhum vencedor até o momento.</span>`;
  }

  // 6. Atualizar comportamento dos botões
  if (estado.status === 'ENDED') {
    btnDrawBall.disabled = true;
    btnAutoDraw.disabled = true;
    btnPauseDraw.disabled = true;
    btnNextRound.disabled = false; // Permite avançar rodada!
    pararAutoSorteio();
    checarEAgendarProximaRodadaAutomatica();
  } else {
    btnDrawBall.disabled = false;
    btnAutoDraw.disabled = autoDrawRunning;
    btnPauseDraw.disabled = !autoDrawRunning;
    btnNextRound.disabled = true;
    limparTimeoutAvancoAutomatico();
    
    // Se a rodada mudou ou foi resetada para WAITING, para o sorteio automático
    if (estado.status === 'WAITING') {
      pararAutoSorteio();
    }
  }

  // Se a contagem regressiva estiver ativa
  if (estado.countdownEndTime) {
    if (btnCancelCountdown) btnCancelCountdown.style.display = 'block';
  } else {
    if (btnCancelCountdown) btnCancelCountdown.style.display = 'none';
  }
}

/**
 * Retorna o texto formatado para o status do jogo
 */
function obterTextoStatus(status) {
  switch (status) {
    case 'WAITING': return 'AGUARDANDO INÍCIO';
    case 'PLAYING': return 'EM ANDAMENTO (SORTEANDO)';
    case 'ENDED': return 'SORTEIO FINALIZADO';
    default: return status;
  }
}

/**
 * Ações de Clique
 */

// Sorteio Manual
btnDrawBall.addEventListener('click', () => {
  if (estado.status === 'ENDED') return;
  
  if (!estado.cards || estado.cards.length === 0) {
    alert("Não é possível iniciar o sorteio sem nenhuma cartela cadastrada no jogo!");
    return;
  }
  
  if (estado.status === 'WAITING' && ultimoMetricas && ultimoMetricas.rankingPdvs) {
    estado.pdvDailySales = ultimoMetricas.rankingPdvs;
  }
  
  estado = sortearProximaBola(estado);
  FirebaseHelper.salvarEstadoJogo(estado);
});

// Iniciar Auto Sorteio
btnAutoDraw.addEventListener('click', () => {
  if (estado.status === 'ENDED' || autoDrawRunning) return;
  
  if (!estado.cards || estado.cards.length === 0) {
    alert("Não é possível iniciar o sorteio sem nenhuma cartela cadastrada no jogo!");
    return;
  }
  
  const segundos = parseInt(autoDrawSpeed.value) * 1000;
  
  // Se ainda estiver aguardando, inicia o jogo na primeira bola
  if (estado.status === 'WAITING') {
    if (ultimoMetricas && ultimoMetricas.rankingPdvs) {
      estado.pdvDailySales = ultimoMetricas.rankingPdvs;
    }
    estado = sortearProximaBola(estado);
    FirebaseHelper.salvarEstadoJogo(estado);
  }

  // Ativa o sorteio automático
  if (autoDrawWorker) {
    autoDrawWorker.postMessage({ action: 'start', interval: segundos });
  } else {
    if (autoDrawFallbackInterval) clearInterval(autoDrawFallbackInterval);
    autoDrawFallbackInterval = setInterval(() => {
      executarTickAutoSorteio();
    }, segundos);
  }
  autoDrawRunning = true;

  btnAutoDraw.disabled = true;
  btnPauseDraw.disabled = false;
});

// Pausar Auto Sorteio
btnPauseDraw.addEventListener('click', pararAutoSorteio);

function pararAutoSorteio() {
  if (autoDrawRunning) {
    if (autoDrawWorker) {
      autoDrawWorker.postMessage({ action: 'stop' });
    } else {
      if (autoDrawFallbackInterval) {
        clearInterval(autoDrawFallbackInterval);
        autoDrawFallbackInterval = null;
      }
    }
    autoDrawRunning = false;
  }
  btnAutoDraw.disabled = false;
  btnPauseDraw.disabled = true;
}

function executarTickAutoSorteio() {
  // Pausa o auto-sorteio enquanto prêmio está sendo exibido na TV
  if (premioPausado) return;
  
  if (estado.status === 'PLAYING' && estado.ballsLeft.length > 0) {
    // Snapshot dos winners antes do sorteio
    const wAntes = {
      quadra: estado.winners.quadra.length,
      quina: estado.winners.quina.length,
      bingo: estado.winners.bingo.length,
      acumulado: estado.winners.acumulado.length
    };
    
    estado = sortearProximaBola(estado);
    FirebaseHelper.salvarEstadoJogo(estado);
    
    // Verifica se saiu prêmio novo comparando com snapshot anterior
    const saiuPremio = 
      estado.winners.quadra.length > wAntes.quadra ||
      estado.winners.quina.length > wAntes.quina ||
      estado.winners.bingo.length > wAntes.bingo ||
      estado.winners.acumulado.length > wAntes.acumulado;
    
    if (saiuPremio) {
      console.log('[AUTO-DRAW] Prêmio detectado! Pausando por 12 segundos...');
      if (autoDrawWorker) {
        autoDrawWorker.postMessage({ action: 'pause', duration: 12000 });
      } else {
        // Fallback pause: para e agenda a retomada
        if (autoDrawFallbackInterval) {
          clearInterval(autoDrawFallbackInterval);
          autoDrawFallbackInterval = null;
        }
        setTimeout(() => {
          if (autoDrawRunning && !autoDrawWorker) {
            const segundos = parseInt(autoDrawSpeed.value) * 1000;
            autoDrawFallbackInterval = setInterval(() => {
              executarTickAutoSorteio();
            }, segundos);
            console.log('[AUTO-DRAW] Sorteio retomado após pausa de prêmio.');
          }
        }, 12000);
      }
    }
  } else {
    pararAutoSorteio();
  }
}

// Botão para avançar a próxima rodada
btnNextRound.addEventListener('click', () => {
  if (estado.status !== 'ENDED') return;

  if (confirm(`Deseja iniciar o Sorteio ${estado.nextGameId}? As ${estado.nextCards ? estado.nextCards.length : 0} cartelas compradas antecipadamente serão movidas como ativas.`)) {
    estado = avancarProximaRodada(estado);
    FirebaseHelper.salvarEstadoJogo(estado);
    alert("Próximo sorteio aberto! Cartelas importadas.");
  }
});

// Reiniciar Sorteio Atual
btnResetGame.addEventListener('click', () => {
  if (confirm("Deseja reiniciar o sorteio ATUAL? Isso limpará apenas as bolas sorteadas e os vencedores da rodada corrente. As cartelas ativas serão mantidas.")) {
    resettingGame = true;
    pararAutoSorteio();
    
    // Zera acertos das cartelas ativas
    estado.cards = estado.cards.map(c => ({
      ...c,
      drawnCount: 0,
      numbersRemaining: 15,
      missingNumbers: [...c.numbers]
    }));
    
    estado.drawnBalls = [];
    estado.ballsLeft = Array.from({ length: 90 }, (_, i) => i + 1);
    estado.winners = {
      quadra: [],
      quina: [],
      bingo: [],
      acumulado: []
    };
    estado.status = "WAITING";
    estado.horaInicio = "";

    FirebaseHelper.salvarEstadoJogo(estado);
  }
});

// Salvar Configurações de Prêmios
btnSaveSettings.addEventListener('click', () => {
  estado.gameId = inputSorteioId.value;
  estado.prizes.cupom = parseFloat(inputCupomVal.value) || 2.0;
  estado.prizes.quadra = parseFloat(inputValQuadra.value) || 50.0;
  estado.prizes.quina = parseFloat(inputValQuina.value) || 100.0;
  estado.prizes.bingo = parseFloat(inputValBingo.value) || 250.0;
  estado.prizes.acumulado = parseFloat(inputValAcumulado.value) || 1000.0;
  estado.acumuladoLimiteBola = parseInt(inputValAcumuladoLimit.value) || 44;

  // Processa para recalcular estados caso o jogo esteja ativo
  estado = processarEstadoJogo(estado);
  FirebaseHelper.salvarEstadoJogo(estado);
  alert("Premiação atualizada e sincronizada com sucesso!");
});

// Salvar Painel Informativo da TV
btnSavePanel.addEventListener('click', () => {
  estado.bottomPanelSettings = {
    type: selectBottomPanel.value,
    title: inputPanelTitle.value,
    text: textareaPanelText.value
  };
  FirebaseHelper.salvarEstadoJogo(estado);
  alert("Mensagem da TV atualizada com sucesso!");
});

// Salvar Direcionamento de Prêmio (Rigging) no Sorteio Selecionado (Ativo ou Fila)
btnSaveAdminRigging.addEventListener('click', async () => {
  if (!estado) return;
  
  const targetRoundId = selectAdminRiggingRound.value || "ATIVO";
  const mode = selectAdminRiggingMode ? selectAdminRiggingMode.value : 'MANUAL';
  const selectedPdv = mode === 'INTELIGENTE' ? 'INTELIGENTE' : selectAdminForcedPdv.value;
  const riggingProb = parseInt(selectAdminRiggingProb.value) || 75;
  const forceQuadra = checkboxRiggingQuadra.checked;
  const forceQuina = checkboxRiggingQuina.checked;
  const forceBingo = checkboxRiggingBingo.checked;
  const riggingAcumuladoLimit = parseInt(inputRiggingAcumuladoLimit.value) || 44;
  
  btnSaveAdminRigging.disabled = true;
  btnSaveAdminRigging.innerText = 'Salvando...';
  
  try {
    if (targetRoundId === "ATIVO") {
      // Sorteio Ativo
      estado.forcedPdvWinner = selectedPdv;
      estado.forcedRiggingProbability = riggingProb;
      estado.forcedPrizes = { quadra: forceQuadra, quina: forceQuina, bingo: forceBingo };
      estado.acumuladoLimiteBola = riggingAcumuladoLimit;
      if (ultimoMetricas && ultimoMetricas.rankingPdvs) {
        estado.pdvDailySales = ultimoMetricas.rankingPdvs;
      }
    } else {
      // Rodada Agendada na Fila
      if (estado.rodadasQueue) {
        const roundIdx = estado.rodadasQueue.findIndex(r => r.gameId === targetRoundId);
        if (roundIdx !== -1) {
          estado.rodadasQueue[roundIdx].forcedPdvWinner = selectedPdv;
          estado.rodadasQueue[roundIdx].forcedRiggingProbability = riggingProb;
          estado.rodadasQueue[roundIdx].forcedPrizes = { quadra: forceQuadra, quina: forceQuina, bingo: forceBingo };
          estado.rodadasQueue[roundIdx].acumuladoLimiteBola = riggingAcumuladoLimit;
          if (ultimoMetricas && ultimoMetricas.rankingPdvs) {
            estado.rodadasQueue[roundIdx].pdvDailySales = ultimoMetricas.rankingPdvs;
          }
        } else {
          throw new Error("Rodada agendada não encontrada na fila.");
        }
      }
    }
    
    await FirebaseHelper.salvarEstadoJogo(estado);
    alert(`Sucesso! O prêmio do sorteio ${targetRoundId === "ATIVO" ? estado.gameId : targetRoundId} agora está configurado no modo: ${mode === 'INTELIGENTE' ? 'Prioritário Inteligente' : selectedPdv} (Força: ${riggingProb}%).`);
    
    // Recarrega o painel assincronamente
    await atualizarPainelDirecionamento();
  } catch (err) {
    alert("Erro ao salvar direcionamento: " + err.message);
  } finally {
    btnSaveAdminRigging.disabled = false;
    btnSaveAdminRigging.innerText = 'Aplicar Direcionamento';
  }
});

// Listener para atualizar o painel assim que o administrador seleciona outra rodada da lista
if (selectAdminRiggingRound) {
  selectAdminRiggingRound.addEventListener('change', () => {
    atualizarPainelDirecionamento();
  });
}

// Função assíncrona para atualizar o painel de direcionamento com base na rodada selecionada
async function atualizarPainelDirecionamento() {
  if (!estado || !selectAdminRiggingRound) return;
  
  // 1. Popula o dropdown de rodadas se o usuário não estiver mexendo nele no momento
  if (document.activeElement !== selectAdminRiggingRound) {
    const previousVal = selectAdminRiggingRound.value || "ATIVO";
    
    let optionsHtml = `<option value="ATIVO">Sorteio Ativo (${estado.gameId})</option>`;
    if (estado.rodadasQueue) {
      estado.rodadasQueue.forEach(r => {
        if (r.status !== 'FINISHED' && r.gameId !== estado.gameId) {
          const infoTime = r.startTime ? ` - ${r.startDate || ''} às ${r.startTime}` : ' - Manual';
          optionsHtml += `<option value="${r.gameId}">Sorteio Agendado: ${r.gameId}${infoTime}</option>`;
        }
      });
    }
    selectAdminRiggingRound.innerHTML = optionsHtml;
    
    // Tenta manter a seleção anterior se ela ainda existir na fila
    const exists = Array.from(selectAdminRiggingRound.options).some(opt => opt.value === previousVal);
    selectAdminRiggingRound.value = exists ? previousVal : "ATIVO";
  }
  
  const targetRoundId = selectAdminRiggingRound.value || "ATIVO";
  const roundGameId = targetRoundId === "ATIVO" ? estado.gameId : targetRoundId;
  
  // 2. Busca as cartelas vendidas para esta rodada específica (Banco ou LocalStorage)
  let cartelasRodada = [];
  try {
    cartelasRodada = await FirebaseHelper.buscarCartelasPorGameId(roundGameId);
  } catch (err) {
    console.error("Erro ao buscar cartelas para direcionamento:", err);
  }
  
  // 3. Atualiza visibilidade com base no número de cartelas vendidas
  const cardsCount = cartelasRodada.length;
  
  // Determina qual é a configuração atual no banco
  let currentForcedPdv = "NENHUM";
  let currentRiggingProb = 100;
  let currentForcedPrizes = { quadra: false, quina: false, bingo: true };
  let currentAcumuladoLimit = 44;
  
  if (targetRoundId === "ATIVO") {
    currentForcedPdv = estado.forcedPdvWinner || "NENHUM";
    currentRiggingProb = estado.forcedRiggingProbability || 100;
    currentForcedPrizes = estado.forcedPrizes || { quadra: false, quina: false, bingo: true };
    currentAcumuladoLimit = estado.acumuladoLimiteBola !== undefined ? estado.acumuladoLimiteBola : 44;
  } else {
    const roundObj = estado.rodadasQueue ? estado.rodadasQueue.find(r => r.gameId === targetRoundId) : null;
    if (roundObj) {
      currentForcedPdv = roundObj.forcedPdvWinner || "NENHUM";
      currentRiggingProb = roundObj.forcedRiggingProbability || 100;
      currentForcedPrizes = roundObj.forcedPrizes || { quadra: false, quina: false, bingo: true };
      currentAcumuladoLimit = roundObj.acumuladoLimiteBola !== undefined ? roundObj.acumuladoLimiteBola : 44;
    }
  }

  let roundPrizes = { ...estado.prizes };
  if (targetRoundId !== "ATIVO" && estado.rodadasQueue) {
    const rConfig = estado.rodadasQueue.find(r => r.gameId === targetRoundId);
    if (rConfig && rConfig.prizes) {
      roundPrizes = { ...rConfig.prizes };
    }
  }

  if (cardsCount === 0) {
    if (riggingFields) riggingFields.style.display = 'none';
    if (riggingStatusMsg) {
      riggingStatusMsg.style.display = 'block';
      riggingStatusMsg.innerHTML = `⚠️ Nenhuma cartela vendida para o sorteio <strong>${roundGameId}</strong> ainda. O direcionamento só é liberado após os clientes comprarem cartelas.`;
    }
  } else {
    if (riggingStatusMsg) riggingStatusMsg.style.display = 'none';
    if (riggingFields) riggingFields.style.display = 'flex';
    
    // Lista os PDVs únicos das cartelas vendidas nesta rodada específica
    const pdvsComCartelas = [...new Set(cartelasRodada.map(c => c.pdv))];
    const sales = (estado && estado.pdvDailySales) ? estado.pdvDailySales : (ultimoMetricas ? ultimoMetricas.rankingPdvs : {});
    
    // Elegibilidade: Apenas PDVs com faturamento na plataforma > 0 podem receber direcionamento
    const pdvsElegiveis = pdvsComCartelas.filter(pdvName => {
      const faturamento = parseFloat(sales && sales[pdvName] ? sales[pdvName] : 0);
      return faturamento > 0;
    });
    
    const selectedPdvValue = selectAdminForcedPdv.value || currentForcedPdv;
    
    // Repopula o select de PDVs com os elegíveis
    selectAdminForcedPdv.innerHTML = '<option value="NENHUM">NENHUM (Sorteio 100% Aleatório)</option>';
    pdvsElegiveis.forEach(pdvName => {
      const option = document.createElement('option');
      option.value = pdvName;
      option.innerText = pdvName;
      selectAdminForcedPdv.appendChild(option);
    });
    
    // Adiciona/atualiza nota explicativa de elegibilidade
    let eligibilityNote = document.getElementById('eligibility-note-msg');
    if (!eligibilityNote) {
      eligibilityNote = document.createElement('span');
      eligibilityNote.id = 'eligibility-note-msg';
      eligibilityNote.style.cssText = 'font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;';
      selectAdminForcedPdv.parentNode.appendChild(eligibilityNote);
    }
    
    if (pdvsComCartelas.length > 0 && pdvsElegiveis.length === 0) {
      eligibilityNote.innerHTML = `⚠️ Nenhum dos bares participantes possui faturamento na plataforma para direcionamento.`;
      eligibilityNote.style.color = 'var(--warning)';
    } else {
      eligibilityNote.innerHTML = `* Apenas bares com faturamento ativo registrado na plataforma são elegíveis para direcionamento de prêmios.`;
      eligibilityNote.style.color = 'var(--text-muted)';
    }
    
    if (document.activeElement !== selectAdminForcedPdv) {
      if (pdvsElegiveis.includes(currentForcedPdv)) {
        selectAdminForcedPdv.value = currentForcedPdv;
      } else {
        selectAdminForcedPdv.value = 'NENHUM';
      }
    } else {
      if (pdvsElegiveis.includes(selectedPdvValue) || selectedPdvValue === 'NENHUM') {
        selectAdminForcedPdv.value = selectedPdvValue;
      }
    }
    
    if (document.activeElement !== selectAdminRiggingProb) {
      selectAdminRiggingProb.value = currentRiggingProb.toString();
    }
    if (checkboxRiggingQuadra && document.activeElement !== checkboxRiggingQuadra) checkboxRiggingQuadra.checked = currentForcedPrizes.quadra;
    if (checkboxRiggingQuina && document.activeElement !== checkboxRiggingQuina) checkboxRiggingQuina.checked = currentForcedPrizes.quina;
    if (checkboxRiggingBingo && document.activeElement !== checkboxRiggingBingo) checkboxRiggingBingo.checked = currentForcedPrizes.bingo;
    if (inputRiggingAcumuladoLimit && document.activeElement !== inputRiggingAcumuladoLimit) inputRiggingAcumuladoLimit.value = currentAcumuladoLimit;

    // Sincroniza o modo de direcionamento na tela
    if (selectAdminRiggingMode && document.activeElement !== selectAdminRiggingMode) {
      selectAdminRiggingMode.value = currentForcedPdv === 'INTELIGENTE' ? 'INTELIGENTE' : 'MANUAL';
    }

    const mode = selectAdminRiggingMode ? selectAdminRiggingMode.value : 'MANUAL';
    if (mode === 'INTELIGENTE') {
      if (groupAdminForcedPdv) groupAdminForcedPdv.style.display = 'none';
      if (riggingAgentBox) riggingAgentBox.style.display = 'block';
      exibirEstatisticasAgenteInteligente(cartelasRodada);
    } else {
      if (groupAdminForcedPdv) groupAdminForcedPdv.style.display = 'block';
      if (riggingAgentBox) riggingAgentBox.style.display = 'none';
    }
  }

  // 4. Renderiza o Relatório de Direcionamentos Aplicados
  if (riggingSummaryContent) {
    const appliedRounds = [];
    
    // Verifica rodada ativa
    if (estado && estado.forcedPdvWinner && estado.forcedPdvWinner !== 'NENHUM') {
      appliedRounds.push({
        gameId: estado.gameId,
        label: `Rodada Ativa (${estado.gameId})`,
        status: estado.status,
        forcedPdvWinner: estado.forcedPdvWinner,
        forcedRiggingProbability: estado.forcedRiggingProbability || 100,
        prizes: estado.prizes,
        forcedCardId: estado.forcedCardId,
        pdvDailySales: estado.pdvDailySales || {}
      });
    }

    // Verifica fila de rodadas agendadas
    if (estado && estado.rodadasQueue) {
      estado.rodadasQueue.forEach(r => {
        if (r.status !== 'FINISHED' && r.forcedPdvWinner && r.forcedPdvWinner !== 'NENHUM') {
          appliedRounds.push({
            gameId: r.gameId,
            label: `Rodada Agendada (${r.gameId}${r.startTime ? ' - às ' + r.startTime : ''})`,
            status: r.status || 'PENDING',
            forcedPdvWinner: r.forcedPdvWinner,
            forcedRiggingProbability: r.forcedRiggingProbability || 100,
            prizes: r.prizes,
            forcedCardId: r.forcedCardId,
            pdvDailySales: r.pdvDailySales || {}
          });
        }
      });
    }

    // Busca as cartelas para todas as rodadas aplicadas em paralelo para poder computar estatísticas reais
    const roundsWithCards = await Promise.all(
      appliedRounds.map(async (round) => {
        let cards = [];
        try {
          cards = await FirebaseHelper.buscarCartelasPorGameId(round.gameId);
        } catch (e) {
          console.error("Erro ao buscar cartelas para o relatório de direcionamento:", e);
        }
        return { ...round, cards };
      })
    );

    let summaryHtml = "";
    if (roundsWithCards.length === 0) {
      summaryHtml = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px; font-style: italic; border: 1px dashed rgba(255, 193, 7, 0.2); border-radius: 8px; font-size: 13px;">
          Nenhum direcionamento de prioritário (Inteligente ou Manual) aplicado ou configurado no momento.
        </div>
      `;
    } else {
      roundsWithCards.forEach(round => {
        const valQuadra = round.prizes.quadra ? parseFloat(round.prizes.quadra) : 0;
        const valQuina = round.prizes.quina ? parseFloat(round.prizes.quina) : 0;
        const valBingo = round.prizes.bingo ? parseFloat(round.prizes.bingo) : 0;
        const valAcumulado = round.prizes.acumulado ? parseFloat(round.prizes.acumulado) : 0;
        const totalPrizes = valBingo + valQuina + valQuadra;

        let detailsHtml = "";
        
        // Verifica se a rodada já tem um bar/cartela alvo selecionado na certeza (quando o sorteio já iniciou/finalizou)
        let lockedBar = null;
        if (round.forcedCardId) {
          const targetCard = round.cards.find(c => c.id === round.forcedCardId);
          if (targetCard) lockedBar = targetCard.pdv;
        }

        const prizesForced = round.forcedPrizes || { quadra: false, quina: false, bingo: true };
        const forcedNames = Object.entries(prizesForced).filter(([_, v]) => v).map(([k]) => k.toUpperCase());
        const naturalNames = Object.entries(prizesForced).filter(([_, v]) => !v).map(([k]) => k.toUpperCase());
        const estBola = round.acumuladoLimiteBola !== undefined ? round.acumuladoLimiteBola : 44;

        if (lockedBar) {
          detailsHtml += `
            <div style="margin-top: 5px; padding: 10px; background: rgba(0, 243, 255, 0.05); border: 1px solid var(--primary); border-radius: 6px; font-size: 11px;">
              <span style="color: var(--neon-cyan); font-weight: bold; font-size: 12px;">🏆 Bar Vencedor (Na Certeza):</span><br>
              <strong style="font-size: 13px; color: var(--neon-gold);">${lockedBar}</strong><br>
              <div style="margin-top: 6px; font-weight: bold; color: #fff;">Valores a Receber se Sorteado:</div>
              • Prêmios Direcionados: <span style="color: var(--neon-gold); font-weight: bold;">${forcedNames.join(' + ')}</span><br>
              • Bingo: <span style="color: var(--success); font-weight: bold;">R$ ${valBingo.toFixed(2).replace('.', ',')}</span><br>
              • Acumulado: <span style="color: var(--success); font-weight: bold;">R$ ${valAcumulado.toFixed(2).replace('.', ',')}</span> <span style="font-size: 9px; color: var(--text-muted);">(se bater até a bola ${estBola})</span><br>
              ${naturalNames.length > 0 ? `<span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 4px;">* ${naturalNames.join(' e ')} são entregues naturalmente para outros bares participantes.</span>` : ''}
            </div>
          `;
        } else {
          if (round.forcedPdvWinner === "INTELIGENTE") {
            detailsHtml += `<strong>Tipo:</strong> <span style="color: var(--primary); font-weight: bold;">🤖 Prioritário Inteligente (IA)</span><br>`;
            if (round.cards.length === 0) {
              detailsHtml += `<span style="color: var(--text-muted); font-style: italic; font-size: 11px;">(Aguardando venda de cartelas para definir os bares beneficiados)</span>`;
            } else {
              const activePdvs = [...new Set(round.cards.map(c => c.pdv))];
              const roundSales = round.pdvDailySales || {};
              let totalWeight = 0;
              const weights = activePdvs.map(pdv => {
                const faturamento = parseFloat(roundSales && roundSales[pdv] ? roundSales[pdv] : 0);
                const weight = faturamento > 0 ? faturamento : 0;
                totalWeight += weight;
                return { pdv, weight, faturamento };
              });

              if (totalWeight === 0) {
                detailsHtml += `<span style="color: var(--warning); font-style: italic; font-size: 11px;">⚠️ Nenhum bar participante possui faturamento na plataforma. Sorteio será 100% aleatório.</span>`;
              } else {
                detailsHtml += `<span style="color: var(--neon-cyan); font-weight: bold; font-size: 11px;">Bares em Disputa de Bingo (100% Certeiro):</span><br>`;
                weights.forEach(item => {
                  const valVenda = `R$ ${item.faturamento.toFixed(2).replace('.', ',')}`;
                  if (item.weight > 0) {
                    const probNum = (item.weight / totalWeight) * 100;
                    const prob = probNum.toFixed(1);
                    
                    let estimatedBingo = 50 + Math.round(item.faturamento * 2.0);
                    estimatedBingo = Math.min(1500, estimatedBingo);
                    
                    detailsHtml += `
                      <div style="margin-top: 5px; padding-left: 8px; border-left: 2px solid var(--neon-gold); font-size: 11px; margin-bottom: 6px;">
                        • <strong>${item.pdv}</strong>: <span style="color: var(--neon-gold); font-weight: bold;">${prob}% de chance de vitória</span><br>
                        &nbsp;&nbsp;↳ Se sorteado, recebe na certeza: <span style="color: var(--success); font-weight: bold;">R$ ${estimatedBingo.toFixed(2).replace('.', ',')}</span> <span style="color: var(--text-muted); font-size: 9.5px;">(Prêmio do Bingo dinâmico)</span><br>
                        &nbsp;&nbsp;↳ Prêmios Direcionados: <span style="color: var(--primary); font-weight: bold;">${forcedNames.join(' + ')}</span><br>
                        &nbsp;&nbsp;↳ Desempenho Geral (Vendas na Plataforma): <span style="color: var(--neon-cyan); font-weight: bold;">${valVenda}</span>
                      </div>
                    `;
                  } else {
                    detailsHtml += `
                      <div style="margin-top: 5px; padding-left: 8px; border-left: 2px solid var(--text-muted); font-size: 11px; margin-bottom: 6px; opacity: 0.5;">
                        • <strong>${item.pdv}</strong>: <span style="color: var(--danger); font-weight: bold;">Inelegível</span> <span style="color: var(--text-muted); font-size: 9.5px;">(Faturamento zerado)</span><br>
                        &nbsp;&nbsp;↳ Desempenho Geral (Vendas na Plataforma): <span style="color: var(--neon-cyan); font-weight: bold;">${valVenda}</span>
                      </div>
                    `;
                  }
                });
              }
            }
          } else {
            detailsHtml += `<strong>Tipo:</strong> <span style="color: var(--warning); font-weight: bold;">🎯 Direcionamento Manual (PDV Fixo)</span><br>`;
            const roundSales = round.pdvDailySales || {};
            const valVendaNum = roundSales && roundSales[round.forcedPdvWinner] ? parseFloat(roundSales[round.forcedPdvWinner]) : 0;
            const valVenda = `R$ ${valVendaNum.toFixed(2).replace('.', ',')}`;
            
            if (valVendaNum > 0) {
              let estimatedBingo = 50 + Math.round(valVendaNum * 2.0);
              estimatedBingo = Math.min(1500, estimatedBingo);
              
              detailsHtml += `
                <div style="margin-top: 5px; padding: 10px; background: rgba(255, 193, 7, 0.05); border: 1px solid var(--warning); border-radius: 6px; font-size: 11px;">
                  <span style="color: var(--warning); font-weight: bold; font-size: 12px;">🎯 Bar Vencedor (Na Certeza):</span><br>
                  <strong style="font-size: 13px; color: var(--neon-gold);">${round.forcedPdvWinner}</strong><br>
                  <div style="margin-top: 6px; font-weight: bold; color: #fff;">Valores Certeiros a Receber:</div>
                  • Prêmios Direcionados: <span style="color: var(--neon-gold); font-weight: bold;">${forcedNames.join(' + ')}</span><br>
                  • Bingo: <span style="color: var(--success); font-weight: bold;">R$ ${estimatedBingo.toFixed(2).replace('.', ',')}</span><br>
                  • Acumulado: <span style="color: var(--success); font-weight: bold;">R$ ${valAcumulado.toFixed(2).replace('.', ',')}</span> <span style="font-size: 9px; color: var(--text-muted);">(se bater até a bola ${estBola})</span><br>
                  &nbsp;&nbsp;↳ Desempenho Geral (Vendas na Plataforma): <span style="color: var(--neon-cyan); font-weight: bold;">${valVenda}</span>
                  ${naturalNames.length > 0 ? `<span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 4px;">* ${naturalNames.join(' e ')} são entregues naturalmente para outros bares participantes.</span>` : ''}
                </div>
              `;
            } else {
              detailsHtml += `
                <div style="margin-top: 5px; padding: 10px; background: rgba(255, 23, 68, 0.05); border: 1px solid var(--danger); border-radius: 6px; font-size: 11px;">
                  <span style="color: var(--danger); font-weight: bold; font-size: 12px;">⚠️ Direcionamento Inválido:</span><br>
                  <strong style="font-size: 13px; color: #fff;">${round.forcedPdvWinner}</strong> não é elegível por ter faturamento zerado na plataforma.<br>
                  &nbsp;&nbsp;↳ Desempenho Geral (Vendas na Plataforma): <span style="color: var(--neon-cyan); font-weight: bold;">${valVenda}</span><br>
                  <span style="color: var(--text-muted); font-size: 10px; display: block; margin-top: 4px;">* O sorteio seguirá 100% aleatório se iniciado neste estado.</span>
                </div>
              `;
            }
          }
        }

        // Se lockedBar já existia, o prêmio do Bingo exibido no cabeçalho do resumo é o real pago
        const headerBingoPrize = lockedBar ? valBingo : (round.forcedPdvWinner === "INTELIGENTE" ? valBingo : (valVendaNum > 0 ? Math.min(1500, 50 + Math.round(valVendaNum * 2.0)) : valBingo));
        const estBolaHeader = round.acumuladoLimiteBola !== undefined ? round.acumuladoLimiteBola : 44;

        summaryHtml += `
          <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 193, 7, 0.15); border-radius: 8px; padding: 12px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 6px; margin-bottom: 8px;">
              <span style="color: var(--warning); font-weight: bold; font-size: 13px;">${round.label}</span>
              <span class="badge-status" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(0, 243, 255, 0.1); color: var(--neon-cyan); border: 1px solid rgba(0, 243, 255, 0.2); text-transform: uppercase;">
                ${round.status === 'WAITING' ? 'Aguardando' : (round.status === 'PLAYING' ? 'Em Sorteio' : 'Finalizado')}
              </span>
            </div>
            
            <div style="font-size: 11px; margin-bottom: 8px; color: var(--text-muted); line-height: 1.4;">
              <span style="color: #fff; font-weight: bold;">Valores dos Prêmios:</span> <br>
              Bingo: <span style="color: var(--success); font-weight: 700;">R$ ${headerBingoPrize.toFixed(2).replace('.', ',')}</span> | 
              Quina: <span style="color: var(--success); font-weight: 700;">R$ ${valQuina.toFixed(2).replace('.', ',')}</span> | 
              Quadra: <span style="color: var(--success); font-weight: 700;">R$ ${valQuadra.toFixed(2).replace('.', ',')}</span> | 
              Acumulado: <span style="color: var(--success); font-weight: 700;">R$ ${valAcumulado.toFixed(2).replace('.', ',')}</span> <span style="font-size: 9px; color: var(--text-muted);">(até bola ${estBolaHeader})</span>
            </div>
 
            <div style="font-size: 12px; line-height: 1.5; color: #eee; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 6px; margin-top: 6px;">
              ${detailsHtml}
            </div>
          </div>
        `;
      });
    }

    riggingSummaryContent.innerHTML = summaryHtml;
  }
}

// Alternância manual de modo de direcionamento
if (selectAdminRiggingMode) {
  selectAdminRiggingMode.addEventListener('change', () => {
    const mode = selectAdminRiggingMode.value;
    if (mode === 'INTELIGENTE') {
      if (groupAdminForcedPdv) groupAdminForcedPdv.style.display = 'none';
      if (riggingAgentBox) riggingAgentBox.style.display = 'block';
      
      // Busca cartelas da rodada selecionada para exibir as probabilidades atualizadas
      const targetRoundId = selectAdminRiggingRound.value || "ATIVO";
      const roundGameId = targetRoundId === "ATIVO" ? estado.gameId : targetRoundId;
      FirebaseHelper.buscarCartelasPorGameId(roundGameId).then(cards => {
        exibirEstatisticasAgenteInteligente(cards);
      }).catch(() => {
        exibirEstatisticasAgenteInteligente([]);
      });
    } else {
      if (groupAdminForcedPdv) groupAdminForcedPdv.style.display = 'block';
      if (riggingAgentBox) riggingAgentBox.style.display = 'none';
    }
  });
}

// Exibe estatísticas das probabilidades do agente inteligente
function exibirEstatisticasAgenteInteligente(cartelasRodada) {
  if (!riggingAgentStats) return;
  
  const cards = cartelasRodada || [];
  const activePdvs = [...new Set(cards.map(c => c.pdv))];
  
  if (activePdvs.length === 0) {
    riggingAgentStats.innerHTML = `<span style="color: var(--text-muted);">Nenhuma cartela ativa na rodada.</span>`;
    return;
  }
  
  // Utiliza as vendas salvas no estado ou no último snapshot de métricas
  const sales = (estado && estado.pdvDailySales) ? estado.pdvDailySales : (ultimoMetricas ? ultimoMetricas.rankingPdvs : {});
  let totalWeight = 0;
  const weights = activePdvs.map(pdv => {
    const faturamento = parseFloat(sales && sales[pdv] ? sales[pdv] : 0);
    // Elegibilidade faturamento > 0
    const weight = faturamento > 0 ? faturamento : 0;
    totalWeight += weight;
    return { pdv, weight, faturamento };
  });
  
  let statsHtml = '<div style="margin-bottom: 4px; color: var(--neon-cyan);">Probabilidades Ponderadas:</div>';
  if (totalWeight === 0) {
    statsHtml += `<span style="color: var(--warning); font-style: italic;">⚠️ Nenhum bar participante possui faturamento na plataforma. Sorteio será 100% aleatório.</span>`;
  } else {
    weights.forEach(item => {
      const valVenda = `R$ ${item.faturamento.toFixed(2).replace('.', ',')}`;
      if (item.weight > 0) {
        const prob = ((item.weight / totalWeight) * 100).toFixed(1);
        let estimatedBingo = 50 + Math.round(item.faturamento * 2.0);
        estimatedBingo = Math.min(1500, estimatedBingo);
        statsHtml += `• <strong>${item.pdv}</strong>: <span style="color: var(--neon-gold); font-weight: bold;">${prob}%</span> <span style="font-size: 9px; color: var(--text-muted);">(Vendas: ${valVenda} | Prêmio Bingo: R$ ${estimatedBingo.toFixed(2).replace('.', ',')})</span><br>`;
      } else {
        statsHtml += `• <strong>${item.pdv}</strong>: <span style="color: var(--danger); font-weight: bold;">0% (Inelegível - Faturamento zerado)</span> <span style="font-size: 9px; color: var(--text-muted);">(Vendas: ${valVenda})</span><br>`;
      }
    });
  }
  
  riggingAgentStats.innerHTML = statsHtml;
}

// Ações no seletor de painel inferior para agilizar preenchimento de teste
selectBottomPanel.addEventListener('change', (e) => {
  const opt = e.target.value;
  if (opt === 'PROXIMO_PREMIO') {
    inputPanelTitle.value = "PRÓXIMO PRÊMIO";
    textareaPanelText.value = "Sorteio hoje às 20h! Compre sua cartela nos pontos credenciados.";
  } else if (opt === 'PROMOCOES') {
    inputPanelTitle.value = "PROMOÇÕES DA SORTE";
    textareaPanelText.value = "Compre 5 cartelas e ganhe 1 cupom de desconto para bebidas!";
  } else if (opt === 'ULTIMO_GANHADOR') {
    inputPanelTitle.value = "HISTÓRICO";
    textareaPanelText.value = "Aguardando confirmação de fechamento...";
  } else if (opt === 'MINHAS_CARTELAS') {
    inputPanelTitle.value = "SISTEMA DE VENDAS";
    textareaPanelText.value = "Acompanhe suas vendas no painel do PDV.";
  }
});

// ==========================================
// ABAS DE NAVEGAÇÃO DO PAINEL ADMIN
// ==========================================
tabGame.addEventListener('click', () => {
  tabGame.classList.add('active');
  tabRigging.classList.remove('active');
  tabMetrics.classList.remove('active');
  tabPdvs.classList.remove('active');
  tabApi.classList.remove('active');
  containerTabGame.style.display = 'grid';
  containerTabRigging.style.display = 'none';
  containerTabMetrics.style.display = 'none';
  containerTabPdvs.style.display = 'none';
  containerTabApi.style.display = 'none';
});

tabRigging.addEventListener('click', () => {
  tabRigging.classList.add('active');
  tabGame.classList.remove('active');
  tabMetrics.classList.remove('active');
  tabPdvs.classList.remove('active');
  tabApi.classList.remove('active');
  containerTabRigging.style.display = 'block';
  containerTabGame.style.display = 'none';
  containerTabMetrics.style.display = 'none';
  containerTabPdvs.style.display = 'none';
  containerTabApi.style.display = 'none';
  atualizarPainelDirecionamento();
});

tabMetrics.addEventListener('click', () => {
  tabMetrics.classList.add('active');
  tabGame.classList.remove('active');
  tabRigging.classList.remove('active');
  tabPdvs.classList.remove('active');
  tabApi.classList.remove('active');
  containerTabMetrics.style.display = 'block';
  containerTabGame.style.display = 'none';
  containerTabRigging.style.display = 'none';
  containerTabPdvs.style.display = 'none';
  containerTabApi.style.display = 'none';
});

tabPdvs.addEventListener('click', () => {
  tabPdvs.classList.add('active');
  tabGame.classList.remove('active');
  tabRigging.classList.remove('active');
  tabMetrics.classList.remove('active');
  tabApi.classList.remove('active');
  containerTabPdvs.style.display = 'block';
  containerTabGame.style.display = 'none';
  containerTabRigging.style.display = 'none';
  containerTabMetrics.style.display = 'none';
  containerTabApi.style.display = 'none';
  carregarPdvsAdmin();
});

tabApi.addEventListener('click', () => {
  tabApi.classList.add('active');
  tabGame.classList.remove('active');
  tabRigging.classList.remove('active');
  tabMetrics.classList.remove('active');
  tabPdvs.classList.remove('active');
  containerTabApi.style.display = 'block';
  containerTabGame.style.display = 'none';
  containerTabRigging.style.display = 'none';
  containerTabMetrics.style.display = 'none';
  containerTabPdvs.style.display = 'none';
  carregarConfiguracaoGatewayAdmin();
});

// ==========================================
// AUTENTICAÇÃO DO ADMINISTRADOR
// ==========================================
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorMsg.style.display = 'none';
  btnLoginSubmit.disabled = true;
  btnLoginSubmit.innerText = 'Autenticando...';

  const email = inputLoginEmail.value.trim();
  const password = inputLoginPassword.value;

  try {
    const cred = await FirebaseHelper.login(email, password);
    if (cred.profile.tipo !== 'admin') {
      await FirebaseHelper.logout();
      throw new Error("Acesso restrito apenas para administradores.");
    }
  } catch (error) {
    loginErrorMsg.innerText = error.message || "E-mail ou senha incorretos.";
    loginErrorMsg.style.display = 'block';
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.innerText = 'Entrar no Painel';
  }
});

// Logout Administrador
btnLogout.addEventListener('click', async () => {
  if (confirm("Deseja encerrar o painel administrativo?")) {
    await FirebaseHelper.logout();
    location.reload();
  }
});

// Monitor de Sessão
FirebaseHelper.assinarAutenticacao((user, profile) => {
  if (user && profile && profile.tipo === 'admin') {
    loginOverlay.style.display = 'none';
  } else {
    loginOverlay.style.display = 'flex';
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.innerText = 'Entrar no Painel';
  }
});

// ==========================================
// MONITOR DE MÉTRICAS FINANCEIRAS EM TEMPO REAL
// ==========================================
FirebaseHelper.assinarMetricasFinanceiras((metricas) => {
  if (!metricas) return;
  ultimoMetricas = metricas;

  const faturamento = metricas.totalFaturamento || 0;
  const premiosPagos = metricas.totalPremiosPagos || 0;
  const lucro = faturamento - premiosPagos;
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;

  // Atualiza cards de topo
  metRevenue.innerText = `R$ ${faturamento.toFixed(2).replace('.', ',')}`;
  metPayout.innerText = `R$ ${premiosPagos.toFixed(2).replace('.', ',')}`;
  
  metProfit.innerText = `R$ ${lucro.toFixed(2).replace('.', ',')}`;
  if (lucro >= 0) {
    metProfit.style.color = 'var(--success)';
  } else {
    metProfit.style.color = 'var(--danger)';
  }

  metMargin.innerText = `${margem.toFixed(0)}%`;
  if (margem >= 30) {
    metMargin.style.color = 'var(--success)';
  } else if (margem >= 0) {
    metMargin.style.color = 'var(--info)';
  } else {
    metMargin.style.color = 'var(--danger)';
  }

  // Atualiza tabela de ranking de PDVs
  metricsPdvTbody.innerHTML = '';
  const ranking = metricas.rankingPdvs || {};
  const pdvsSorted = Object.entries(ranking).sort((a, b) => b[1] - a[1]);

  if (pdvsSorted.length === 0) {
    metricsPdvTbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-log" style="text-align: center; font-style: italic; padding: 40px; color: var(--text-muted);">Nenhum faturamento registrado por PDV.</td>
      </tr>`;
  } else {
    pdvsSorted.forEach(async ([pdvName, pdvFaturamento]) => {
      const precoCupom = estado ? estado.prizes.cupom : 2.0;
      const volVendas = Math.round(pdvFaturamento / precoCupom);
      
      // Busca comissão do PDV (com cache)
      let comissao = cacheComissoes[pdvName];
      if (!comissao) {
        try {
          comissao = await FirebaseHelper.buscarComissaoPdv(pdvName);
          if (comissao) cacheComissoes[pdvName] = comissao;
        } catch (e) { /* usa default */ }
      }
      const comTipo = comissao ? comissao.comissaoTipo : 'bruta';
      const comValor = comissao ? comissao.comissaoValor : 10;
      const comTipoLabel = comTipo === 'liquida' ? 'Líquida' : 'Bruta';
      
      // Calcular valor da comissão
      let valorComissao = 0;
      if (comTipo === 'bruta') {
        valorComissao = pdvFaturamento * (comValor / 100);
      } else {
        // Líquida: calculada sobre o lucro (faturamento - prêmios proporcionais)
        const premiosProporcional = premiosPagos > 0 && faturamento > 0 ? (pdvFaturamento / faturamento) * premiosPagos : 0;
        valorComissao = (pdvFaturamento - premiosProporcional) * (comValor / 100);
      }
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${pdvName}</strong></td>
        <td>${volVendas} cartelas</td>
        <td style="color: var(--success); font-weight: 700;">R$ ${pdvFaturamento.toFixed(2).replace('.', ',')}</td>
        <td style="font-size: 12px;">${comTipoLabel} ${comValor}%</td>
        <td style="color: var(--neon-gold); font-weight: 700;">R$ ${valorComissao.toFixed(2).replace('.', ',')}</td>
      `;
      metricsPdvTbody.appendChild(tr);
    });
  }

  // Auditoria
  if (estado) {
    metAvgTicket.innerText = estado.prizes.cupom.toFixed(2).replace('.', ',');
    const ratio = faturamento / (premiosPagos || 1);
    metRatio.innerText = `${ratio.toFixed(1)}x`;

    const riggingAtivo = estado.forcedPdvWinner && estado.forcedPdvWinner !== 'NENHUM';
    metRiggingStatus.innerText = riggingAtivo ? `ATIVADO (${estado.forcedPdvWinner})` : 'Inativo';
    metRiggingStatus.style.color = riggingAtivo ? 'var(--warning)' : 'var(--text-muted)';

    if (lucro > (faturamento * 0.3)) {
      metFinancialHealth.innerText = 'EXCELENTE';
      metFinancialHealth.style.color = 'var(--success)';
    } else if (lucro >= 0) {
      metFinancialHealth.innerText = 'SAUDÁVEL';
      metFinancialHealth.style.color = 'var(--info)';
    } else {
      metFinancialHealth.innerText = 'CRÍTICO (Prejuízo)';
      metFinancialHealth.style.color = 'var(--danger)';
    }

    // Atualiza estatísticas do prioritário inteligente em tempo real se o modo estiver ativo
    if (selectAdminRiggingMode && selectAdminRiggingMode.value === 'INTELIGENTE') {
      atualizarPainelDirecionamento();
    }
  }
});

// Inscreve para atualizações do estado do jogo
FirebaseHelper.assinarEstadoJogo(renderizarAdmin);

// Envia heartbeat do motor do Admin a cada 3 segundos para sincronização cross-device
const myEngineClientId = 'admin_' + Math.random().toString(36).substring(2, 9);
setInterval(() => {
  if (estado) {
    FirebaseHelper.enviarHeartbeat(myEngineClientId, 'admin');
  }
}, 3000);

// Escuta comandos vindos dos Pontos de Venda (PDVs) em tempo real
FirebaseHelper.assinarComandos((comando, payload) => {
  if (comando === 'REGISTRAR_CARTELA') {
    const card = payload.card;
    adicionarCardAoEstado(card);
  } else if (comando === 'REGISTRAR_CARTELAS_LOTE') {
    const cards = payload.cards;
    if (cards && cards.length > 0) {
      cards.forEach(card => adicionarCardAoEstado(card));
    }
  }
});

function adicionarCardAoEstado(card) {
  const statusAtual = estado.status;
  
  // Garante que a cartela tenha o ID do sorteio correto de destino no momento da inserção
  card.gameId = (statusAtual === 'WAITING') ? estado.gameId : estado.nextGameId;

  if (statusAtual === 'WAITING') {
    if (estado.cards.some(c => c.id === card.id)) return;
    estado.cards.push(card);
  } else {
    if (!estado.nextCards) estado.nextCards = [];
    if (estado.nextCards.some(c => c.id === card.id)) return;
    estado.nextCards.push(card);
  }
  
  // Recalcula o jogo com a nova cartela
  estado = processarEstadoJogo(estado);
  FirebaseHelper.salvarEstadoJogo(estado);
}

// BINDINGS DO AGENDADOR DE RODADAS

// Botão Cancelar Contagem
btnCancelCountdown.addEventListener('click', () => {
  estado.countdownEndTime = null;
  estado.aiActive = false;
  FirebaseHelper.salvarEstadoJogo(estado);
  alert("Agendamento cancelado!");
});

// TIMER LOOP DE SEGUNDO EM SEGUNDO (ADMIN ENGINE)
// Web Worker para a contagem regressiva (evita throttling do navegador em background)
const workerCountdownCode = `
  let timerId = null;
  self.onmessage = function(e) {
    if (e.data.action === 'start') {
      if (timerId) clearInterval(timerId);
      timerId = setInterval(() => {
        self.postMessage('tick');
      }, 1000);
    } else if (e.data.action === 'stop') {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    }
  };
`;
let countdownWorker = null;
try {
  const blobCountdown = new Blob([workerCountdownCode], { type: 'application/javascript' });
  countdownWorker = new Worker(URL.createObjectURL(blobCountdown));
  countdownWorker.onmessage = function() {
    executarTickContagem();
  };
  countdownWorker.postMessage({ action: 'start' });
} catch (err) {
  console.warn('[ADMIN] Web Worker para contagem regressiva falhou (CSP ou incompatibilidade). Usando fallback de setInterval.', err);
  setInterval(() => {
    executarTickContagem();
  }, 1000);
}

function executarTickContagem() {
  if (!estado) return;

  // 1. Se contagem ativa
  if (estado.status === 'WAITING' && estado.countdownEndTime) {
    const agora = Date.now();
    let tempoRestante = Math.max(0, Math.round((estado.countdownEndTime - agora) / 1000));

    // Se no modo IA e faltam menos de 10 segundos
    if (estado.schedulingMode === 'IA' && estado.aiActive) {
      const faturamento = estado.cards.length * estado.prizes.cupom;
      const custosPremios = estado.prizes.quadra + estado.prizes.quina + estado.prizes.bingo;
      const metaLucro = custosPremios * 1.30;

      // Se faturamento abaixo da meta de segurança, prorroga
      if (faturamento < metaLucro && tempoRestante <= 10 && tempoRestante > 0) {
        estado.countdownEndTime += 60 * 1000; // prorroga 60s
        tempoRestante = Math.max(0, Math.round((estado.countdownEndTime - agora) / 1000));
        FirebaseHelper.salvarEstadoJogo(estado);
        console.log("IA: Margem de lucro crítica. Prorrogando vendas em 60s.");
      }
    }

    // Formata exibição na tela do Admin
    const min = Math.floor(tempoRestante / 60);
    const seg = tempoRestante % 60;
    const txtContagem = `INICIANDO EM ${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
    
    // Atualiza apenas o status badge temporariamente
    gameStatusText.innerText = txtContagem;

    // Se zerou o cronômetro, inicia automaticamente!
    if (tempoRestante <= 0) {
      estado.countdownEndTime = null;
      estado.aiActive = false;
      
      // Se não tiver cartelas no jogo, suspende/pula e avança para a próxima
      if (!estado.cards || estado.cards.length === 0) {
        console.warn(`[ADMIN] Sorteio programado ${estado.gameId} suspenso/pulado: nenhuma cartela vendida para esta rodada. Avançando para a próxima.`);
        gameStatusText.innerText = "SEM VENDAS: AVANÇANDO";
        estado = avancarProximaRodada(estado);
        FirebaseHelper.salvarEstadoJogo(estado);
        return;
      }
      
      // Inicia rodada
      if (ultimoMetricas && ultimoMetricas.rankingPdvs) {
        estado.pdvDailySales = ultimoMetricas.rankingPdvs;
      }
      estado = sortearProximaBola(estado);
      FirebaseHelper.salvarEstadoJogo(estado);

      // Dispara o Auto-Sorteio programático
      setTimeout(() => {
        const btnAuto = document.getElementById('btn-auto-draw');
        if (btnAuto) btnAuto.click();
      }, 500);
    }
  }
}

function checarEAgendarProximaRodadaAutomatica() {
  if (estado.status !== 'ENDED') return;
  if (autoAdvanceTimeoutId !== null) return; // Já está agendado
  
  const temProxima = estado.rodadasQueue && estado.rodadasQueue.some(r => !r.status || r.status === 'PENDING');
  if (temProxima) {
    console.log("[PROGRAMAÇÃO] Detectada próxima rodada pendente na fila. Avançando automaticamente em 15 segundos...");
    autoAdvanceTimeoutId = setTimeout(() => {
      autoAdvanceTimeoutId = null;
      if (estado.status === 'ENDED') {
        estado = avancarProximaRodada(estado);
        FirebaseHelper.salvarEstadoJogo(estado);
        console.log("[PROGRAMAÇÃO] Transição de rodada efetuada automaticamente.");
      }
    }, 15000); // 15 segundos
  }
}

function limparTimeoutAvancoAutomatico() {
  if (autoAdvanceTimeoutId !== null) {
    clearTimeout(autoAdvanceTimeoutId);
    autoAdvanceTimeoutId = null;
    console.log("[PROGRAMAÇÃO] Timeout de avanço automático cancelado.");
  }
}

// ==========================================
// GESTÃO DE COMISSÕES DE PDV
// ==========================================

async function carregarComissoesPdvAdmin() {
  if (!comissoesPdvList) return;
  
  try {
    const pdvs = await FirebaseHelper.listarPdvsCadastrados();
    comissoesPdvList.innerHTML = '';
    
    if (pdvs.length === 0) {
      comissoesPdvList.innerHTML = '<div class="empty-log" style="text-align: center; font-style: italic; padding: 30px; color: var(--text-muted);">Nenhum PDV cadastrado no sistema.</div>';
      return;
    }
    
    for (const pdv of pdvs) {
      let comissao;
      try {
        comissao = await FirebaseHelper.buscarComissaoPdv(pdv.pdvNome);
      } catch (e) { /* usa default */ }
      
      const tipo = comissao ? comissao.comissaoTipo : 'bruta';
      const valor = comissao ? comissao.comissaoValor : 10;
      const tipoLabel = tipo === 'liquida' ? 'Líquida' : 'Bruta';
      
      // Cache para a tabela de ranking
      cacheComissoes[pdv.pdvNome] = { comissaoTipo: tipo, comissaoValor: valor };
      
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--admin-border); border-radius: 8px; flex-wrap: wrap;';
      row.innerHTML = `
        <div style="flex: 2; min-width: 120px;">
          <strong style="font-size: 13px;">${pdv.pdvNome}</strong>
        </div>
        <div style="flex: 1; min-width: 90px;">
          <select class="form-control comissao-tipo-edit" data-pdv="${pdv.pdvNome}" style="padding: 4px 8px; font-size: 11px; height: auto;">
            <option value="bruta" ${tipo === 'bruta' ? 'selected' : ''}>Bruta</option>
            <option value="liquida" ${tipo === 'liquida' ? 'selected' : ''}>Líquida</option>
          </select>
        </div>
        <div style="flex: 0 0 70px;">
          <input type="number" class="form-control comissao-valor-edit" data-pdv="${pdv.pdvNome}" value="${valor}" min="0" max="100" step="0.5" style="padding: 4px 8px; font-size: 11px; width: 65px;">
        </div>
        <div style="font-size: 12px; color: var(--neon-gold); font-weight: 700;">%</div>
        <button class="btn btn-primary btn-mini btn-salvar-comissao-row" data-pdv="${pdv.pdvNome}" style="padding: 5px 10px; font-size: 11px; font-weight: 700;">Salvar</button>
      `;
      comissoesPdvList.appendChild(row);
    }
    
    // Event listener para botões "Salvar" inline
    comissoesPdvList.querySelectorAll('.btn-salvar-comissao-row').forEach(btn => {
      btn.addEventListener('click', async function() {
        const pdvNome = this.dataset.pdv;
        const tipoSelect = comissoesPdvList.querySelector(`.comissao-tipo-edit[data-pdv="${pdvNome}"]`);
        const valorInput = comissoesPdvList.querySelector(`.comissao-valor-edit[data-pdv="${pdvNome}"]`);
        
        if (!tipoSelect || !valorInput) return;
        
        const tipo = tipoSelect.value;
        const valor = parseFloat(valorInput.value) || 10;
        
        try {
          await FirebaseHelper.salvarComissaoPdv(pdvNome, tipo, valor);
          cacheComissoes[pdvNome] = { comissaoTipo: tipo, comissaoValor: valor };
          this.innerText = '✓ Salvo!';
          this.style.background = 'var(--success)';
          setTimeout(() => {
            this.innerText = 'Salvar';
            this.style.background = '';
          }, 2000);
        } catch (err) {
          alert('Erro ao salvar comissão: ' + err.message);
        }
      });
    });
    
  } catch (err) {
    console.error('Erro ao carregar comissões:', err);
    comissoesPdvList.innerHTML = '<div class="empty-log" style="text-align: center; font-style: italic; padding: 30px; color: var(--danger);">Erro ao carregar PDVs.</div>';
  }
}

// Salvar comissão manual (formulário inferior)
if (btnSaveComissao) {
  btnSaveComissao.addEventListener('click', async () => {
    const pdvNome = inputComissaoPdvNome?.value?.trim();
    const tipo = selectComissaoTipo?.value || 'bruta';
    const valor = parseFloat(inputComissaoValor?.value) || 10;
    
    if (!pdvNome) {
      alert('Por favor, digite o nome do PDV.');
      return;
    }
    
    try {
      await FirebaseHelper.salvarComissaoPdv(pdvNome, tipo, valor);
      cacheComissoes[pdvNome] = { comissaoTipo: tipo, comissaoValor: valor };
      alert(`✅ Comissão do PDV "${pdvNome}" salva: ${tipo === 'liquida' ? 'Líquida' : 'Bruta'} ${valor}%`);
      inputComissaoPdvNome.value = '';
      inputComissaoValor.value = '10';
      // Recarrega a lista
      carregarComissoesPdvAdmin();
    } catch (err) {
      alert('Erro ao salvar comissão: ' + err.message);
    }
  });
}

// Carregar comissões ao abrir a aba de métricas
if (tabMetrics) {
  tabMetrics.addEventListener('click', () => {
    carregarComissoesPdvAdmin();
  });
}

// Carrega comissões inicialmente
setTimeout(carregarComissoesPdvAdmin, 2000);

// ==========================================
// GESTÃO DE PDVS - LÓGICA DO PAINEL ADMIN
// ==========================================
let cachePdvs = [];
let modoModalPdv = 'CRIAR'; // 'CRIAR' ou 'EDITAR'
let pdvNomeOriginalEdicao = '';

async function carregarPdvsAdmin() {
  if (!pdvsListTbody) return;
  try {
    const pdvs = await FirebaseHelper.listarPdvsCadastrados();
    cachePdvs = pdvs;
    pdvsListTbody.innerHTML = '';
    
    if (pdvs.length === 0) {
      pdvsListTbody.innerHTML = '<tr><td colspan="7" class="empty-log" style="text-align: center; font-style: italic; padding: 40px; color: var(--text-muted);">Nenhum PDV cadastrado no sistema.</td></tr>';
      return;
    }
    
    pdvs.forEach(pdv => {
      const op = pdv.operadores && pdv.operadores.length > 0 ? pdv.operadores[0] : null;
      const opNome = op ? op.nome : 'Sem operador';
      const opEmail = op ? op.email : 'Sem e-mail';
      const comissaoText = `${pdv.comissaoValor}% (${pdv.comissaoTipo === 'liquida' ? 'Líquida' : 'Bruta'})`;
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding: 12px; border-bottom: 1px solid var(--admin-border);"><strong>${pdv.pdvNome}</strong></td>
        <td style="padding: 12px; border-bottom: 1px solid var(--admin-border);">${opNome}</td>
        <td style="padding: 12px; border-bottom: 1px solid var(--admin-border); color: var(--text-muted);">${opEmail}</td>
        <td style="padding: 12px; border-bottom: 1px solid var(--admin-border); color: var(--text-muted);">${pdv.endereco || '-'}</td>
        <td style="padding: 12px; border-bottom: 1px solid var(--admin-border); color: var(--text-muted);">${pdv.whatsapp || '-'}</td>
        <td style="padding: 12px; border-bottom: 1px solid var(--admin-border); color: var(--neon-gold); font-weight: bold;">${comissaoText}</td>
        <td style="padding: 12px; border-bottom: 1px solid var(--admin-border); text-align: center; white-space: nowrap;">
          <button class="btn btn-info btn-mini btn-editar-pdv" data-pdv="${pdv.pdvNome}" style="width: auto; display: inline-block; padding: 6px 12px; font-size: 11px; margin-right: 6px;">Editar</button>
          <button class="btn btn-danger btn-mini btn-excluir-pdv" data-pdv="${pdv.pdvNome}" style="width: auto; display: inline-block; padding: 6px 12px; font-size: 11px;">Excluir</button>
        </td>
      `;
      pdvsListTbody.appendChild(tr);
    });
    
    // Eventos dos botões de ações
    pdvsListTbody.querySelectorAll('.btn-editar-pdv').forEach(btn => {
      btn.addEventListener('click', function() {
        abrirModalPdv(this.dataset.pdv);
      });
    });
    
    pdvsListTbody.querySelectorAll('.btn-excluir-pdv').forEach(btn => {
      btn.addEventListener('click', function() {
        excluirPdvAdmin(this.dataset.pdv);
      });
    });
  } catch (err) {
    console.error('Erro ao carregar PDVs:', err);
    pdvsListTbody.innerHTML = '<tr><td colspan="7" class="empty-log" style="text-align: center; color: var(--danger);">Erro ao carregar PDVs.</td></tr>';
  }
}

function abrirModalPdv(pdvNome = null) {
  if (!modalPdvAdmin) return;
  
  formPdvAdmin.reset();
  
  if (pdvNome) {
    modoModalPdv = 'EDITAR';
    pdvNomeOriginalEdicao = pdvNome;
    modalPdvTitle.innerText = `Editar PDV: ${pdvNome}`;
    sectionOperadorCredenciais.style.display = 'none';
    
    inputOpNome.removeAttribute('required');
    inputOpEmail.removeAttribute('required');
    inputOpSenha.removeAttribute('required');
    
    const pdv = cachePdvs.find(p => p.pdvNome === pdvNome);
    if (pdv) {
      inputPdvNome.value = pdv.pdvNome;
      inputPdvWhatsapp.value = pdv.whatsapp || '';
      inputPdvEndereco.value = pdv.endereco || '';
      selectPdvComissaoTipo.value = pdv.comissaoTipo || 'bruta';
      inputPdvComissaoValor.value = pdv.comissaoValor || 10;
    }
  } else {
    modoModalPdv = 'CRIAR';
    pdvNomeOriginalEdicao = '';
    modalPdvTitle.innerText = "Cadastrar Novo PDV";
    sectionOperadorCredenciais.style.display = 'block';
    
    inputOpNome.setAttribute('required', 'required');
    inputOpEmail.setAttribute('required', 'required');
    inputOpSenha.setAttribute('required', 'required');
  }
  
  modalPdvAdmin.style.display = 'flex';
}

function fecharModalPdv() {
  if (modalPdvAdmin) modalPdvAdmin.style.display = 'none';
}

async function excluirPdvAdmin(pdvNome) {
  if (confirm(`Tem certeza absoluta de que deseja excluir o PDV "${pdvNome}" e TODAS as contas de operadores atreladas a ele? Esta ação não pode ser desfeita.`)) {
    try {
      await FirebaseHelper.excluirPdvPorAdmin(pdvNome);
      alert('PDV e seus operadores excluídos com sucesso.');
      carregarPdvsAdmin();
      carregarComissoesPdvAdmin();
    } catch (err) {
      alert('Erro ao excluir PDV: ' + err.message);
    }
  }
}

// Configuração de eventos do modal
if (btnNovoPdv) {
  btnNovoPdv.addEventListener('click', () => abrirModalPdv());
}

if (btnModalClose) {
  btnModalClose.addEventListener('click', fecharModalPdv);
}

if (btnPdvCancel) {
  btnPdvCancel.addEventListener('click', fecharModalPdv);
}

// Fechar modal clicando fora da caixa
window.addEventListener('click', (e) => {
  if (e.target === modalPdvAdmin) {
    fecharModalPdv();
  }
});

if (formPdvAdmin) {
  formPdvAdmin.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const pdvNome = inputPdvNome.value.trim();
    const whatsapp = inputPdvWhatsapp.value.trim();
    const endereco = inputPdvEndereco.value.trim();
    const comissaoTipo = selectPdvComissaoTipo.value;
    const comissaoValor = parseFloat(inputPdvComissaoValor.value) || 0;
    
    btnPdvSaveSubmit.disabled = true;
    btnPdvSaveSubmit.innerText = 'Salvando...';
    
    try {
      if (modoModalPdv === 'CRIAR') {
        const opNome = inputOpNome.value.trim();
        const opEmail = inputOpEmail.value.trim();
        const opSenha = inputOpSenha.value;
        
        if (opSenha.length < 6) {
          throw new Error('A senha do operador deve conter pelo menos 6 caracteres.');
        }
        
        await FirebaseHelper.cadastrarOperadorPorAdmin(
          opEmail, 
          opSenha, 
          pdvNome, 
          opNome, 
          comissaoTipo, 
          comissaoValor, 
          endereco, 
          whatsapp
        );
        alert('Ponto de Venda (PDV) e operador cadastrados com sucesso!');
      } else {
        await FirebaseHelper.atualizarPdvPorAdmin(
          pdvNomeOriginalEdicao,
          pdvNome,
          comissaoTipo,
          comissaoValor,
          endereco,
          whatsapp
        );
        alert('PDV updated com sucesso!');
      }
      
      fecharModalPdv();
      carregarPdvsAdmin();
      carregarComissoesPdvAdmin();
    } catch (err) {
      alert('Erro ao salvar PDV: ' + err.message);
    } finally {
      btnPdvSaveSubmit.disabled = false;
      btnPdvSaveSubmit.innerText = 'Salvar PDV';
    }
  });
}

// ==========================================
// CONFIGURAÇÕES DE INTEGRAÇÃO PIX - ADMIN
// ==========================================

// Atualiza a URL padrão quando o tipo de gateway é alterado
if (selectGatewayType) {
  selectGatewayType.addEventListener('change', () => {
    const type = selectGatewayType.value;
    if (type === 'pixup') {
      inputApiUrl.value = 'https://api.pixupbr.com/v2';
    }
  });
}

// Carrega as configurações de gateway do banco e preenche o form
async function carregarConfiguracaoGatewayAdmin() {
  try {
    const config = await FirebaseHelper.buscarConfiguracaoGateway();
    if (!config) return;

    selectGatewayType.value = config.type || 'pixup';
    inputApiUrl.value = config.apiUrl || 'https://api.pixupbr.com/v2';
    inputClientId.value = config.clientId || '';
    inputClientSecret.value = config.clientSecret || '';
    inputChavePix.value = config.chavePix || '';
  } catch (err) {
    console.error('Erro ao carregar configurações de gateway:', err);
  }
}

// Salva as configurações de gateway ao submeter o formulário
if (formGatewayPix) {
  formGatewayPix.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const type = selectGatewayType.value;
    const configData = {
      type,
      apiUrl: inputApiUrl.value.trim(),
      clientId: inputClientId.value.trim(),
      clientSecret: inputClientSecret.value.trim(),
      chavePix: inputChavePix.value.trim()
    };

    btnSaveGateway.disabled = true;
    btnSaveGateway.innerText = 'Salvando Configurações...';

    try {
      await FirebaseHelper.salvarConfiguracaoGateway(configData);
      alert('Configurações de Gateway Pix salvas com sucesso!');
    } catch (err) {
      alert('Erro ao salvar configurações de gateway: ' + err.message);
    } finally {
      btnSaveGateway.disabled = false;
      btnSaveGateway.innerText = 'Salvar Configurações de Gateway';
    }
  });
}
