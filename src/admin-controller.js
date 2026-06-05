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

// Elementos do DOM
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

// Simulador de PDV Integrado
const inputPdvName = document.getElementById('input-pdv-name');
const inputPdvQuantity = document.getElementById('input-pdv-quantity');
const btnGenerateCards = document.getElementById('btn-generate-cards');
const btnClearCards = document.getElementById('btn-clear-cards');
const totalCardsValue = document.getElementById('total-cards-value');
const nextCardsValue = document.getElementById('next-cards-value');
const winnersContainer = document.getElementById('winners-container');

// Elementos de Agendamento da Rodada
const schedulingPanelManual = document.getElementById('scheduling-panel-manual');
const schedulingPanelIa = document.getElementById('scheduling-panel-ia');
const inputCountdownMinutes = document.getElementById('input-countdown-minutes');
const btnStartCountdown = document.getElementById('btn-start-countdown');
const btnAiSchedule = document.getElementById('btn-ai-schedule');
const btnCancelCountdown = document.getElementById('btn-cancel-countdown');
const aiMarginStatus = document.getElementById('ai-margin-status');
const aiRevVal = document.getElementById('ai-rev-val');
const aiCostVal = document.getElementById('ai-cost-val');
const aiTargetVal = document.getElementById('ai-target-val');

// Campos do Painel da TV
const selectBottomPanel = document.getElementById('select-bottom-panel');
const inputPanelTitle = document.getElementById('input-panel-title');
const textareaPanelText = document.getElementById('textarea-panel-text');
const btnSavePanel = document.getElementById('btn-save-panel');

// Flag para não sobrescrever formulário enquanto o usuário digita no carregamento
let camposPreenchidosIniciais = false;

/**
 * Atualiza todos os componentes visuais do painel administrativo
 */
function renderizarAdmin(novoEstado) {
  if (!novoEstado) return;
  estado = novoEstado;

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
  totalCardsValue.innerText = estado.cards.length;
  nextCardsValue.innerText = estado.nextCards ? estado.nextCards.length : 0;

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

  // 7. Atualizar Painel de Agendamento (IA / Manual)
  const radioManual = document.querySelector('input[name="scheduling-mode"][value="MANUAL"]');
  const radioIa = document.querySelector('input[name="scheduling-mode"][value="IA"]');

  if (estado.schedulingMode === 'IA') {
    if (radioIa) radioIa.checked = true;
    if (schedulingPanelIa) schedulingPanelIa.style.display = 'block';
    if (schedulingPanelManual) schedulingPanelManual.style.display = 'none';
  } else {
    if (radioManual) radioManual.checked = true;
    if (schedulingPanelManual) schedulingPanelManual.style.display = 'block';
    if (schedulingPanelIa) schedulingPanelIa.style.display = 'none';
  }

  // Cálculo financeiro da IA baseado nas cartelas ativas aguardando (cards)
  const faturamento = estado.cards.length * estado.prizes.cupom;
  const custosPremios = estado.prizes.quadra + estado.prizes.quina + estado.prizes.bingo;
  const metaLucro = custosPremios * 1.30; // 30% margin de lucro

  if (aiRevVal) aiRevVal.innerText = `R$ ${faturamento.toFixed(2).replace('.', ',')}`;
  if (aiCostVal) aiCostVal.innerText = `R$ ${custosPremios.toFixed(2).replace('.', ',')}`;
  if (aiTargetVal) aiTargetVal.innerText = `R$ ${metaLucro.toFixed(2).replace('.', ',')}`;

  if (aiMarginStatus) {
    if (faturamento >= metaLucro) {
      aiMarginStatus.innerText = "SEGURO (Lucro garantido!)";
      aiMarginStatus.style.color = "var(--success)";
    } else {
      aiMarginStatus.innerText = `CRÍTICO (Meta: R$ ${metaLucro.toFixed(2).replace('.', ',')})`;
      aiMarginStatus.style.color = "var(--danger)";
    }
  }

  // Se a contagem regressiva estiver ativa
  if (estado.countdownEndTime) {
    if (btnCancelCountdown) btnCancelCountdown.style.display = 'block';
    if (btnStartCountdown) btnStartCountdown.disabled = true;
    if (btnAiSchedule) btnAiSchedule.disabled = true;
    if (inputCountdownMinutes) inputCountdownMinutes.disabled = true;
    if (radioManual) radioManual.disabled = true;
    if (radioIa) radioIa.disabled = true;

    if (estado.schedulingMode === 'IA') {
      if (btnAiSchedule) btnAiSchedule.innerText = "Piloto Automático IA Ativo...";
      if (btnStartCountdown) btnStartCountdown.innerText = "Iniciar Contagem Regressiva";
    } else {
      if (btnStartCountdown) btnStartCountdown.innerText = "Contagem Regressiva Ativa...";
      if (btnAiSchedule) btnAiSchedule.innerText = "Ativar Agendamento Inteligente";
    }
  } else {
    if (btnCancelCountdown) btnCancelCountdown.style.display = 'none';
    if (btnStartCountdown) btnStartCountdown.disabled = false;
    if (btnAiSchedule) btnAiSchedule.disabled = false;
    if (inputCountdownMinutes) inputCountdownMinutes.disabled = false;
    if (radioManual) radioManual.disabled = false;
    if (radioIa) radioIa.disabled = false;
    
    if (btnStartCountdown) btnStartCountdown.innerText = "Iniciar Contagem Regressiva";
    if (btnAiSchedule) btnAiSchedule.innerText = "Ativar Agendamento Inteligente";
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
  
  estado = sortearProximaBola(estado);
  FirebaseHelper.salvarEstadoJogo(estado);
});

// Iniciar Auto Sorteio
btnAutoDraw.addEventListener('click', () => {
  if (estado.status === 'ENDED' || autoDrawIntervalId !== null) return;
  
  const segundos = parseInt(autoDrawSpeed.value) * 1000;
  
  // Se ainda estiver aguardando, inicia o jogo na primeira bola
  if (estado.status === 'WAITING') {
    estado = sortearProximaBola(estado);
    FirebaseHelper.salvarEstadoJogo(estado);
  }

  autoDrawIntervalId = setInterval(() => {
    if (estado.status === 'PLAYING' && estado.ballsLeft.length > 0) {
      estado = sortearProximaBola(estado);
      FirebaseHelper.salvarEstadoJogo(estado);
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

// Simulador de PDV: Gerar Cartelas
btnGenerateCards.addEventListener('click', () => {
  const pdv = inputPdvName.value.trim() || "Simulador PDV";
  const quant = parseInt(inputPdvQuantity.value) || 10;
  
  const novasCartelas = [];
  const statusAtual = estado.status;
  
  // Decide o ID de destino baseado no status do sorteio
  const gameDestino = (statusAtual === 'WAITING') ? estado.gameId : estado.nextGameId;

  for (let i = 0; i < quant; i++) {
    novasCartelas.push(gerarCartela90Bolas(pdv, gameDestino));
  }

  if (statusAtual === 'WAITING') {
    estado.cards.push(...novasCartelas);
    estado = processarEstadoJogo(estado);
    alert(`${quant} cartelas foram registradas no sorteio ATUAL (${estado.gameId})!`);
  } else {
    if (!estado.nextCards) estado.nextCards = [];
    estado.nextCards.push(...novasCartelas);
    alert(`${quant} cartelas foram reservadas para o PRÓXIMO sorteio (${estado.nextGameId})!`);
  }
  
  FirebaseHelper.salvarEstadoJogo(estado);
});

// Simulador de PDV: Limpar tudo
btnClearCards.addEventListener('click', () => {
  if (confirm("Remover absolutamente TODAS as cartelas cadastradas (Atuais e Próximas)? Isso invalidará o sorteio em andamento.")) {
    estado.cards = [];
    estado.nextCards = [];
    estado.winners = {
      quadra: [],
      quina: [],
      bingo: [],
      acumulado: []
    };
    if (estado.status === 'ENDED') {
      estado.status = 'WAITING';
    }
    FirebaseHelper.salvarEstadoJogo(estado);
    alert("Todas as cartelas foram deletadas.");
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
    estado.cards.push(card);
  } else {
    if (!estado.nextCards) estado.nextCards = [];
    estado.nextCards.push(card);
  }
  
  // Recalcula o jogo com a nova cartela
  estado = processarEstadoJogo(estado);
  FirebaseHelper.salvarEstadoJogo(estado);
}

// BINDINGS DO AGENDADOR DE RODADAS
document.querySelectorAll('input[name="scheduling-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    estado.schedulingMode = e.target.value;
    FirebaseHelper.salvarEstadoJogo(estado);
  });
});

// Botão Iniciar Contagem Manual
btnStartCountdown.addEventListener('click', () => {
  if (estado.status !== 'WAITING') {
    alert("Só é possível iniciar contagem regressiva se o sorteio não estiver em andamento.");
    return;
  }
  const min = parseInt(inputCountdownMinutes.value) || 1;
  estado.countdownEndTime = Date.now() + min * 60 * 1000;
  estado.aiActive = false;
  FirebaseHelper.salvarEstadoJogo(estado);
});

// Botão Iniciar Agendamento IA (Inteligente)
btnAiSchedule.addEventListener('click', () => {
  if (estado.status !== 'WAITING') {
    alert("Só é possível ativar o agendamento inteligente se o sorteio não estiver em andamento.");
    return;
  }
  // Inicia com 1 minuto. Se a margem não for atingida, a IA estenderá automaticamente.
  estado.countdownEndTime = Date.now() + 1 * 60 * 1000;
  estado.aiActive = true;
  FirebaseHelper.salvarEstadoJogo(estado);
  alert("Piloto automático da IA ativado! O sorteio iniciará automaticamente assim que a contagem zerar e houver margem de lucro garantida.");
});

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
