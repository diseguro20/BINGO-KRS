/**
 * BINGOKRS - Controlador do Painel do Administrador (admin.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { 
  criarEstadoInicial, 
  sortearProximaBola, 
  processarEstadoJogo, 
  gerarCartela90Bolas,
  avancarProximaRodada
} from './game.js';

// Estado local do administrador
let estado = criarEstadoInicial();
let autoDrawIntervalId = null;
let autoAdvanceTimeoutId = null;
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
const tabMetrics = document.getElementById('tab-metrics');
const containerTabGame = document.getElementById('container-tab-game');
const containerTabMetrics = document.getElementById('container-tab-metrics');

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

// Flag para não sobrescrever formulário enquanto o usuário digita no carregamento
let camposPreenchidosIniciais = false;

/**
 * Atualiza todos os componentes visuais do painel administrativo
 */
function renderizarAdmin(novoEstado) {
  if (!novoEstado) return;

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
  if (cardsCount === 0) {
    if (riggingFields) riggingFields.style.display = 'none';
    if (riggingStatusMsg) {
      riggingStatusMsg.style.display = 'block';
      riggingStatusMsg.innerHTML = '⚠️ Para direcionar o prêmio, os clientes precisam comprar cartelas nesta rodada primeiro. Aguardando venda...';
    }
  } else {
    if (riggingStatusMsg) riggingStatusMsg.style.display = 'none';
    if (riggingFields) riggingFields.style.display = 'flex';
    
    // Lista os PDVs únicos das cartelas vendidas na rodada ativa
    const pdvsComCartelas = [...new Set(estado.cards.map(c => c.pdv))];
    
    // Salva o valor atualmente selecionado pelo usuário para não perder a digitação ao renderizar
    const currentSelected = selectAdminForcedPdv.value || estado.forcedPdvWinner || 'NENHUM';
    
    // Limpa e repopula o select
    selectAdminForcedPdv.innerHTML = '<option value="NENHUM">NENHUM (Sorteio 100% Aleatório)</option>';
    pdvsComCartelas.forEach(pdvName => {
      const option = document.createElement('option');
      option.value = pdvName;
      option.innerText = pdvName;
      selectAdminForcedPdv.appendChild(option);
    });
    
    // Tenta re-selecionar o valor anterior ou o estado do banco
    if (document.activeElement !== selectAdminForcedPdv) {
      if (pdvsComCartelas.includes(estado.forcedPdvWinner)) {
        selectAdminForcedPdv.value = estado.forcedPdvWinner;
      } else {
        selectAdminForcedPdv.value = 'NENHUM';
      }
    } else {
      if (pdvsComCartelas.includes(currentSelected) || currentSelected === 'NENHUM') {
        selectAdminForcedPdv.value = currentSelected;
      }
    }
    
    if (document.activeElement !== selectAdminRiggingProb) {
      selectAdminRiggingProb.value = (estado.forcedRiggingProbability || 75).toString();
    }
  }

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
    btnAutoDraw.disabled = (autoDrawIntervalId !== null);
    btnPauseDraw.disabled = (autoDrawIntervalId === null);
    btnNextRound.disabled = true;
    limparTimeoutAvancoAutomatico();
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
  
  estado = sortearProximaBola(estado);
  FirebaseHelper.salvarEstadoJogo(estado);
});

// Iniciar Auto Sorteio
btnAutoDraw.addEventListener('click', () => {
  if (estado.status === 'ENDED' || autoDrawIntervalId !== null) return;
  
  if (!estado.cards || estado.cards.length === 0) {
    alert("Não é possível iniciar o sorteio sem nenhuma cartela cadastrada no jogo!");
    return;
  }
  
  const segundos = parseInt(autoDrawSpeed.value) * 1000;
  
  // Se ainda estiver aguardando, inicia o jogo na primeira bola
  if (estado.status === 'WAITING') {
    estado = sortearProximaBola(estado);
    FirebaseHelper.salvarEstadoJogo(estado);
  }

  autoDrawIntervalId = setInterval(() => {
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
        premioPausado = true;
        // Retoma após 12 segundos (popup na TV dura 10s + 2s margem)
        setTimeout(() => {
          premioPausado = false;
          console.log('[AUTO-DRAW] Retomando auto-sorteio após pausa de prêmio.');
        }, 12000);
      }
    } else {
      pararAutoSorteio();
    }
  }, segundos);

  btnAutoDraw.disabled = true;
  btnPauseDraw.disabled = false;
});

// Pausar Auto Sorteio
btnPauseDraw.addEventListener('click', pararAutoSorteio);

function pararAutoSorteio() {
  if (autoDrawIntervalId !== null) {
    clearInterval(autoDrawIntervalId);
    autoDrawIntervalId = null;
  }
  btnAutoDraw.disabled = false;
  btnPauseDraw.disabled = true;
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

// Salvar Direcionamento de Prêmio (Rigging) no Sorteio Ativo
btnSaveAdminRigging.addEventListener('click', async () => {
  if (!estado) return;
  
  const selectedPdv = selectAdminForcedPdv.value;
  const riggingProb = parseInt(selectAdminRiggingProb.value) || 75;
  
  btnSaveAdminRigging.disabled = true;
  btnSaveAdminRigging.innerText = 'Salvando...';
  
  try {
    estado.forcedPdvWinner = selectedPdv;
    estado.forcedRiggingProbability = riggingProb;
    
    await FirebaseHelper.salvarEstadoJogo(estado);
    alert(`Sucesso! O prêmio principal agora está direcionado para o PDV: ${selectedPdv} (Força: ${riggingProb}%).`);
  } catch (err) {
    alert("Erro ao salvar direcionamento: " + err.message);
  } finally {
    btnSaveAdminRigging.disabled = false;
    btnSaveAdminRigging.innerText = 'Aplicar Direcionamento';
  }
});

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
  tabMetrics.classList.remove('active');
  containerTabGame.style.display = 'grid';
  containerTabMetrics.style.display = 'none';
});

tabMetrics.addEventListener('click', () => {
  tabMetrics.classList.add('active');
  tabGame.classList.remove('active');
  containerTabMetrics.style.display = 'block';
  containerTabGame.style.display = 'none';
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
        <td colspan="3" class="empty-log" style="text-align: center; font-style: italic; padding: 40px; color: var(--text-muted);">Nenhum faturamento registrado por PDV.</td>
      </tr>`;
  } else {
    pdvsSorted.forEach(([pdvName, pdvFaturamento]) => {
      const precoCupom = estado ? estado.prizes.cupom : 2.0;
      const volVendas = Math.round(pdvFaturamento / precoCupom);
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${pdvName}</strong></td>
        <td>${volVendas} cartelas</td>
        <td style="color: var(--success); font-weight: 700;">R$ ${pdvFaturamento.toFixed(2).replace('.', ',')}</td>
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
  }
});

// Inscreve para atualizações do estado do jogo
FirebaseHelper.assinarEstadoJogo(renderizarAdmin);

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
setInterval(() => {
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
      
      // Se não tiver cartelas no jogo, suspende o início
      if (!estado.cards || estado.cards.length === 0) {
        FirebaseHelper.salvarEstadoJogo(estado);
        alert("Sorteio programado suspenso: nenhuma cartela vendida para a rodada " + estado.gameId + ".");
        return;
      }
      
      // Inicia rodada
      estado = sortearProximaBola(estado);
      FirebaseHelper.salvarEstadoJogo(estado);

      // Dispara o Auto-Sorteio programático
      setTimeout(() => {
        const btnAuto = document.getElementById('btn-auto-draw');
        if (btnAuto) btnAuto.click();
      }, 500);
    }
  }
}, 1000);

function checarEAgendarProximaRodadaAutomatica() {
  if (estado.status !== 'ENDED') return;
  if (autoAdvanceTimeoutId !== null) return; // Já está agendado
  
  if (estado.rodadasQueue && estado.rodadasQueue.length > 0) {
    console.log("[PROGRAMAÇÃO] Detectada rodada agendada. Avançando automaticamente em 15 segundos...");
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
