/**
 * BINGOKRS - Motor de Jogo e Regras de Negócio
 * 
 * Contém a lógica de:
 * 1. Geração de Cartelas oficiais de 90 bolas (3x9, 15 números, ordenadas por coluna).
 * 2. Controle do Estado Geral do Jogo (sorteadas, prêmios, configurações).
 * 3. Classificação em tempo real (ranking Top 20 por bolas restantes).
 * 4. Validação de ganhadores de Quadra, Quina, Bingo e Acumulado.
 */

import { FirebaseHelper } from './firebase-helper.js';

// Constantes
export const MAX_BALLS = 90;
export const ACUMULADO_LIMITE_ORDEM = 44; // Ganha acumulado se fechar bingo até a bola 44

/**
 * Cria o estado inicial padrão do jogo
 */
export function criarEstadoInicial() {
  return {
    gameId: "#0001",
    nextGameId: "#0002",
    status: "WAITING", // WAITING, PLAYING, ENDED
    drawnBalls: [], // Sequência de bolas já sorteadas (1..90)
    ballsLeft: Array.from({ length: MAX_BALLS }, (_, i) => i + 1), // Bolas ainda no globo
    cards: [], // Lista de cartelas cadastradas no sorteio ATUAL
    nextCards: [], // Lista de cartelas compradas para o PRÓXIMO sorteio
    countdownEndTime: null, // Timestamp do fim da contagem regressiva
    schedulingMode: "MANUAL", // MANUAL, IA
    aiActive: false, // Se o piloto automático da IA está ativo
    rodadasQueue: [], // Fila de rodadas programadas
    forcedPdvWinner: "NENHUM", // PDV alvo para ganhar o prêmio principal
    forcedCardId: null, // Cartela específica selecionada para ganhar
    forcedRiggingProbability: 75, // Probabilidade de manipulação (0 a 100)
    autoStartDraw: false, // Iniciar sorteio automático ao fim da contagem
    drawSpeed: 3, // Velocidade do auto sorteio em segundos
    prizes: {
      quadra: 50.00,
      quina: 100.00,
      bingo: 250.00,
      acumulado: 1000.00,
      cupom: 2.00
    },
    winners: {
      quadra: [], // Array de { cardId, pdv, ordemSorteio }
      quina: [],
      bingo: [],
      acumulado: []
    },
    bottomPanelSettings: {
      type: "PROXIMO_PREMIO", // PROMOCOES, PROXIMO_PREMIO, ULTIMO_GANHADOR, MINHAS_CARTELAS
      title: "PRÓXIMO PRÊMIO",
      text: "Sorteio hoje às 20h! Compre sua cartela nos pontos credenciados."
    },
    dataSorteio: new Date().toLocaleDateString('pt-BR'),
    horaInicio: ""
  };
}

/**
 * Gera um ID único de cartela de 6 caracteres (alfanumérico legível, sem O, 0, I, 1 para evitar confusão)
 */
export function gerarCodigoCartela() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Gera uma cartela oficial de 90 bolas no formato 3 linhas x 9 colunas.
 * Regras Oficiais:
 * - 15 números no total por cartela.
 * - Exatamente 5 números por linha.
 * - Cada coluna tem de 1 a 3 números.
 * - Números são distribuídos por coluna:
 *   Col 0: 1-9 | Col 1: 10-19 | Col 2: 20-29 ... Col 8: 80-90.
 * - Em cada coluna, os números são organizados em ordem crescente de cima para baixo.
 */
export function gerarCartela90Bolas(pdvNome = "PDV Padrão", gameIdDestino = "#0001") {
  const cardId = gerarCodigoCartela();
  let grid = null;
  let numbersList = [];

  // Loop de tentativa caso a distribuição falhe
  let tentativas = 0;
  while (tentativas < 1000) {
    grid = tentarCriarGrid();
    if (grid) break;
    tentativas++;
  }

  if (!grid) {
    throw new Error("Erro de algoritmo: Não foi possível gerar uma cartela de bingo válida.");
  }

  // Extrai a lista plana de 15 números
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== null) {
        numbersList.push(grid[r][c]);
      }
    }
  }

  return {
    id: cardId,
    pdv: pdvNome,
    gameId: gameIdDestino, // ID do sorteio associado
    numbers: numbersList, // Lista de 15 números
    grid: grid, // Array 2D [3][9] contendo números e nulls
    drawnCount: 0,
    numbersRemaining: 15,
    missingNumbers: [...numbersList]
  };
}

/**
 * Tenta gerar o grid 3x9 respeitando todas as regras.
 * Retorna o grid [3][9] ou null se falhar.
 */
function tentarCriarGrid() {
  // 1. Definir tamanhos de colunas (deve somar 15)
  // Cada uma das 9 colunas deve ter pelo menos 1 número.
  const colSizes = Array(9).fill(1);
  let extraSlots = 6; // Para somar 15 (9 + 6)
  
  while (extraSlots > 0) {
    const randomCol = Math.floor(Math.random() * 9);
    if (colSizes[randomCol] < 3) {
      colSizes[randomCol]++;
      extraSlots--;
    }
  }

  // 2. Escolher números para cada coluna de acordo com sua faixa correspondente
  const colNumbers = [];
  for (let c = 0; c < 9; c++) {
    let min = c * 10;
    let max = c * 10 + 9;
    if (c === 0) min = 1; // Col 0 é 1-9
    if (c === 8) max = 90; // Col 8 é 80-90 (inclui 90)

    // Lista de números disponíveis na faixa
    const pool = [];
    for (let num = min; num <= max; num++) {
      pool.push(num);
    }

    // Seleciona k números aleatórios da faixa
    const k = colSizes[c];
    const selected = [];
    for (let i = 0; i < k; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(idx, 1)[0]);
    }
    // Ordena de forma crescente
    selected.sort((a, b) => a - b);
    colNumbers.push(selected);
  }

  // 3. Alocar os números nas linhas de forma que cada linha tenha exatamente 5 números
  // Usaremos um resolvedor recursivo simples (backtracking)
  const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
  const rowCounts = [0, 0, 0];

  function resolver(colIdx) {
    if (colIdx === 9) {
      // Condição de sucesso: todas as linhas têm exatamente 5 números
      return rowCounts[0] === 5 && rowCounts[1] === 5 && rowCounts[2] === 5;
    }

    const nums = colNumbers[colIdx];
    const k = nums.length;

    // Dependendo do tamanho da coluna, temos combinações de linhas
    let combinacoesLinhas = [];
    if (k === 3) {
      combinacoesLinhas = [[0, 1, 2]];
    } else if (k === 2) {
      combinacoesLinhas = [[0, 1], [0, 2], [1, 2]];
    } else if (k === 1) {
      combinacoesLinhas = [[0], [1], [2]];
    }

    // Embaralha as combinações para adicionar variação
    combinacoesLinhas.sort(() => Math.random() - 0.5);

    for (const combo of combinacoesLinhas) {
      // Valida se cabe na linha
      let cabe = true;
      for (const r of combo) {
        if (rowCounts[r] + 1 > 5) {
          cabe = false;
          break;
        }
      }

      if (!cabe) continue;

      // Aloca temporariamente no grid
      for (let i = 0; i < k; i++) {
        const r = combo[i];
        grid[r][colIdx] = nums[i];
        rowCounts[r]++;
      }

      // Avança para a próxima coluna
      if (resolver(colIdx + 1)) {
        return true;
      }

      // Desfaz alocação (backtrack)
      for (let i = 0; i < k; i++) {
        const r = combo[i];
        grid[r][colIdx] = null;
        rowCounts[r]--;
      }
    }

    return false;
  }

  if (resolver(0)) {
    return grid;
  }
  return null;
}

/**
 * Avança o jogo para a próxima rodada importando as cartelas vendidas antecipadamente
 */
export function avancarProximaRodada(estado) {
  // Se houver uma rodada agendada na fila
  let proximaConfig = null;
  if (estado.rodadasQueue && estado.rodadasQueue.length > 0) {
    proximaConfig = estado.rodadasQueue.shift();
  }

  if (proximaConfig) {
    estado.gameId = proximaConfig.gameId;
    estado.prizes = { ...proximaConfig.prizes };
    estado.schedulingMode = proximaConfig.schedulingMode || "MANUAL";
    estado.forcedPdvWinner = proximaConfig.forcedPdvWinner || "NENHUM";
    estado.forcedRiggingProbability = proximaConfig.forcedRiggingProbability !== undefined ? proximaConfig.forcedRiggingProbability : 75;
    estado.autoStartDraw = proximaConfig.autoStartDraw || false;
    estado.drawSpeed = proximaConfig.drawSpeed || 3;
    estado.forcedCardId = null; // Reseta cartela manipulada para escolher uma nova no início do sorteio

    if (proximaConfig.countdownMinutes) {
      estado.countdownEndTime = Date.now() + proximaConfig.countdownMinutes * 60 * 1000;
      estado.aiActive = (proximaConfig.schedulingMode === 'IA');
    } else {
      estado.countdownEndTime = null;
      estado.aiActive = false;
    }
  } else {
    // Passa o ID atual para o ID do próximo sorteio (comportamento padrão)
    estado.gameId = estado.nextGameId;
    estado.countdownEndTime = null;
    estado.aiActive = false;
    estado.forcedPdvWinner = "NENHUM";
    estado.forcedCardId = null;
    estado.forcedRiggingProbability = 75;
    estado.autoStartDraw = false;
    estado.drawSpeed = 3;
  }

  // Calcula o ID subsequente (ex: #0002 -> #0003)
  const numId = parseInt(estado.gameId.replace('#', '')) || 0;
  estado.nextGameId = '#' + (numId + 1).toString().padStart(4, '0');

  // Transfere as cartelas reservadas para a rodada atual
  estado.cards = (estado.nextCards || []).map(card => ({
    ...card,
    gameId: estado.gameId // Corrige o ID do sorteio associado
  }));

  // Limpa as próximas cartelas
  estado.nextCards = [];

  // Reseta globo de sorteio e bolas sorteadas
  estado.drawnBalls = [];
  estado.ballsLeft = Array.from({ length: MAX_BALLS }, (_, i) => i + 1);

  // Limpa ganhadores
  estado.winners = {
    quadra: [],
    quina: [],
    bingo: [],
    acumulado: []
  };

  // Retorna para o status inicial de aguardando
  estado.status = "WAITING";
  estado.horaInicio = "";

  return estado;
}

/**
 * Atualiza o progresso de acerto de cada cartela baseado nas bolas sorteadas
 * e recalcula o ranking das 20 melhores cartelas (com menos números restantes).
 * Também verifica se há novos vencedores para cada categoria.
 */
export function processarEstadoJogo(estado) {
  const sorteadas = estado.drawnBalls;
  const ordem = sorteadas.length;
  let alguemBateuBingo = false;

  // 1. Atualizar informações de acerto para cada cartela
  estado.cards.forEach(card => {
    card.missingNumbers = card.numbers.filter(num => !sorteadas.includes(num));
    card.numbersRemaining = card.missingNumbers.length;
    card.drawnCount = 15 - card.numbersRemaining;

    // Verificar vencedores (apenas se o jogo estiver rolando)
    if (estado.status === "PLAYING") {
      // BINGO/KENO: 15 acertos (restam 0)
      if (card.numbersRemaining === 0) {
        adicionarVencedor(estado, 'bingo', card.id, card.pdv, ordem);
        // Se fechou até a bola 44, ganha Acumulado
        if (ordem <= ACUMULADO_LIMITE_ORDEM) {
          adicionarVencedor(estado, 'acumulado', card.id, card.pdv, ordem);
        }
        alguemBateuBingo = true;
      }
      
      // QUINA: 5 acertos
      if (card.drawnCount >= 5) {
        adicionarVencedor(estado, 'quina', card.id, card.pdv, ordem);
      }
      
      // QUADRA: 4 acertos
      if (card.drawnCount >= 4) {
        adicionarVencedor(estado, 'quadra', card.id, card.pdv, ordem);
      }
    }
  });

  // Encerra a rodada imediatamente quando o último prêmio (BINGO) for conquistado
  if (alguemBateuBingo) {
    estado.status = "ENDED";
  }

  return estado;
}

/**
 * Adiciona uma cartela à lista de ganhadores se ela já não estiver lá
 */
function adicionarVencedor(estado, categoria, cardId, pdv, ordem) {
  const lista = estado.winners[categoria];
  const jaGanhou = lista.some(w => w.cardId === cardId);
  if (!jaGanhou) {
    lista.push({
      cardId,
      pdv,
      ordemSorteio: ordem
    });
    
    // Registra o prêmio pago nas métricas acumuladoras do banco
    const valorPremio = (estado.prizes && estado.prizes[categoria]) ? parseFloat(estado.prizes[categoria]) : 0;
    if (valorPremio > 0) {
      FirebaseHelper.registrarPremioPago(valorPremio);
    }
    
    // Dispara comando rápido para alertas sonoros/visuais na TV
    FirebaseHelper.enviarComando('NOVO_GANHADOR', { categoria, cardId, pdv, ordem });
  }
}

/**
 * Obtém o ranking das Top 20 cartelas ordenadas por proximidade de bater (menos bolas restantes)
 */
export function obterRankingTop20(cards) {
  if (!cards || cards.length === 0) return [];
  
  return [...cards]
    .sort((a, b) => {
      // Ordena por menor quantidade de números restantes
      if (a.numbersRemaining !== b.numbersRemaining) {
        return a.numbersRemaining - b.numbersRemaining;
      }
      // Se empatar, ordena por quem tem mais números marcados (mesma coisa, mas por garantia)
      // Em seguida, ordena pelo ID da cartela
      return a.id.localeCompare(b.id);
    })
    .slice(0, 20);
}

/**
 * Realiza o sorteio de uma bola aleatória
 */
export function sortearProximaBola(estado) {
  if (estado.status === "WAITING") {
    estado.status = "PLAYING";
    estado.horaInicio = new Date().toLocaleTimeString('pt-BR');

    // Seleciona uma cartela do PDV alvo se configurado para forçar vencedor
    if (estado.forcedPdvWinner && estado.forcedPdvWinner !== "NENHUM") {
      const cartelasPdv = (estado.cards || []).filter(c => c.pdv === estado.forcedPdvWinner);
      if (cartelasPdv.length > 0) {
        // Escolhe uma cartela aleatoriamente entre as vendidas por esse PDV
        const chosenCard = cartelasPdv[Math.floor(Math.random() * cartelasPdv.length)];
        estado.forcedCardId = chosenCard.id;
        console.log(`[FORÇAR VENDEDOR] Cartela selecionada para ganhar: ${estado.forcedCardId} (PDV: ${estado.forcedPdvWinner})`);
      } else {
        estado.forcedCardId = null;
        console.log(`[FORÇAR VENDEDOR] Nenhuma cartela vendida no PDV ${estado.forcedPdvWinner} para forçar.`);
      }
    } else {
      estado.forcedCardId = null;
    }
  }

  if (estado.status !== "PLAYING" || estado.ballsLeft.length === 0) {
    return estado;
  }

  let ballDrawn = null;

  // Se houver uma cartela marcada para vencer, aplica a probabilidade de manipulação
  if (estado.forcedCardId) {
    const forcedCard = (estado.cards || []).find(c => c.id === estado.forcedCardId);
    if (forcedCard && forcedCard.numbersRemaining > 0) {
      const prob = estado.forcedRiggingProbability !== undefined ? estado.forcedRiggingProbability : 75;
      const roll = Math.random() * 100;
      if (roll <= prob) {
        // Encontra os números restantes da cartela manipulada que ainda estão no globo
        const numRestantesNoGlobo = forcedCard.missingNumbers.filter(n => estado.ballsLeft.includes(n));
        if (numRestantesNoGlobo.length > 0) {
          const randIdx = Math.floor(Math.random() * numRestantesNoGlobo.length);
          ballDrawn = numRestantesNoGlobo[randIdx];
          
          // Remove a bola sorteada de ballsLeft
          const idxInGlobe = estado.ballsLeft.indexOf(ballDrawn);
          if (idxInGlobe !== -1) {
            estado.ballsLeft.splice(idxInGlobe, 1);
          }
          console.log(`[FORÇAR VENDEDOR] Sorteando bola manipulada ${ballDrawn} para cartela ${estado.forcedCardId} (prob: ${prob}%)`);
        }
      }
    }
  }

  // Se não foi sorteada bola por manipulação (ou não caiu na probabilidade), sorteia normalmente
  if (ballDrawn === null) {
    const randomIdx = Math.floor(Math.random() * estado.ballsLeft.length);
    ballDrawn = estado.ballsLeft.splice(randomIdx, 1)[0];
  }
  
  // Adiciona nas sorteadas
  estado.drawnBalls.push(ballDrawn);

  // Processa o estado do jogo para atualizar contadores e verificar ganhadores
  processarEstadoJogo(estado);

  return estado;
}
