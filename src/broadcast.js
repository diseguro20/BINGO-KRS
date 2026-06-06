/**
 * BINGOKRS - Controlador da Tela de Transmissão da TV (index.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { obterRankingTop20, ACUMULADO_LIMITE_ORDEM } from './game.js';

// Elementos do DOM
const containerApp = document.getElementById('broadcast-app');
const verticalBallsList = document.getElementById('vertical-balls-list');
const currentBallNum = document.getElementById('current-ball-num');
const giantBall = document.getElementById('giant-ball');
const jackpotValue = document.getElementById('jackpot-value');
const lastThreeBallsRow = document.getElementById('last-three-balls-row');
const horizontalBallsRow = document.getElementById('horizontal-balls-row');
const orderCounter = document.getElementById('order-counter');
const numbersGrid = document.getElementById('numbers-grid-90');
const rankingTbody = document.getElementById('ranking-tbody');
const bottomInfoContent = document.getElementById('panel-info-content');
const tvNextRoundId = document.getElementById('tv-next-round-id');
const tvNextRoundCountdown = document.getElementById('tv-next-round-countdown');

// Elementos dos painéis de informação (Sidebar Esquerda)
const valQuadra = document.getElementById('val-quadra');
const valQuina = document.getElementById('val-quina');
const valBingo = document.getElementById('val-bingo');
const valAcumuladoLeft = document.getElementById('val-acumulado-left');
const valSorteio = document.getElementById('val-sorteio');
const valCupom = document.getElementById('val-cupom');
const valData = document.getElementById('val-data');
const valHora = document.getElementById('val-hora');

// Estado local de rastreamento do último número sorteado para animação
let ultimoNumeroRenderizado = null;
let estadoGlobal = null;

// Inicializa a data local
valData.innerText = new Date().toLocaleDateString('pt-BR');

// Atualiza o Relógio Local em tempo real e o painel da próxima rodada
setInterval(() => {
  const agora = new Date();
  valHora.innerText = agora.toLocaleTimeString('pt-BR');
  
  if (estadoGlobal) {
    if (estadoGlobal.status === 'WAITING') {
      atualizarContagemRegressivaLocal();
    }
    atualizarPainelProximaRodada();
  }
}, 1000);

/**
 * Atualiza visualmente a contagem regressiva local de forma fluida
 */
function atualizarContagemRegressivaLocal() {
  if (!estadoGlobal) return;
  
  const panelHeaderCentered = document.querySelector('.panel-header-centered');
  
  if (estadoGlobal.countdownEndTime) {
    const agora = Date.now();
    const tempoRestante = Math.max(0, Math.round((estadoGlobal.countdownEndTime - agora) / 1000));
    
    if (tempoRestante > 0) {
      let textoTime;
      if (tempoRestante >= 3600) {
        const hrs = Math.floor(tempoRestante / 3600);
        const min = Math.floor((tempoRestante % 3600) / 60);
        const seg = tempoRestante % 60;
        textoTime = `${hrs}:${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
      } else {
        const min = Math.floor(tempoRestante / 60);
        const seg = tempoRestante % 60;
        textoTime = `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
      }
      
      currentBallNum.innerText = textoTime;
      currentBallNum.style.fontSize = '34px'; // Tamanho menor para caber "MM:SS"
      
      if (panelHeaderCentered) {
        panelHeaderCentered.innerText = "PRÓXIMA RODADA";
        panelHeaderCentered.style.color = "var(--neon-cyan)";
      }
      
      // Define cor amarela para a contagem regressiva
      giantBall.className = 'giant-ball-3d ball-color-6';
      return;
    }
  }
  
  // Se não houver contagem regressiva agendada
  currentBallNum.innerText = 'BINGO';
  currentBallNum.style.fontSize = '34px';
  giantBall.className = 'giant-ball-3d';
  
  if (panelHeaderCentered) {
    panelHeaderCentered.innerText = "AGUARDANDO SORTEIO";
    panelHeaderCentered.style.color = "var(--neon-pink)";
  }
}

/**
 * Atualiza o painel da próxima rodada com o ID e o tempo regressivo
 */
function atualizarPainelProximaRodada() {
  if (!estadoGlobal) return;

  // 1. Determina o ID do próximo sorteio
  let proximoId = estadoGlobal.nextGameId || "--";
  if (estadoGlobal.rodadasQueue && estadoGlobal.rodadasQueue.length > 0) {
    proximoId = estadoGlobal.rodadasQueue[0].gameId;
  }
  
  if (tvNextRoundId) {
    tvNextRoundId.innerText = `SORTEIO ${proximoId}`;
  }

  // 2. Determina o texto e o tempo da contagem regressiva
  if (tvNextRoundCountdown) {
    if (estadoGlobal.status === 'WAITING') {
      if (estadoGlobal.countdownEndTime) {
        const agora = Date.now();
        const tempoRestante = Math.max(0, Math.round((estadoGlobal.countdownEndTime - agora) / 1000));
        
        if (tempoRestante > 0) {
          let textoTime;
          if (tempoRestante >= 3600) {
            const hrs = Math.floor(tempoRestante / 3600);
            const min = Math.floor((tempoRestante % 3600) / 60);
            const seg = tempoRestante % 60;
            textoTime = `${hrs}:${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
          } else {
            const min = Math.floor(tempoRestante / 60);
            const seg = tempoRestante % 60;
            textoTime = `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
          }
          tvNextRoundCountdown.innerText = textoTime;
          tvNextRoundCountdown.style.color = "var(--neon-cyan)";
        } else {
          tvNextRoundCountdown.innerText = "INICIANDO...";
          tvNextRoundCountdown.style.color = "var(--success)";
        }
      } else {
        tvNextRoundCountdown.innerText = "AGUARDANDO INÍCIO";
        tvNextRoundCountdown.style.color = "var(--neon-pink)";
      }
    } else if (estadoGlobal.status === 'PLAYING') {
      tvNextRoundCountdown.innerText = "SORTEIO EM ANDAMENTO";
      tvNextRoundCountdown.style.color = "var(--warning)";
    } else if (estadoGlobal.status === 'ENDED') {
      if (estadoGlobal.rodadasQueue && estadoGlobal.rodadasQueue.length > 0) {
        tvNextRoundCountdown.innerText = "INICIANDO PRÓXIMO...";
        tvNextRoundCountdown.style.color = "var(--success)";
      } else {
        tvNextRoundCountdown.innerText = "SORTEIO FINALIZADO";
        tvNextRoundCountdown.style.color = "var(--text-muted)";
      }
    }
  }
}

/**
 * Função para definir a cor da bola 3D baseada no número
 * Classificação clássica de loterias
 */
function obterClasseCorBola(numero) {
  if (numero <= 15) return 'ball-color-1'; // 1-15 Rosa
  if (numero <= 30) return 'ball-color-2'; // 16-30 Azul
  if (numero <= 45) return 'ball-color-3'; // 31-45 Roxo
  if (numero <= 60) return 'ball-color-4'; // 46-60 Verde
  if (numero <= 75) return 'ball-color-5'; // 61-75 Laranja
  return 'ball-color-6'; // 76-90 Amarelo
}

/**
 * Ajusta o zoom da tela de forma responsiva para manter a proporção 16:9
 */
function ajustarEscala() {
  const larguraAlvo = 1920;
  const alturaAlvo = 1080;
  const larguraJanela = window.innerWidth;
  const alturaJanela = window.innerHeight;

  // Calcula o fator de escala baseado no menor valor de proporção (ajuste de borda a borda)
  const escala = Math.min(larguraJanela / larguraAlvo, alturaJanela / alturaAlvo);
  
  // Aplica a escala centralizada
  containerApp.style.transform = `translate(-50%, -50%) scale(${escala})`;
}

// Escuta o redimensionamento da janela
window.addEventListener('resize', ajustarEscala);
// Executa no carregamento inicial
ajustarEscala();

/**
 * Constrói o grid estático de 1 a 90 números no tabuleiro principal
 */
function inicializarTabuleiro() {
  numbersGrid.innerHTML = '';
  for (let i = 1; i <= 90; i++) {
    const numDiv = document.createElement('div');
    numDiv.id = `num-cell-${i}`;
    numDiv.className = 'board-num';
    numDiv.innerText = i.toString().padStart(2, '0');
    numbersGrid.appendChild(numDiv);
  }
}

// Inicializa o tabuleiro ao rodar o script
inicializarTabuleiro();

/**
 * Renderiza todo o aplicativo com base no estado do jogo recebido em tempo real
 */
function renderizarApp(estado) {
  if (!estado) return;
  estadoGlobal = estado;

  // 1. Atualizar valores das premiações e sorteio (Sidebar Esquerda)
  valQuadra.innerText = `R$ ${estado.prizes.quadra.toFixed(2).replace('.', ',')}`;
  valQuina.innerText = `R$ ${estado.prizes.quina.toFixed(2).replace('.', ',')}`;
  valBingo.innerText = `R$ ${estado.prizes.bingo.toFixed(2).replace('.', ',')}`;
  
  const acumuladoFormatado = `R$ ${estado.prizes.acumulado.toFixed(2).replace('.', ',')}`;
  valAcumuladoLeft.innerText = acumuladoFormatado;
  jackpotValue.innerText = acumuladoFormatado;
  
  valSorteio.innerText = estado.gameId;
  valCupom.innerText = `R$ ${estado.prizes.cupom.toFixed(2).replace('.', ',')}`;
  
  if (estado.dataSorteio) {
    valData.innerText = estado.dataSorteio;
  }

  // 2. Tabuleiro de 1-90 e Ordem do Sorteio
  orderCounter.innerText = `ORDEM ${estado.drawnBalls.length.toString().padStart(2, '0')}`;
  
  // Atualiza as classes de cada célula do tabuleiro
  for (let i = 1; i <= 90; i++) {
    const cell = document.getElementById(`num-cell-${i}`);
    if (cell) {
      cell.className = 'board-num'; // Limpa classes
      
      if (estado.drawnBalls.includes(i)) {
        cell.classList.add('drawn');
      }
      
      // Destaca o último sorteado (se houver)
      if (estado.drawnBalls.length > 0 && estado.drawnBalls[estado.drawnBalls.length - 1] === i) {
        cell.classList.add('latest-drawn');
      }
    }
  }

  // 3. Bola Atual (Globo Gigante) ou Contagem Regressiva
  const panelHeaderCentered = document.querySelector('.panel-header-centered');
  
  if (estado.status === 'WAITING') {
    atualizarContagemRegressivaLocal();
  } else {
    // Restaura o cabeçalho original
    if (panelHeaderCentered) {
      panelHeaderCentered.innerText = "BOLA ATUAL";
      panelHeaderCentered.style.color = "var(--neon-cyan)";
    }

    if (estado.drawnBalls.length > 0) {
      const atual = estado.drawnBalls[estado.drawnBalls.length - 1];
      currentBallNum.innerText = atual.toString().padStart(2, '0');
      currentBallNum.style.fontSize = '64px'; // Restaura tamanho da fonte
      
      // Define a cor da bola gigante
      giantBall.className = 'giant-ball-3d'; // Limpa cores
      giantBall.classList.add(obterClasseCorBola(atual));

      // Aciona animação de pulso se for uma bola nova
      if (ultimoNumeroRenderizado !== atual) {
        giantBall.classList.remove('drawn-pulse');
        // Força reflow para reiniciar animação
        void giantBall.offsetWidth;
        giantBall.classList.add('drawn-pulse');
        ultimoNumeroRenderizado = atual;
      }
    } else {
      currentBallNum.innerText = '--';
      currentBallNum.style.fontSize = '64px';
      giantBall.className = 'giant-ball-3d';
      ultimoNumeroRenderizado = null;
    }
  }

  // 4. Últimas 4 Bolas Sorteadas (Vertical - Sidebar Esquerda)
  // Mostra as bolas sorteadas da penúltima para trás (excluindo a atual)
  const historicoVertical = estado.drawnBalls.slice(0, -1).reverse().slice(0, 4);
  verticalBallsList.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    if (historicoVertical[i] !== undefined) {
      const num = historicoVertical[i];
      verticalBallsList.innerHTML += `
        <div class="small-ball-3d ${obterClasseCorBola(num)}">
          <div class="ball-inner-plate">
            <span class="ball-number">${num.toString().padStart(2, '0')}</span>
          </div>
        </div>`;
    } else {
      verticalBallsList.innerHTML += `<div class="ball-placeholder">--</div>`;
    }
  }

  // 5. Últimas 3 Bolas Sorteada (Abaixo da bola atual - Cronologia recente)
  const historico3Central = estado.drawnBalls.slice(0, -1).reverse().slice(0, 3);
  lastThreeBallsRow.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    if (historico3Central[i] !== undefined) {
      const num = historico3Central[i];
      lastThreeBallsRow.innerHTML += `
        <div class="mini-ball-3d ${obterClasseCorBola(num)}">
          <div class="ball-inner-plate">
            <span class="ball-number">${num.toString().padStart(2, '0')}</span>
          </div>
        </div>`;
    } else {
      lastThreeBallsRow.innerHTML += `<div class="mini-ball-placeholder">--</div>`;
    }
  }

  // 6. Linha do Tempo (Últimas 5 Sorteadas horizontal)
  const historicoHorizontal = estado.drawnBalls.slice(-5);
  horizontalBallsRow.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    if (historicoHorizontal[i] !== undefined) {
      const num = historicoHorizontal[i];
      horizontalBallsRow.innerHTML += `
        <div class="horiz-ball-3d ${obterClasseCorBola(num)}">
          <div class="ball-inner-plate">
            <span class="ball-number">${num.toString().padStart(2, '0')}</span>
          </div>
        </div>`;
    } else {
      horizontalBallsRow.innerHTML += `<div class="horiz-ball-placeholder">--</div>`;
    }
  }

  // 7. Rankings de Cartelas (Top 20)
  const ranking = obterRankingTop20(estado.cards);
  rankingTbody.innerHTML = '';
  if (ranking.length === 0) {
    rankingTbody.innerHTML = `<tr class="empty-row"><td colspan="3">Nenhuma cartela ativa no jogo</td></tr>`;
  } else {
    ranking.forEach(card => {
      let classeGlow = '';
      if (card.numbersRemaining === 1) classeGlow = 'row-rest-1';
      else if (card.numbersRemaining === 2) classeGlow = 'row-rest-2';
      else if (card.numbersRemaining === 3) classeGlow = 'row-rest-3';

      rankingTbody.innerHTML += `
        <tr class="${classeGlow}">
          <td><strong>${card.id}</strong></td>
          <td class="pdv-cell">${card.pdv}</td>
          <td class="rest-cell">${card.numbersRemaining}</td>
        </tr>`;
    });
  }

  // 8. Painel Informativo Inferior Direito
  // Prioridade: Se houver vencedores ativados no sorteio atual, exibe o alerta de vencedor
  if (estado.status === "ENDED" && estado.winners.bingo.length > 0) {
    const ultimoBingo = estado.winners.bingo[estado.winners.bingo.length - 1];
    
    // Verifica se ganhou o acumulado também
    const ganhouAcumulado = estado.winners.acumulado.some(w => w.cardId === ultimoBingo.cardId);
    
    bottomInfoContent.innerHTML = `
      <div class="info-content-title winner-alert-title">🔥 BINGO CONFIRMADO! 🔥</div>
      <div class="info-content-text winner-alert-text">
        Cartela <strong style="color:var(--neon-pink)">${ultimoBingo.cardId}</strong> venceu!<br>
        Ponto de Venda: <strong>${ultimoBingo.pdv}</strong><br>
        ${ganhouAcumulado ? '<span style="color:var(--neon-gold); font-weight:900;">⭐ LEVOU O ACUMULADO! ⭐</span>' : ''}
      </div>`;
  } else {
    // Caso contrário, exibe o painel configurado pelo Administrador
    let config = estado.bottomPanelSettings;
    
    // Se selecionado "MINHAS CARTELAS" / estatísticas rápidas
    if (config.type === "MINHAS_CARTELAS") {
      const totalVendas = estado.cards.length;
      bottomInfoContent.innerHTML = `
        <div class="info-content-title">ESTATÍSTICAS DE CARTELAS</div>
        <div class="info-content-text">
          Total de Cartelas em Jogo: <strong>${totalVendas}</strong><br>
          Operando em tempo real nos Pontos de Venda credenciados!
        </div>`;
    } else if (config.type === "ULTIMO_GANHADOR") {
      // Exibe o último ganhador registrado historicamente
      const todosGanham = estado.winners.bingo;
      if (todosGanham.length > 0) {
        const ult = todosGanham[todosGanham.length - 1];
        bottomInfoContent.innerHTML = `
          <div class="info-content-title">ÚLTIMO GANHADOR</div>
          <div class="info-content-text">
            Cartela <strong>${ult.cardId}</strong> faturou o prêmio!<br>
            PDV: <strong>${ult.pdv}</strong> (Sorteio ${estado.gameId})
          </div>`;
      } else {
        bottomInfoContent.innerHTML = `
          <div class="info-content-title">${config.title}</div>
          <div class="info-content-text">${config.text}</div>`;
      }
    } else {
      // PROMOÇÕES ou PRÓXIMO PRÊMIO padrão
      bottomInfoContent.innerHTML = `
        <div class="info-content-title">${config.title}</div>
        <div class="info-content-text">${config.text}</div>`;
    }
  }
}

// Inscreve a TV para escutar atualizações de estado em tempo real
const unsubscribe = FirebaseHelper.assinarEstadoJogo(renderizarApp);

// Função para exibir o anúncio gigante de ganhador na tela com design premium neon
function mostrarAnuncioGanhadorGigante(payload) {
  const { categoria, cardId, pdv } = payload;
  const rodadaId = estadoGlobal ? estadoGlobal.gameId : '--';

  // Nomes amigáveis das premiações
  const nomesPremios = {
    quadra: 'SAIU QUADRA!',
    quina: 'SAIU QUINA!',
    bingo: 'GANHADOR DO BINGO!',
    acumulado: 'ACUMULADO SAÍDO!'
  };
  const premioTexto = nomesPremios[categoria.toLowerCase()] || 'PRÊMIO SAÍDO!';

  // Cria elemento do overlay se não existir
  let overlay = document.getElementById('tv-winner-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tv-winner-overlay';
    overlay.className = 'winner-overlay';
    document.body.appendChild(overlay);
  }

  // Preenche o HTML interno com visual de luxo
  overlay.innerHTML = `
    <div class="winner-card-container cat-${categoria.toLowerCase()}">
      <div class="winner-title">🏆 Prêmio Confirmado</div>
      <div class="winner-prize-name">${premioTexto}</div>
      <div class="winner-meta-label" style="font-size: 13px; margin-bottom: 8px;">CARTELA VENCEDORA:</div>
      <div class="winner-card-serial">${cardId}</div>
      
      <div class="winner-meta-grid">
        <div class="winner-meta-item">
          <div class="winner-meta-label">Ponto de Venda (PDV)</div>
          <div class="winner-meta-value pdv-glow">${pdv}</div>
        </div>
        <div class="winner-meta-item">
          <div class="winner-meta-label">Rodada do Sorteio</div>
          <div class="winner-meta-value">${rodadaId}</div>
        </div>
      </div>
    </div>
  `;

  // Ativa animação de entrada
  setTimeout(() => {
    overlay.classList.add('active');
  }, 50);

  // Mantém na tela por 8 segundos
  setTimeout(() => {
    overlay.classList.remove('active');
  }, 8000);
}

// Escuta por comandos diretos do Admin
FirebaseHelper.assinarComandos((comando, payload) => {
  if (comando === 'NOVO_GANHADOR') {
    console.log("Novo ganhador detectado no sorteio:", payload);
    mostrarAnuncioGanhadorGigante(payload);
  }
});
