/**
 * BINGOKRS - Controlador da Tela de Transmissão da TV (index.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { obterRankingTop20, ACUMULADO_LIMITE_ORDEM, verificarELimparEstadoSeAntigo, sortearProximaBola, avancarProximaRodada } from './game.js';
import { launchFireworks, playSirenSound, playApplauseSound, playCelebrationHorn, narrarBola, narrarPremio, playBallDrawSound } from './effects.js';

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
let premioEmExibicao = false; // Flag: true when prize popup is showing (pause auto-draw)
let winnersJaExibidos = { quadra: [], quina: [], bingo: [], acumulado: [] }; // Track which winners have been announced
let filaAnuncios = []; // Fila de anúncios de ganhadores pendentes
let ultimoGameId = null;
let isFirstRender = true; // Controla se é o primeiro carregamento da tela do jogo

// Rastreamento local de heartbeat recebido para evitar problemas com clock drift entre dispositivos
let ultimoHeartbeatRecebidoValor = 0;
let ultimoHeartbeatRecebidoLocalTimestamp = 0;

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
  try {
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
        
        if (currentBallNum) {
          currentBallNum.innerText = textoTime;
          currentBallNum.style.fontSize = '34px'; // Tamanho menor para caber "MM:SS"
        }
        
        if (panelHeaderCentered) {
          panelHeaderCentered.innerText = "PRÓXIMA RODADA";
          panelHeaderCentered.style.color = "var(--neon-cyan)";
        }
        
        // Define cor amarela para a contagem regressiva
        if (giantBall) {
          giantBall.className = 'giant-ball-3d ball-color-6';
        }
        return;
      }
    }
    
    // Se não houver contagem regressiva agendada
    if (currentBallNum) {
      currentBallNum.innerText = 'BINGO';
      currentBallNum.style.fontSize = '34px';
    }
    if (giantBall) {
      giantBall.className = 'giant-ball-3d';
    }
    
    if (panelHeaderCentered) {
      panelHeaderCentered.innerText = "AGUARDANDO SORTEIO";
      panelHeaderCentered.style.color = "var(--neon-pink)";
    }
  } catch (e) {
    console.warn('Erro ao atualizar contagem regressiva local:', e);
  }
}

function atualizarPainelProximaRodada() {
  try {
    if (!estadoGlobal) return;

    // 1. Determina o ID do próximo sorteio
    let proximoId = estadoGlobal.nextGameId || "--";
    if (estadoGlobal.rodadasQueue && estadoGlobal.rodadasQueue.length > 0) {
      proximoId = estadoGlobal.rodadasQueue[0].gameId || "--";
    }
    
    if (tvNextRoundId) {
      tvNextRoundId.innerText = `SORTEIO ${proximoId}`;
    }

    // 2. Determina o texto e o tempo da contagem regressiva
    if (tvNextRoundCountdown) {
      const status = estadoGlobal.status || 'WAITING';
      if (status === 'WAITING') {
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
      } else if (status === 'PLAYING') {
        tvNextRoundCountdown.innerText = "SORTEIO EM ANDAMENTO";
        tvNextRoundCountdown.style.color = "var(--warning)";
      } else if (status === 'ENDED') {
        if (estadoGlobal.rodadasQueue && estadoGlobal.rodadasQueue.length > 0) {
          tvNextRoundCountdown.innerText = "INICIANDO PRÓXIMO...";
          tvNextRoundCountdown.style.color = "var(--success)";
        } else {
          tvNextRoundCountdown.innerText = "SORTEIO FINALIZADO";
          tvNextRoundCountdown.style.color = "var(--text-muted)";
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao atualizar painel da proxima rodada:', e);
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
  try {
    if (!estado) return;

    // Auto-limpeza de rodada antiga/bugada
    const estadoLimpo = verificarELimparEstadoSeAntigo(estado);
    if (estadoLimpo) {
      console.log(`[TV] Rodada antiga detectada. Salvando novo estado...`);
      FirebaseHelper.salvarEstadoJogo(estadoLimpo);
      return;
    }

    estadoGlobal = estado;

    // Rastreamento de heartbeat local (anti-clock-drift)
    if (estado.engineHeartbeat && estado.engineHeartbeat !== ultimoHeartbeatRecebidoValor) {
      ultimoHeartbeatRecebidoValor = estado.engineHeartbeat;
      ultimoHeartbeatRecebidoLocalTimestamp = Date.now();
    }

    // Defesas e Fallbacks Robustos
    const status = estado.status || 'WAITING';
    const gameId = estado.gameId || '--';
    const nextGameId = estado.nextGameId || '--';
    const dataSorteio = estado.dataSorteio || new Date().toLocaleDateString('pt-BR');
    const drawnBalls = Array.isArray(estado.drawnBalls) ? estado.drawnBalls : [];
    const cards = Array.isArray(estado.cards) ? estado.cards : [];
    
    const prizes = estado.prizes || {};
    const prizeQuadra = typeof prizes.quadra === 'number' ? prizes.quadra : 0;
    const prizeQuina = typeof prizes.quina === 'number' ? prizes.quina : 0;
    const prizeBingo = typeof prizes.bingo === 'number' ? prizes.bingo : 0;
    const prizeAcumulado = typeof prizes.acumulado === 'number' ? prizes.acumulado : 0;
    const prizeCupom = typeof prizes.cupom === 'number' ? prizes.cupom : 0;

    const winners = estado.winners || {};
    const winnersQuadra = Array.isArray(winners.quadra) ? winners.quadra : [];
    const winnersQuina = Array.isArray(winners.quina) ? winners.quina : [];
    const winnersBingo = Array.isArray(winners.bingo) ? winners.bingo : [];
    const winnersAcumulado = Array.isArray(winners.acumulado) ? winners.acumulado : [];

    const bottomPanelSettings = estado.bottomPanelSettings || {
      type: "PROXIMO_PREMIO",
      title: "PRÓXIMO PRÊMIO",
      text: "Sorteio hoje às 20h! Compre sua cartela nos pontos credenciados."
    };

    // Se mudou de rodada (gameId diferente), ou se está em WAITING, limpa cache de exibição e fila de anúncios
    if (ultimoGameId !== gameId || status === 'WAITING') {
      if (ultimoGameId !== gameId) {
        console.log(`[TV] Novo ID de jogo detectado: ${gameId}. Resetando rastreamento de ganhadores e popups.`);
        ultimoGameId = gameId;
        isFirstRender = true; // Novo jogo conta como primeiro render para não anunciar prêmios antigos caso entre atrasado
      }
      premioEmExibicao = false;
      filaAnuncios = [];
      winnersJaExibidos = { quadra: [], quina: [], bingo: [], acumulado: [] };
      const overlay = document.getElementById('tv-winner-overlay');
      if (overlay) {
        overlay.classList.remove('active');
      }
    }

    // 1. Atualizar valores das premiações e sorteio (Sidebar Esquerda)
    if (valQuadra) valQuadra.innerText = `R$ ${prizeQuadra.toFixed(2).replace('.', ',')}`;
    if (valQuina) valQuina.innerText = `R$ ${prizeQuina.toFixed(2).replace('.', ',')}`;
    if (valBingo) valBingo.innerText = `R$ ${prizeBingo.toFixed(2).replace('.', ',')}`;
    
    const acumuladoFormatado = `R$ ${prizeAcumulado.toFixed(2).replace('.', ',')}`;
    if (valAcumuladoLeft) valAcumuladoLeft.innerText = acumuladoFormatado;
    if (jackpotValue) jackpotValue.innerText = acumuladoFormatado;
    
    if (valSorteio) valSorteio.innerText = gameId;
    if (valCupom) valCupom.innerText = `R$ ${prizeCupom.toFixed(2).replace('.', ',')}`;
    
    if (valData) {
      valData.innerText = dataSorteio;
    }

    // 2. Tabuleiro de 1-90 e Ordem do Sorteio
    if (orderCounter) {
      orderCounter.innerText = `ORDEM ${drawnBalls.length.toString().padStart(2, '0')}`;
    }
    
    // Atualiza as classes de cada célula do tabuleiro
    for (let i = 1; i <= 90; i++) {
      const cell = document.getElementById(`num-cell-${i}`);
      if (cell) {
        cell.className = 'board-num'; // Limpa classes
        
        if (drawnBalls.includes(i)) {
          cell.classList.add('drawn');
        }
        
        // Destaca o último sorteado (se houver)
        if (drawnBalls.length > 0 && drawnBalls[drawnBalls.length - 1] === i) {
          cell.classList.add('latest-drawn');
        }
      }
    }

    // 3. Bola Atual (Globo Gigante) ou Contagem Regressiva
    const panelHeaderCentered = document.querySelector('.panel-header-centered');
    
    if (status === 'WAITING') {
      try {
        atualizarContagemRegressivaLocal();
      } catch (ce) {
        console.warn('Erro ao atualizar contagem regressiva:', ce);
      }
    } else if (status === 'ENDED') {
      if (panelHeaderCentered) {
        panelHeaderCentered.innerText = "RODADA ENCERRADA";
        panelHeaderCentered.style.color = "var(--neon-pink)";
      }
      if (currentBallNum) {
        currentBallNum.innerText = 'BINGO';
        currentBallNum.style.fontSize = '34px';
      }
      if (giantBall) {
        giantBall.className = 'giant-ball-3d ball-color-6';
      }
      ultimoNumeroRenderizado = null;
    } else {
      // Restaura o cabeçalho original
      if (panelHeaderCentered) {
        panelHeaderCentered.innerText = "BOLA ATUAL";
        panelHeaderCentered.style.color = "var(--neon-cyan)";
      }

      if (drawnBalls.length > 0) {
        const atual = drawnBalls[drawnBalls.length - 1];
        if (currentBallNum) {
          currentBallNum.innerText = atual.toString().padStart(2, '0');
          currentBallNum.style.fontSize = '64px'; // Restaura tamanho da fonte
        }
        
        // Define a cor da bola gigante
        if (giantBall) {
          giantBall.className = 'giant-ball-3d'; // Limpa cores
          giantBall.classList.add(obterClasseCorBola(atual));

          // Aciona animação de pulso se for uma bola nova
          if (ultimoNumeroRenderizado !== atual) {
            giantBall.classList.remove('drawn-pulse');
            // Força reflow para reiniciar animação
            void giantBall.offsetWidth;
            giantBall.classList.add('drawn-pulse');
            ultimoNumeroRenderizado = atual;
            // Narração e som da bola
            try {
              playBallDrawSound();
            } catch (se) {
              console.warn('Erro ao tocar som da bola:', se);
            }
            try {
              narrarBola(atual);
            } catch (ne) {
              console.warn('Erro ao narrar bola:', ne);
            }
          }
        }
      } else {
        if (currentBallNum) {
          currentBallNum.innerText = '--';
          currentBallNum.style.fontSize = '64px';
        }
        if (giantBall) {
          giantBall.className = 'giant-ball-3d';
        }
        ultimoNumeroRenderizado = null;
      }
    }

    // 4. Últimas 4 Bolas Sorteadas (Vertical - Sidebar Esquerda)
    // Mostra as bolas sorteadas da penúltima para trás (excluindo a atual)
    const historicoVertical = drawnBalls.slice(0, -1).reverse().slice(0, 4);
    if (verticalBallsList) {
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
    }

    // 5. Últimas 3 Bolas Sorteada (Abaixo da bola atual - Cronologia recente)
    const historico3Central = drawnBalls.slice(0, -1).reverse().slice(0, 3);
    if (lastThreeBallsRow) {
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
    }

    // 6. Linha do Tempo (Últimas 5 Sorteadas horizontal)
    const historicoHorizontal = drawnBalls.slice(-5);
    if (horizontalBallsRow) {
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
    }

    // 7. Rankings de Cartelas (Top 20)
    let ranking = [];
    try {
      ranking = obterRankingTop20(cards);
    } catch (re) {
      console.warn('Erro ao obter ranking top 20:', re);
    }
    
    if (rankingTbody) {
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
    }

    // 8. Painel Informativo Inferior Direito
    // Prioridade: Se houver vencedores ativados no sorteio atual, exibe o alerta de vencedor
    if (bottomInfoContent) {
      if (status === "ENDED" && winnersBingo.length > 0) {
        const ultimoBingo = winnersBingo[winnersBingo.length - 1];
        
        // Verifica se ganhou o acumulado também
        const ganhouAcumulado = winnersAcumulado.some(w => w.cardId === ultimoBingo.cardId);
        
        bottomInfoContent.innerHTML = `
          <div class="info-content-title winner-alert-title">🔥 BINGO CONFIRMADO! 🔥</div>
          <div class="info-content-text winner-alert-text">
            Cartela <strong style="color:var(--neon-pink)">${ultimoBingo.cardId}</strong> venceu!<br>
            Ponto de Venda: <strong>${ultimoBingo.pdv}</strong><br>
            ${ganhouAcumulado ? '<span style="color:var(--neon-gold); font-weight:900;">⭐ LEVOU O ACUMULADO! ⭐</span>' : ''}
          </div>`;
      } else {
        // Caso contrário, exibe o painel configurado pelo Administrador
        let config = bottomPanelSettings;
        
        // Se selecionado "MINHAS CARTELAS" / estatísticas rápidas
        if (config.type === "MINHAS_CARTELAS") {
          const totalVendas = cards.length;
          bottomInfoContent.innerHTML = `
            <div class="info-content-title">ESTATÍSTICAS DE CARTELAS</div>
            <div class="info-content-text">
              Total de Cartelas em Jogo: <strong>${totalVendas}</strong><br>
              Operando em tempo real nos Pontos de Venda credenciados!
            </div>`;
        } else if (config.type === "ULTIMO_GANHADOR") {
          // Exibe o último ganhador registrado historicamente
          const todosGanham = winnersBingo;
          if (todosGanham.length > 0) {
            const ult = todosGanham[todosGanham.length - 1];
            bottomInfoContent.innerHTML = `
              <div class="info-content-title">ÚLTIMO GANHADOR</div>
              <div class="info-content-text">
                Cartela <strong>${ult.cardId}</strong> faturou o prêmio!<br>
                PDV: <strong>${ult.pdv}</strong> (Sorteio ${gameId})
              </div>`;
          } else {
            bottomInfoContent.innerHTML = `
              <div class="info-content-title">${config.title || ''}</div>
              <div class="info-content-text">${config.text || ''}</div>`;
          }
        } else {
          // PROMOÇÕES ou PRÓXIMO PRÊMIO padrão
          bottomInfoContent.innerHTML = `
            <div class="info-content-title">${config.title || ''}</div>
            <div class="info-content-text">${config.text || ''}</div>`;
        }
      }
    }

    // 9. Detecção de Prêmios via Estado (funciona mesmo sem BroadcastChannel)
    // Compara os winners atuais com os já exibidos para detectar novos prêmios
    if (status === 'PLAYING' || status === 'ENDED') {
      ['quadra', 'quina', 'bingo', 'acumulado'].forEach(cat => {
        const listaAtual = Array.isArray(winners[cat]) ? winners[cat] : [];
        listaAtual.forEach(w => {
          if (w && w.cardId) {
            if (!winnersJaExibidos[cat]) {
              winnersJaExibidos[cat] = [];
            }
            if (isFirstRender) {
              // No primeiro render do jogo, apenas preenche o cache de exibidos sem disparar o popup
              if (!winnersJaExibidos[cat].includes(w.cardId)) {
                winnersJaExibidos[cat].push(w.cardId);
              }
            } else {
              // Somente anuncia se a ordemSorteio do prêmio for igual ou muito próxima à quantidade de bolas sorteadas
              // Isso garante que não anunciemos prêmios de bolas muito antigas se o sinal oscilar ou a página recarregar
              const diferencaBolas = Math.abs(drawnBalls.length - w.ordemSorteio);
              if (diferencaBolas <= 1) {
                adicionarFilaAnuncio({ 
                  categoria: cat, 
                  cardId: w.cardId, 
                  pdv: w.pdv, 
                  valorPremio: w.premioGanho 
                });
              }
            }
          }
        });
      });
      isFirstRender = false;
    }

    // Reset winners tracking quando muda de rodada
    if (status === 'WAITING') {
      winnersJaExibidos = { quadra: [], quina: [], bingo: [], acumulado: [] };
      filaAnuncios = [];
      isFirstRender = true;
    }
  } catch (error) {
    console.error("Erro fatal ao renderizar o aplicativo de TV:", error);
  }
}

// Inscreve a TV para escutar atualizações de estado em tempo real
const unsubscribe = FirebaseHelper.assinarEstadoJogo(renderizarApp);

// Gerenciador de fila de anúncios de prêmios para evitar sobreposição ou perda
function adicionarFilaAnuncio(payload) {
  const { categoria, cardId } = payload;
  const cat = categoria.toLowerCase();
  
  if (!winnersJaExibidos[cat]) {
    winnersJaExibidos[cat] = [];
  }
  
  // Evita adicionar duplicado se já foi exibido ou está na fila
  if (winnersJaExibidos[cat].includes(cardId)) {
    return;
  }
  
  winnersJaExibidos[cat].push(cardId);
  filaAnuncios.push(payload);
  
  verificarProximoAnuncio();
}

function verificarProximoAnuncio() {
  if (premioEmExibicao || filaAnuncios.length === 0) {
    return;
  }
  
  const proximo = filaAnuncios.shift();
  mostrarAnuncioGanhadorGigante(proximo);
}

// Função para exibir o anúncio gigante de ganhador na tela com fogos e som
function mostrarAnuncioGanhadorGigante(payload) {
  try {
    if (!payload || !payload.categoria) {
      console.warn("[BROADCAST] Payload inválido no anúncio de ganhador:", payload);
      premioEmExibicao = false;
      verificarProximoAnuncio();
      return;
    }

    const { categoria, cardId, pdv, valorPremio } = payload;
    const catSafe = (categoria || '').toLowerCase();
    const rodadaId = (estadoGlobal && estadoGlobal.gameId) ? estadoGlobal.gameId : '--';

    // Marca que está em exibição de prêmio (pausa o auto-draw)
    premioEmExibicao = true;

    // Dispara os efeitos sonoros de forma totalmente isolada para que falhas de áudio não interrompam o fluxo
    try {
      playSirenSound();
    } catch (e) {
      console.warn("Erro ao reproduzir playSirenSound:", e);
    }
    
    setTimeout(() => {
      try {
        playCelebrationHorn();
      } catch (e) {
        console.warn("Erro ao reproduzir playCelebrationHorn:", e);
      }
    }, 500);
    
    setTimeout(() => {
      try {
        playApplauseSound();
      } catch (e) {
        console.warn("Erro ao reproduzir playApplauseSound:", e);
      }
    }, 1000);
    
    // Narração do prêmio
    setTimeout(() => {
      try {
        narrarPremio(categoria, cardId, pdv);
      } catch (e) {
        console.warn("Erro ao narrar o prêmio:", e);
      }
    }, 1500);

    // Lança fogos de artifício por 10 segundos
    try {
      launchFireworks(10000);
    } catch (e) {
      console.warn("Erro ao lançar fogos de artifício:", e);
    }

    // Nomes amigáveis das premiações
    const nomesPremios = {
      quadra: 'SAIU QUADRA!',
      quina: 'SAIU QUINA!',
      bingo: 'GANHADOR DO BINGO!',
      acumulado: 'ACUMULADO SAÍDO!'
    };
    const premioTexto = nomesPremios[catSafe] || 'PRÊMIO SAÍDO!';

    // Valores dos prêmios
    const valoresPremios = (estadoGlobal && estadoGlobal.prizes) ? {
      quadra: estadoGlobal.prizes.quadra,
      quina: estadoGlobal.prizes.quina,
      bingo: estadoGlobal.prizes.bingo,
      acumulado: estadoGlobal.prizes.acumulado
    } : {};
    const valorFinal = typeof valorPremio === 'number' ? valorPremio : (valoresPremios[catSafe] || 0);

    // Cria elemento do overlay se não existir
    let overlay = document.getElementById('tv-winner-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tv-winner-overlay';
      overlay.className = 'winner-overlay';
      document.body.appendChild(overlay);
    }

    // Preenche o HTML com visual de luxo premium
    overlay.innerHTML = `
      <div class="winner-card-container cat-${catSafe}">
        <div class="winner-sparkle-bg"></div>
        <div class="winner-title">🏆 Prêmio Confirmado 🏆</div>
        <div class="winner-prize-name">${premioTexto}</div>
        ${valorFinal > 0 ? `<div class="winner-prize-value">R$ ${valorFinal.toFixed(2).replace('.', ',')}</div>` : ''}
        <div class="winner-meta-label" style="font-size: 14px; margin-bottom: 8px; letter-spacing: 3px;">CARTELA VENCEDORA</div>
        <div class="winner-card-serial">${cardId || '--'}</div>
        
        <div class="winner-meta-grid">
          <div class="winner-meta-item">
            <div class="winner-meta-label">Ponto de Venda (BAR/PDV)</div>
            <div class="winner-meta-value pdv-glow">${pdv || '--'}</div>
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
      try {
        overlay.classList.add('active');
      } catch (e) {}
    }, 50);

    // Mantém na tela por 10 segundos, depois remove e retoma
    setTimeout(() => {
      try {
        overlay.classList.remove('active');
      } catch (e) {}
      // Libera a flag de pausa após a animação de saída
      setTimeout(() => {
        premioEmExibicao = false;
        // Procura o próximo anúncio da fila
        verificarProximoAnuncio();
      }, 500);
    }, 10000);
    
  } catch (error) {
    console.error("Erro crítico em mostrarAnuncioGanhadorGigante:", error);
    // Em caso de erro crítico, garante que a flag seja redefinida e a fila continue rodando
    premioEmExibicao = false;
    setTimeout(() => {
      verificarProximoAnuncio();
    }, 500);
  }
}

// Escuta por comandos diretos do Admin
FirebaseHelper.assinarComandos((comando, payload) => {
  if (comando === 'NOVO_GANHADOR') {
    console.log("Novo ganhador detectado no sorteio:", payload);
    adicionarFilaAnuncio(payload);
  }
});

// Enable audio context on first user interaction (required by browsers) and handle voice button
const btnToggleVoice = document.getElementById('btn-toggle-voice');
const tvVoiceStatusText = document.getElementById('tv-voice-status-text');

let vozMuda = localStorage.getItem('bingokrs_mudo_voz') === 'true';

function atualizarBotaoVoz() {
  if (btnToggleVoice && tvVoiceStatusText) {
    if (vozMuda) {
      btnToggleVoice.style.borderColor = 'var(--neon-pink)';
      btnToggleVoice.style.textShadow = '0 0 5px var(--neon-pink)';
      tvVoiceStatusText.innerText = 'SOM MUTADO';
      const iconSpan = btnToggleVoice.querySelector('span:first-child');
      if (iconSpan) iconSpan.innerText = '🔇';
    } else {
      btnToggleVoice.style.borderColor = 'var(--neon-cyan)';
      btnToggleVoice.style.textShadow = '0 0 5px var(--neon-cyan)';
      tvVoiceStatusText.innerText = 'SOM ATIVO';
      const iconSpan = btnToggleVoice.querySelector('span:first-child');
      if (iconSpan) iconSpan.innerText = '🔊';
    }
  }
}

if (btnToggleVoice) {
  btnToggleVoice.addEventListener('click', (e) => {
    e.stopPropagation(); // Evita ativar listener de clique geral abaixo
    vozMuda = !vozMuda;
    localStorage.setItem('bingokrs_mudo_voz', vozMuda ? 'true' : 'false');
    atualizarBotaoVoz();
  });
  atualizarBotaoVoz();
}

document.addEventListener('click', () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
  } catch(e) {}
}, { once: true });

// Recarrega a página automaticamente se a internet cair e voltar, garantindo recuperação em TVs
window.addEventListener('online', () => {
  console.log('[TV] Conexão restabelecida. Recarregando a página para garantir sincronia...');
  window.location.reload();
});

// ==========================================
// FALLBACK GAME ENGINE (MOTOR DE BACKUP NA TV)
// ==========================================
const myEngineClientId = 'tv_' + Math.random().toString(36).substring(2, 9);
let ultimaBolaSorteadaPelaTvTimestamp = 0;
let ultimoAvancoAutomaticaPelaTvTimestamp = 0;

async function executarPassoDeJogoTransacional(mutatorFn) {
  try {
    await FirebaseHelper.executarTransacaoJogo(async (draft) => {
      const resultado = await mutatorFn(draft);
      if (resultado) {
        // Assume o controle do heartbeat e ID do motor
        resultado.engineHeartbeat = Date.now();
        resultado.engineClientId = myEngineClientId;
        resultado.engineType = 'tv';
        return resultado;
      }
      return null;
    });
  } catch (e) {
    console.error("[TV-ENGINE] Erro na transação do motor:", e);
  }
}

setInterval(async () => {
  if (!estadoGlobal) return;

  const agora = Date.now();
  const status = estadoGlobal.status || 'WAITING';

  // Verifica se o motor principal (Admin) está ativo (anti-clock-drift usando recebimento local)
  const heartbeatAdminAtivo = 
    estadoGlobal.engineType === 'admin' && 
    (agora - ultimoHeartbeatRecebidoLocalTimestamp < 12000);

  // Se o admin está ativo, a TV não interfere e reseta contadores de backup
  if (heartbeatAdminAtivo) {
    return;
  }

  // Se o admin está offline, a TV assume a responsabilidade de manter o status de heartbeat atualizado
  // se ela já for o motor ativo ou estiver executando ações
  const souOMotorAtivo = estadoGlobal.engineClientId === myEngineClientId;

  if (souOMotorAtivo) {
    // Atualiza heartbeat a cada 3 segundos
    if (agora - (estadoGlobal.engineHeartbeat || 0) >= 3000) {
      await FirebaseHelper.enviarHeartbeat(myEngineClientId, 'tv');
    }
  }

  // 1. Caso 1: Jogo está em WAITING e o countdown expirou
  if (status === 'WAITING' && estadoGlobal.countdownEndTime) {
    const tempoRestante = Math.round((estadoGlobal.countdownEndTime - agora) / 1000);
    
    // Se a contagem regressiva terminou há mais de 3 segundos (margem de segurança)
    if (tempoRestante <= -3) {
      const motorAtivoRecente = (agora - ultimoHeartbeatRecebidoLocalTimestamp < 8000);
      
      if (!motorAtivoRecente || souOMotorAtivo) {
        console.log("[TV-ENGINE] Admin offline e contagem zerada. Iniciando sorteio automaticamente!");
        
        await executarPassoDeJogoTransacional(async (draft) => {
          if (draft.status !== 'WAITING') return null;
          
          draft.countdownEndTime = null;
          draft.aiActive = false;
          
          // Se não tiver cartelas no jogo, avança para a próxima
          if (!draft.cards || draft.cards.length === 0) {
            console.warn("[TV-ENGINE] Nenhuma cartela ativa na rodada. Pulando...");
            return avancarProximaRodada(draft);
          }
          
          return sortearProximaBola(draft);
        });
      }
    }
  }

  // 2. Caso 2: Jogo em PLAYING (sorteio automático de bolas)
  if (status === 'PLAYING' && estadoGlobal.ballsLeft && estadoGlobal.ballsLeft.length > 0) {
    const motorAtivoRecente = (agora - ultimoHeartbeatRecebidoLocalTimestamp < 8000);
    
    if (!motorAtivoRecente || souOMotorAtivo) {
      if (!premioEmExibicao) {
        const drawInterval = (estadoGlobal.drawSpeed || 3) * 1000;
        const tempoDesdeUltimoSorteio = agora - ultimaBolaSorteadaPelaTvTimestamp;
        const delayNecessario = souOMotorAtivo ? drawInterval : (drawInterval + 3000);

        if (tempoDesdeUltimoSorteio >= delayNecessario) {
          ultimaBolaSorteadaPelaTvTimestamp = agora;
          console.log("[TV-ENGINE] Sorteando próxima bola...");
          
          await executarPassoDeJogoTransacional(async (draft) => {
            if (draft.status !== 'PLAYING' || !draft.ballsLeft || draft.ballsLeft.length === 0) return null;
            return sortearProximaBola(draft);
          });
        }
      }
    }
  }

  // 3. Caso 3: Jogo em ENDED (avançar para a próxima rodada após 15 segundos)
  if (status === 'ENDED') {
    const motorAtivoRecente = (agora - ultimoHeartbeatRecebidoLocalTimestamp < 8000);
    
    if (!motorAtivoRecente || souOMotorAtivo) {
      if (ultimoAvancoAutomaticaPelaTvTimestamp === 0) {
        ultimoAvancoAutomaticaPelaTvTimestamp = agora;
      } else if (agora - ultimoAvancoAutomaticaPelaTvTimestamp >= 18000) { // 18s (15s padrão + 3s margem)
        ultimoAvancoAutomaticaPelaTvTimestamp = 0;
        console.log("[TV-ENGINE] Avançando/limpando rodada finalizada...");
        
        await executarPassoDeJogoTransacional(async (draft) => {
          if (draft.status !== 'ENDED') return null;
          return avancarProximaRodada(draft);
        });
      }
    }
  } else {
    ultimoAvancoAutomaticaPelaTvTimestamp = 0;
  }
}, 1000);
