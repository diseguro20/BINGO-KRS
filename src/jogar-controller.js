/**
 * BINGOKRS - Controlador do Portal do Jogador (jogar.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { gerarCartela90Bolas, obterRankingTop20 } from './game.js';

// Estado local do jogador
let jogadorAtual = null;
let estadoJogo = null;
let playerCartelas = [];
let ticketPrice = 2.0;
let selectedQty = 3;
let pollingInterval = null;
let lastPrizeTriggered = {}; // Evita tocar áudio repetidas vezes para o mesmo prêmio
let currentTab = 'buy';
let lastGameIdChecked = null;
let shownGlobalWinners = new Set();
let hidePrizeAlertTimeout = null;
let lastGameStatus = null;

// Seletores DOM - Autenticação
const screenAuth = document.getElementById('screen-auth');
const screenPortal = document.getElementById('screen-portal');
const cardLogin = document.getElementById('card-login');
const cardRegister = document.getElementById('card-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const loginUser = document.getElementById('login-user');
const loginPass = document.getElementById('login-pass');
const regName = document.getElementById('reg-name');
const regPhone = document.getElementById('reg-phone');
const regEmail = document.getElementById('reg-email');
const regPass = document.getElementById('reg-pass');
const linkShowRegister = document.getElementById('link-show-register');
const linkShowLogin = document.getElementById('link-show-login');

// Seletores DOM - Portal do Jogador
const playerWelcomeName = document.getElementById('player-welcome-name');
const btnLogout = document.getElementById('btn-logout');
const labelActiveRound = document.getElementById('label-active-round');
const badgeGameStatus = document.getElementById('badge-game-status');
const countMyCards = document.getElementById('count-my-cards');

// Seletores DOM - Abas e Conteúdo
const btnTabBuy = document.getElementById('btn-tab-buy');
const btnTabCards = document.getElementById('btn-tab-cards');
const btnTabLive = document.getElementById('btn-tab-live');
const tabContentBuy = document.getElementById('tab-content-buy');
const tabContentCards = document.getElementById('tab-content-cards');
const tabContentLive = document.getElementById('tab-content-live');

// Seletores DOM - Mini Preview e Alerta Global de Prêmios
const miniPreviewAuth = document.getElementById('mini-preview-auth');
const miniBallAuth = document.getElementById('mini-ball-auth');
const miniBallsAuthList = document.getElementById('mini-balls-auth-list');
const miniBallsAuthCount = document.getElementById('mini-balls-auth-count');

const miniPreviewPortal = document.getElementById('mini-preview-portal');
const miniBallPortal = document.getElementById('mini-ball-portal');
const miniBallsPortalList = document.getElementById('mini-balls-portal-list');
const miniBallsPortalCount = document.getElementById('mini-balls-portal-count');

const livePrizeAlert = document.getElementById('live-prize-alert');
const alertPrizeCategory = document.getElementById('alert-prize-category');
const alertPrizeCardId = document.getElementById('alert-prize-card-id');
const alertPrizePdv = document.getElementById('alert-prize-pdv');
const btnClosePrizeAlert = document.getElementById('btn-close-prize-alert');

// Seletores DOM - Checkout e Compra
const formBuyTickets = document.getElementById('form-buy-tickets');
const qtyButtons = document.querySelectorAll('.qty-btn');
const buyCustomQty = document.getElementById('buy-custom-qty');
const labelBuyTotal = document.getElementById('label-buy-total');
const labelTicketPrice = document.getElementById('label-ticket-price');
const boxPixPayment = document.getElementById('box-pix-payment');
const pixQrContainer = document.getElementById('pix-qr-container');
const buyPixCopiacola = document.getElementById('buy-pix-copiacola');
const btnCopyBuyPix = document.getElementById('btn-copy-buy-pix');
const labelPaymentStatus = document.getElementById('label-payment-status');
const btnSimulateBuyPayment = document.getElementById('btn-simulate-buy-payment');
const btnSubmitBuy = document.getElementById('btn-submit-buy');

// Seletores DOM - Abas de Listas de Cartelas
const boxNoCards = document.getElementById('box-no-cards');
const boxHasCards = document.getElementById('box-has-cards');
const containerMyTicketsList = document.getElementById('container-my-tickets-list');
const btnGotoBuy = document.getElementById('btn-goto-buy');

// Seletores DOM - Sala de Jogo ao Vivo
const liveMainBall = document.getElementById('live-main-ball');
const labelLiveBallsCount = document.getElementById('label-live-balls-count');
const liveCalledBoard = document.getElementById('live-called-board');
const containerLiveTicketsList = document.getElementById('container-live-tickets-list');

// Seletores DOM - Celebração de Vitória
const celebrationOverlay = document.getElementById('celebration-overlay');
const celebrationPrizeBadge = document.getElementById('celebration-prize-badge');
const celebrationCardId = document.getElementById('celebration-card-id');
const btnCloseCelebration = document.getElementById('btn-close-celebration');

// ==========================================
// 1. EVENTOS DE ALTERNÂNCIA DE TELAS E AUTH
// ==========================================

// Alterna entre login e cadastro
linkShowRegister.addEventListener('click', (e) => {
  e.preventDefault();
  cardLogin.style.display = 'none';
  cardRegister.style.display = 'block';
});

linkShowLogin.addEventListener('click', (e) => {
  e.preventDefault();
  cardRegister.style.display = 'none';
  cardLogin.style.display = 'block';
});

// Máscara de telefone celular para cadastro
regPhone.addEventListener('input', (e) => {
  let val = e.target.value.replace(/\D/g, '');
  if (val.length > 11) val = val.substring(0, 11);
  if (val.length > 10) {
    e.target.value = `(${val.substring(0, 2)}) ${val.substring(2, 7)}-${val.substring(7)}`;
  } else if (val.length > 6) {
    e.target.value = `(${val.substring(0, 2)}) ${val.substring(2, 6)}-${val.substring(6)}`;
  } else if (val.length > 2) {
    e.target.value = `(${val.substring(0, 2)}) ${val.substring(2)}`;
  } else if (val.length > 0) {
    e.target.value = `(${val}`;
  } else {
    e.target.value = '';
  }
});

// Submit de Login
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = loginUser.value.trim();
  const password = loginPass.value;

  try {
    const jogador = await FirebaseHelper.loginJogador(username, password);
    jogadorAtual = jogador;
    localStorage.setItem('bingokrs_jogador_sessao', JSON.stringify(jogador));
    entrarNoPortal();
  } catch (err) {
    alert("Falha no login: " + err.message);
  }
});

// Submit de Cadastro
formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = regName.value.trim();
  const phone = regPhone.value.trim();
  const email = regEmail.value.trim();
  const password = regPass.value;

  if (phone.length < 14) {
    alert("Por favor, insira um celular válido.");
    return;
  }

  try {
    const jogador = await FirebaseHelper.cadastrarJogador(name, phone, email, password);
    alert("Cadastro realizado com sucesso! Faça login para continuar.");
    // Limpa formulário e muda para login
    formRegister.reset();
    cardRegister.style.display = 'none';
    cardLogin.style.display = 'block';
  } catch (err) {
    alert("Erro ao cadastrar: " + err.message);
  }
});

// Logout
btnLogout.addEventListener('click', () => {
  jogadorAtual = null;
  localStorage.removeItem('bingokrs_jogador_sessao');
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  screenPortal.classList.remove('active');
  screenAuth.style.display = 'flex';
  formLogin.reset();

  atualizarVisibilidadeMiniPreview();
});

// ==========================================
// 2. FUNÇÕES DO DIRECIONAMENTO DO DASHBOARD
// ==========================================

function entrarNoPortal() {
  screenAuth.style.display = 'none';
  screenPortal.classList.add('active');
  playerWelcomeName.innerText = jogadorAtual.nome.split(' ')[0];
  
  // Carrega as cartelas do jogador
  carregarCartelasDoJogador();

  atualizarVisibilidadeMiniPreview();
}

async function carregarCartelasDoJogador() {
  if (!jogadorAtual) return;
  try {
    const list = await FirebaseHelper.buscarCartelasPorCelular(jogadorAtual.celular);
    playerCartelas = list;
    
    // Atualiza contadores
    countMyCards.innerText = playerCartelas.length;

    // Renderiza a listagem de cartelas
    renderizarListagemCartelasDashboard();
    
    // Se o jogo estiver ativo, atualiza a tela do jogo também
    if (estadoJogo && (estadoJogo.status === 'PLAYING' || estadoJogo.status === 'ENDED')) {
      renderizarCartelasAoVivo();
    }
  } catch (err) {
    console.error("Erro ao carregar cartelas do jogador:", err);
  }
}

// Renderiza a lista de cartelas compradas na aba de Minhas Cartelas
function renderizarListagemCartelasDashboard() {
  containerMyTicketsList.innerHTML = '';
  
  if (playerCartelas.length === 0) {
    boxNoCards.style.display = 'block';
    boxHasCards.style.display = 'none';
    return;
  }

  boxNoCards.style.display = 'none';
  boxHasCards.style.display = 'block';

  // Ordena as cartelas por gameId de forma decrescente
  const sorted = [...playerCartelas].sort((a, b) => b.gameId.localeCompare(a.gameId));

  sorted.forEach(card => {
    const wrapper = document.createElement('div');
    wrapper.className = 'ticket-wrapper';

    // Header info
    const headerDiv = document.createElement('div');
    headerDiv.className = 'ticket-header-info';
    headerDiv.innerHTML = `
      <span>CARTELA ${card.id}</span>
      <span class="ticket-badge">Sorteio ${card.gameId}</span>
    `;
    wrapper.appendChild(headerDiv);

    // Tabela 3x9
    const grid = document.createElement('div');
    grid.className = 'card-grid-3x9';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const val = card.gridFlat[r * 9 + c];
        const cell = document.createElement('div');
        if (val === null || val === undefined) {
          cell.className = 'card-cell empty';
        } else {
          cell.className = 'card-cell';
          cell.innerText = val.toString().padStart(2, '0');
        }
        grid.appendChild(cell);
      }
    }
    wrapper.appendChild(grid);
    containerMyTicketsList.appendChild(wrapper);
  });
}

// ==========================================
// 3. ABAS DE NAVEGAÇÃO
// ==========================================

function switchTab(tabId) {
  currentTab = tabId;
  [btnTabBuy, btnTabCards, btnTabLive].forEach(btn => btn.classList.remove('active'));
  [tabContentBuy, tabContentCards, tabContentLive].forEach(cont => cont.classList.remove('active'));

  if (tabId === 'buy') {
    btnTabBuy.classList.add('active');
    tabContentBuy.classList.add('active');
  } else if (tabId === 'cards') {
    btnTabCards.classList.add('active');
    tabContentCards.classList.add('active');
  } else if (tabId === 'live') {
    btnTabLive.classList.add('active');
    tabContentLive.classList.add('active');
  }

  atualizarVisibilidadeMiniPreview();
}

btnTabBuy.addEventListener('click', () => switchTab('buy'));
btnTabCards.addEventListener('click', () => switchTab('cards'));
btnTabLive.addEventListener('click', () => switchTab('live'));
btnGotoBuy.addEventListener('click', () => switchTab('buy'));

// ==========================================
// 4. LÓGICA DE COMPRA DE CARTELAS (PIXUP/OAUTH2)
// ==========================================

function updateBuyPrice() {
  const customVal = parseInt(buyCustomQty.value);
  const qty = (!isNaN(customVal) && customVal > 0) ? customVal : selectedQty;
  const total = qty * ticketPrice;
  labelBuyTotal.innerText = total.toFixed(2).replace('.', ',');
}

qtyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    qtyButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedQty = parseInt(btn.getAttribute('data-qty'));
    buyCustomQty.value = '';
    updateBuyPrice();
  });
});

buyCustomQty.addEventListener('input', () => {
  if (buyCustomQty.value) {
    qtyButtons.forEach(b => b.classList.remove('active'));
  } else {
    const matchingBtn = Array.from(qtyButtons).find(b => parseInt(b.getAttribute('data-qty')) === selectedQty);
    if (matchingBtn) matchingBtn.classList.add('active');
  }
  updateBuyPrice();
});

formBuyTickets.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!jogadorAtual) {
    alert("Inicie sessão para comprar.");
    return;
  }

  const customVal = parseInt(buyCustomQty.value);
  const qty = (!isNaN(customVal) && customVal > 0) ? customVal : selectedQty;
  const amount = qty * ticketPrice;

  btnSubmitBuy.disabled = true;
  btnSubmitBuy.innerText = "Gerando cobrança Pix...";
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  try {
    const config = await FirebaseHelper.buscarConfiguracaoGateway();

    if (!config || !config.clientId || !config.clientSecret) {
      // Caso não esteja configurado, mostra simulação automática
      console.warn("Gateway de API não configurado no painel administrativo.");
      buyPixCopiacola.value = "00020101021226830014br.gov.bcb.pix0136krsbingo-auto-pix-key-placeholder5204000053039865802BR5915KRS_BINGO_LOTTO6009SAO_PAULO62070503***6304ABCD";
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(buyPixCopiacola.value)}`;
      pixQrContainer.innerHTML = `<img src="${qrUrl}" alt="Pix QR Code" />`;
      
      boxPixPayment.style.display = 'flex';
      labelPaymentStatus.innerText = "Gateway offline: Use o botão de simulação abaixo para testar.";
      return;
    }

    const apiUrl = config.apiUrl || "https://api.pixupbr.com/v2";
    const clientId = config.clientId;
    const clientSecret = config.clientSecret;
    const chavePix = config.chavePix;

    // 1. Autenticar no Gateway para obter token
    const tokenUrl = `${apiUrl.replace(/\/$/, '')}/oauth/token`;
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenRes.ok) {
      throw new Error(`Erro na autenticação OAuth2 do gateway.`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Criar cobrança Pix
    const qrCodeUrl = `${apiUrl.replace(/\/$/, '')}/pix/qrcode`;
    const txid = 'tx_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

    const cobRes = await fetch(qrCodeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: parseFloat(amount.toFixed(2)),
        key: chavePix,
        description: `BINGO KRS ONLINE - ${qty} cartela(s)`,
        txid: txid,
        payer: {
          name: jogadorAtual.nome,
          phone: jogadorAtual.celular
        }
      })
    });

    if (!cobRes.ok) {
      throw new Error("Erro ao registrar cobrança Pix no gateway.");
    }

    const paymentData = await cobRes.json();
    const emvString = paymentData.qrcode || paymentData.emv || paymentData.pix_code || paymentData.qr_code || paymentData.payload || paymentData.copiacola;
    const qrCodeBase64 = paymentData.base64 || paymentData.qr_code_base64 || paymentData.qrcode_base64 || paymentData.image_base64 || paymentData.image;
    const paymentId = paymentData.id || paymentData.txid || paymentData.payment_id || txid;

    if (!emvString) {
      throw new Error("Chave copia-e-cola ausente na resposta do gateway.");
    }

    buyPixCopiacola.value = emvString;

    if (qrCodeBase64) {
      const imgSrc = qrCodeBase64.startsWith('data:') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`;
      pixQrContainer.innerHTML = `<img src="${imgSrc}" alt="Pix QR Code" />`;
    } else {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(emvString)}`;
      pixQrContainer.innerHTML = `<img src="${qrUrl}" alt="Pix QR Code" />`;
    }

    boxPixPayment.style.display = 'flex';
    labelPaymentStatus.innerText = "Aguardando confirmação do pagamento...";

    // 3. Iniciar Polling de Verificação
    pollingInterval = setInterval(async () => {
      try {
        const checkUrl = `${apiUrl.replace(/\/$/, '')}/pix/qrcode/${paymentId}`;
        const checkRes = await fetch(checkUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const status = (checkData.status || checkData.status_pagamento || '').toLowerCase();
          const isPaid = status === 'approved' || status === 'paid' || status === 'pago' || status === 'liquidado' || checkData.paid === true || checkData.pago === true;

          if (isPaid) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            labelPaymentStatus.innerText = "Pagamento aprovado!";
            await finalizarCompraJogador(qty);
          }
        }
      } catch (pollErr) {
        console.error("Erro no loop de verificação de Pix:", pollErr);
      }
    }, 5000);

  } catch (err) {
    alert("Erro na integração Pix: " + err.message + ". Usando checkout alternativo de demonstração.");
    // Fallback demo para testes locais sem credenciais reais
    buyPixCopiacola.value = "00020101021226830014br.gov.bcb.pix0136krsbingo-auto-pix-key-placeholder5204000053039865802BR5915KRS_BINGO_LOTTO6009SAO_PAULO62070503***6304ABCD";
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(buyPixCopiacola.value)}`;
    pixQrContainer.innerHTML = `<img src="${qrUrl}" alt="Pix QR Code" />`;
    boxPixPayment.style.display = 'flex';
    labelPaymentStatus.innerText = "Simule a aprovação no botão abaixo para receber as cartelas.";
  } finally {
    btnSubmitBuy.disabled = false;
    btnSubmitBuy.innerText = "Gerar Pix para Pagamento";
  }
});

// Copiar Pix Copia e Cola
btnCopyBuyPix.addEventListener('click', () => {
  const code = buyPixCopiacola.value;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    btnCopyBuyPix.innerText = 'Copiado!';
    btnCopyBuyPix.style.background = 'var(--success)';
    setTimeout(() => {
      btnCopyBuyPix.innerText = 'Copiar';
      btnCopyBuyPix.style.background = '';
    }, 2000);
  });
});

// Simular confirmação Pix
btnSimulateBuyPayment.addEventListener('click', async () => {
  btnSimulateBuyPayment.disabled = true;
  btnSimulateBuyPayment.innerText = "Confirmando Transação...";
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  const customVal = parseInt(buyCustomQty.value);
  const qty = (!isNaN(customVal) && customVal > 0) ? customVal : selectedQty;

  try {
    await finalizarCompraJogador(qty);
    alert("Simulação concluída! Suas novas cartelas estão disponíveis.");
  } catch (err) {
    alert("Erro ao simular faturamento: " + err.message);
  } finally {
    btnSimulateBuyPayment.disabled = false;
    btnSimulateBuyPayment.innerText = "💰 Simular Confirmação Pix (Para Testes)";
  }
});

// Efetiva a geração de cartelas e salva no Firebase associado ao celular do jogador
async function finalizarCompraJogador(qty) {
  if (!jogadorAtual || !estadoJogo) return;
  
  const targetGameId = estadoJogo.gameId;
  if (!targetGameId) {
    throw new Error("Nenhum sorteio ativo disponível no momento.");
  }

  const cartelas = [];
  for (let i = 0; i < qty; i++) {
    // Registra como venda do PDV online "OnlinePlayer" ou "Autoatendimento"
    cartelas.push(gerarCartela90Bolas("OnlinePlayer", targetGameId));
  }

  // Registrar no Firebase / LocalStorage
  await FirebaseHelper.registrarCartelasVenda(cartelas, {
    nome: jogadorAtual.nome,
    celular: jogadorAtual.celular
  });

  // Ocultar formulário de pagamento
  boxPixPayment.style.display = 'none';
  buyPixCopiacola.value = '';
  buyCustomQty.value = '';

  // Atualizar lista local
  await carregarCartelasDoJogador();
  
  // Muda de aba para Minhas Cartelas para ver o ticket gerado
  switchTab('cards');
}

// ==========================================
// 5. LIVE ROOM & SINCRONIZAÇÃO EM TEMPO REAL
// ==========================================

// Inicializar os 90 números do painel
function inicializarPainelNumerosLive() {
  liveCalledBoard.innerHTML = '';
  for (let i = 1; i <= 90; i++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cell.id = `live-cell-${i}`;
    cell.innerText = i.toString().padStart(2, '0');
    liveCalledBoard.appendChild(cell);
  }
}

// Sincroniza a exibição das cartelas com números marcados neon e badges de aproximação
function renderizarCartelasAoVivo() {
  containerLiveTicketsList.innerHTML = '';
  if (!estadoJogo) return;

  const activeGameId = estadoJogo.gameId;
  const sorteadas = estadoJogo.drawnBalls || [];

  // Filtra cartelas do jogador compradas para o jogo ativo
  const cartelasAtivas = playerCartelas.filter(c => c.gameId === activeGameId);

  if (cartelasAtivas.length === 0) {
    containerLiveTicketsList.innerHTML = `
      <div class="player-card" style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 25px;">
        Nenhuma cartela sua cadastrada para a rodada ${activeGameId}.
      </div>
    `;
    return;
  }

  cartelasAtivas.forEach(card => {
    // Calcula quantos acertos e quantas faltas
    const missing = card.numbers.filter(n => !sorteadas.includes(n)).length;
    const acertos = 15 - missing;

    const wrapper = document.createElement('div');
    wrapper.className = 'ticket-wrapper';

    // Header info com badges dinâmicos de proximidade
    let badgeClass = 'ticket-badge';
    let badgeLabel = `${acertos} ACERTOS`;
    if (missing === 1) {
      badgeClass = 'ticket-badge hot-1';
      badgeLabel = 'FALTA 1 PARA BINGO!';
    } else if (missing === 2) {
      badgeClass = 'ticket-badge hot-2';
      badgeLabel = 'FALTA 2!';
    }

    const header = document.createElement('div');
    header.className = 'ticket-header-info';
    header.innerHTML = `
      <span>CARTELA ${card.id}</span>
      <span class="${badgeClass}">${badgeLabel}</span>
    `;
    wrapper.appendChild(header);

    // Tabela 3x9 com auto-marcação
    const grid = document.createElement('div');
    grid.className = 'card-grid-3x9';

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const val = card.gridFlat[r * 9 + c];
        const cell = document.createElement('div');
        if (val === null || val === undefined) {
          cell.className = 'card-cell empty';
        } else {
          // Se o número foi sorteado, aplica estilo marcado com bola neon
          const foiSorteado = sorteadas.includes(val);
          cell.className = foiSorteado ? 'card-cell marked' : 'card-cell';
          cell.innerText = val.toString().padStart(2, '0');
        }
        grid.appendChild(cell);
      }
    }

    wrapper.appendChild(grid);
    containerLiveTicketsList.appendChild(wrapper);
  });
}

// Verifica se uma das cartelas do jogador ganhou e abre overlay
function verificarGanhadoresJogador() {
  if (!estadoJogo || !jogadorAtual || estadoJogo.status !== 'PLAYING') return;

  const winners = estadoJogo.winners;
  if (!winners) return;

  const activeGameId = estadoJogo.gameId;
  const cartelasAtivas = playerCartelas.filter(c => c.gameId === activeGameId);

  // Categorias de prêmios
  const categorias = ['acumulado', 'bingo', 'quina', 'quadra'];

  categorias.forEach(cat => {
    const listWinners = winners[cat] || [];
    listWinners.forEach(w => {
      // Verifica se a cartela vencedora pertence ao jogador
      const correspondente = cartelasAtivas.find(c => c.id === w.cardId);
      if (correspondente) {
        // Chave identificadora única para o prêmio para evitar loops infinitos
        const prizeKey = `${cat}_${correspondente.id}_${activeGameId}`;
        if (!lastPrizeTriggered[prizeKey]) {
          lastPrizeTriggered[prizeKey] = true;
          
          // Abre comemoração visual e sonora!
          mostrarCelebracao(cat.toUpperCase(), correspondente.id);
        }
      }
    });
  });
}

// Ativa comemoração de ganhador na tela
function mostrarCelebracao(categoria, cardId) {
  celebrationPrizeBadge.innerText = categoria;
  celebrationCardId.innerText = `CARTELA #${cardId}`;
  celebrationOverlay.classList.add('active');
  
  // Toca o áudio de fanfarra via Web Audio API
  playVictorySound();
}

btnCloseCelebration.addEventListener('click', () => {
  celebrationOverlay.classList.remove('active');
});

// Sintetizador de fanfarra de vitória
function playVictorySound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C E G C E G C (Fanfarra em Dó Maior)
    notes.forEach((freq, index) => {
      setTimeout(() => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
      }, index * 100);
    });
  } catch (e) {
    console.warn("Áudio bloqueado pelas políticas de interação do navegador.", e);
  }
}

// Sintetizador de alerta de vitória geral (curto e chamativo)
function playAlertSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, index) => {
      setTimeout(() => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      }, index * 80);
    });
  } catch (e) {
    console.warn("Audio blocked by browser policies", e);
  }
}

// Atualiza a contagem regressiva local na aba de jogo ao vivo
function atualizarContagemRegressivaLocal() {
  if (!estadoJogo) return;

  const liveStatsStatusText = document.getElementById('live-stats-status-text');
  const liveStatsPrizes = document.getElementById('live-stats-prizes');
  const liveStatsExtra = document.getElementById('live-stats-extra');

  if (estadoJogo.status === 'WAITING') {
    if (estadoJogo.countdownEndTime) {
      const agora = Date.now();
      const tempoRestante = Math.max(0, Math.round((estadoJogo.countdownEndTime - agora) / 1000));

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

        // 1. Atualiza o número dentro da bola com o tempo restante
        if (liveMainBall) {
          liveMainBall.innerText = textoTime;
          liveMainBall.style.fontSize = '20px'; // Fonte menor para caber MM:SS
        }

        // 2. Atualiza os textos do painel de estatísticas
        if (liveStatsStatusText) liveStatsStatusText.innerText = "PRÓXIMO SORTEIO EM:";
        if (liveStatsPrizes) {
          liveStatsPrizes.innerText = textoTime;
          liveStatsPrizes.style.color = 'var(--neon-cyan)';
          liveStatsPrizes.style.fontSize = '18px';
        }
        if (liveStatsExtra) {
          liveStatsExtra.innerHTML = `Sorteio: <strong style="color: #fff;">${estadoJogo.gameId || '---'}</strong>`;
        }
        return;
      }
    }

    // Se estiver aguardando mas sem contagem ativa
    if (liveMainBall) {
      liveMainBall.innerText = '--';
      liveMainBall.style.fontSize = '32px';
    }
    if (liveStatsStatusText) liveStatsStatusText.innerText = "STATUS DO JOGO:";
    if (liveStatsPrizes) {
      liveStatsPrizes.innerText = "Aguardando Início...";
      liveStatsPrizes.style.color = 'var(--neon-pink)';
      liveStatsPrizes.style.fontSize = '';
    }
    if (liveStatsExtra) {
      liveStatsExtra.innerHTML = `Sorteio: <strong style="color: #fff;">${estadoJogo.gameId || '---'}</strong>`;
    }

  } else if (estadoJogo.status === 'PLAYING') {
    // Restaura tamanho de fonte caso o tempo estivesse nela antes
    if (liveMainBall && liveMainBall.innerText.includes(':')) {
      liveMainBall.innerText = '--';
      liveMainBall.style.fontSize = '32px';
    }
    if (liveStatsStatusText) liveStatsStatusText.innerText = "Próximos Prêmios:";
    if (liveStatsPrizes) {
      liveStatsPrizes.innerText = "Quadra, Quina e Bingo!";
      liveStatsPrizes.style.color = 'var(--neon-gold)';
      liveStatsPrizes.style.fontSize = '';
    }
    if (liveStatsExtra) {
      const count = estadoJogo.drawnBalls ? estadoJogo.drawnBalls.length : 0;
      liveStatsExtra.innerHTML = `Bolas Sorteadas: <strong id="label-live-balls-count">${count}</strong>/90`;
    }
  } else if (estadoJogo.status === 'ENDED') {
    if (liveMainBall) {
      liveMainBall.innerText = 'FIM';
      liveMainBall.style.fontSize = '28px';
    }
    if (liveStatsStatusText) liveStatsStatusText.innerText = "STATUS DO JOGO:";
    if (liveStatsPrizes) {
      liveStatsPrizes.innerText = "Sorteio Finalizado!";
      liveStatsPrizes.style.color = 'var(--text-muted)';
      liveStatsPrizes.style.fontSize = '';
    }
    if (liveStatsExtra) {
      liveStatsExtra.innerHTML = `Sorteio: <strong style="color: #fff;">${estadoJogo.gameId || '---'}</strong>`;
    }
  }
}

// Atualiza a visibilidade do mini preview
function atualizarVisibilidadeMiniPreview() {
  if (!estadoJogo) return;

  if (estadoJogo.status === 'PLAYING') {
    if (!jogadorAtual) {
      miniPreviewAuth.style.display = 'block';
      miniPreviewPortal.style.display = 'none';
    } else {
      miniPreviewAuth.style.display = 'none';
      if (currentTab !== 'live') {
        miniPreviewPortal.style.display = 'block';
      } else {
        miniPreviewPortal.style.display = 'none';
      }
    }
  } else {
    miniPreviewAuth.style.display = 'none';
    miniPreviewPortal.style.display = 'none';
  }
}

// Atualiza o conteúdo do mini preview com dezenas recentes
function atualizarConteudoMiniPreview(bolasSorteadas) {
  const count = bolasSorteadas.length;
  const ultimaBola = count > 0 ? bolasSorteadas[count - 1] : null;

  // 1. Auth Mini Preview
  if (miniBallAuth) {
    miniBallAuth.innerText = ultimaBola ? ultimaBola.toString().padStart(2, '0') : '--';
    if (ultimaBola) {
      miniBallAuth.style.animation = 'none';
      void miniBallAuth.offsetWidth;
      miniBallAuth.style.animation = 'bounceBall 0.4s ease-out forwards';
    }
  }
  if (miniBallsAuthCount) {
    miniBallsAuthCount.innerText = count;
  }
  if (miniBallsAuthList) {
    miniBallsAuthList.innerHTML = '';
    // Últimas 5 dezenas (antes da última bola principal)
    const recentes = bolasSorteadas.slice(-6, -1);
    recentes.forEach(b => {
      const ballEl = document.createElement('div');
      ballEl.className = 'mini-ball-small';
      ballEl.innerText = b.toString().padStart(2, '0');
      miniBallsAuthList.appendChild(ballEl);
    });
  }

  // 2. Portal Mini Preview
  if (miniBallPortal) {
    miniBallPortal.innerText = ultimaBola ? ultimaBola.toString().padStart(2, '0') : '--';
    if (ultimaBola) {
      miniBallPortal.style.animation = 'none';
      void miniBallPortal.offsetWidth;
      miniBallPortal.style.animation = 'bounceBall 0.4s ease-out forwards';
    }
  }
  if (miniBallsPortalCount) {
    miniBallsPortalCount.innerText = count;
  }
  if (miniBallsPortalList) {
    miniBallsPortalList.innerHTML = '';
    // Últimas 3 dezenas (antes da última bola principal)
    const recentes = bolasSorteadas.slice(-4, -1);
    recentes.forEach(b => {
      const ballEl = document.createElement('div');
      ballEl.className = 'mini-ball-small';
      ballEl.innerText = b.toString().padStart(2, '0');
      miniBallsPortalList.appendChild(ballEl);
    });
  }
}

// Monitora se há novos vencedores no jogo para exibir alerta gigante
function verificarGanhadoresGerais() {
  if (!estadoJogo) return;
  const activeGameId = estadoJogo.gameId || 'default';

  // Se iniciou/mudou de rodada, limpa o set de alertas exibidos
  if (activeGameId !== lastGameIdChecked) {
    lastGameIdChecked = activeGameId;
    shownGlobalWinners.clear();
  }

  const winners = estadoJogo.winners;
  if (!winners) return;

  const categorias = ['acumulado', 'bingo', 'quina', 'quadra'];
  let novoGanhadorDetectado = false;
  let novoGanhadorInfo = null;

  for (const cat of categorias) {
    const listWinners = winners[cat] || [];
    for (const w of listWinners) {
      const winKey = `${activeGameId}_${cat}_${w.cardId}`;
      if (!shownGlobalWinners.has(winKey)) {
        shownGlobalWinners.add(winKey);

        if (!novoGanhadorDetectado) {
          novoGanhadorDetectado = true;
          novoGanhadorInfo = {
            categoria: cat,
            cardId: w.cardId,
            pdv: w.pdv || 'Online'
          };
        }
      }
    }
  }

  if (novoGanhadorDetectado && novoGanhadorInfo) {
    exibirAlertaGanhadorGeral(novoGanhadorInfo.categoria, novoGanhadorInfo.cardId, novoGanhadorInfo.pdv);
  }
}

// Exibe o overlay gigante de vitória geral
function exibirAlertaGanhadorGeral(categoria, cardId, pdv) {
  if (!livePrizeAlert) return;

  alertPrizeCategory.innerText = categoria.toUpperCase();
  alertPrizeCardId.innerText = `#${cardId}`;
  alertPrizePdv.innerText = `PDV: ${pdv}`;

  if (categoria === 'acumulado' || categoria === 'bingo') {
    alertPrizeCategory.style.borderColor = 'var(--neon-gold)';
    alertPrizeCategory.style.color = 'var(--neon-gold)';
    alertPrizeCategory.style.textShadow = '0 0 5px var(--neon-gold)';
  } else {
    alertPrizeCategory.style.borderColor = 'var(--neon-pink)';
    alertPrizeCategory.style.color = 'var(--neon-pink)';
    alertPrizeCategory.style.textShadow = '0 0 5px var(--neon-pink)';
  }

  livePrizeAlert.classList.add('active');
  playAlertSound();

  if (hidePrizeAlertTimeout) {
    clearTimeout(hidePrizeAlertTimeout);
  }
  hidePrizeAlertTimeout = setTimeout(() => {
    livePrizeAlert.classList.remove('active');
  }, 4000);
}

// Fechamento manual do popup geral
if (btnClosePrizeAlert) {
  btnClosePrizeAlert.addEventListener('click', () => {
    if (livePrizeAlert) {
      livePrizeAlert.classList.remove('active');
    }
    if (hidePrizeAlertTimeout) {
      clearTimeout(hidePrizeAlertTimeout);
      hidePrizeAlertTimeout = null;
    }
  });
}

// ==========================================
// 6. INICIALIZAÇÃO DO CONTROLLER
// ==========================================

inicializarPainelNumerosLive();
updateBuyPrice();

// Verifica se já existe sessão de jogador salva no localStorage
const session = localStorage.getItem('bingokrs_jogador_sessao');
if (session) {
  jogadorAtual = JSON.parse(session);
  entrarNoPortal();
} else {
  screenAuth.style.display = 'flex';
}

// Assinar atualizações de estado em tempo real
FirebaseHelper.assinarEstadoJogo((gameData) => {
  estadoJogo = gameData;
  if (!estadoJogo) return;

  // 1. Atualizar informações básicas da rodada
  const activeGameId = estadoJogo.gameId || '---';
  labelActiveRound.innerText = `Rodada ${activeGameId.startsWith('#') ? activeGameId : '#' + activeGameId}`;
  ticketPrice = parseFloat(estadoJogo.prizes?.cupom || 2.0);
  labelTicketPrice.innerText = ticketPrice.toFixed(2).replace('.', ',');
  updateBuyPrice();

  // 2. Atualizar Badge de Status da Rodada
  badgeGameStatus.className = 'game-status-badge ' + (estadoJogo.status || 'waiting').toLowerCase();
  
  // A aba do jogo ao vivo fica sempre visível para o jogador ver a cartela e o globo a qualquer momento
  btnTabLive.style.display = 'block';

  if (estadoJogo.status === 'PLAYING') {
    badgeGameStatus.innerText = 'Em Andamento';
    // Se a rodada começou agora, redireciona o jogador automaticamente para a aba do jogo ao vivo
    if (lastGameStatus !== 'PLAYING') {
      switchTab('live');
    }
  } else if (estadoJogo.status === 'WAITING') {
    badgeGameStatus.innerText = 'Aguardando';
  } else if (estadoJogo.status === 'ENDED') {
    badgeGameStatus.innerText = 'Finalizado';
  }

  lastGameStatus = estadoJogo.status;

  // 3. Atualizar Bola Sorteada Principal
  const bolasSorteadas = estadoJogo.drawnBalls || [];
  if (bolasSorteadas.length > 0) {
    const ultimaBola = bolasSorteadas[bolasSorteadas.length - 1];
    liveMainBall.innerText = ultimaBola.toString().padStart(2, '0');
    liveMainBall.style.animation = 'none';
    // Força reflow para re-ativar animação de entrada de bola
    void liveMainBall.offsetWidth;
    liveMainBall.style.animation = 'bounceBall 0.5s ease-out forwards';
  } else {
    liveMainBall.innerText = '--';
  }

  labelLiveBallsCount.innerText = bolasSorteadas.length;

  // 4. Sincronizar painel de 90 números
  for (let i = 1; i <= 90; i++) {
    const cell = document.getElementById(`live-cell-${i}`);
    if (cell) {
      cell.className = 'board-cell';
      if (bolasSorteadas.includes(i)) {
        cell.classList.add('called');
        // Se for a última bola chamada, ganha destaque especial rosa
        if (bolasSorteadas[bolasSorteadas.length - 1] === i) {
          cell.classList.add('last-called');
        }
      }
    }
  }

  // 5. Atualizar marcações e badges das cartelas
  renderizarCartelasAoVivo();

  // 5.5 Atualizar Ranking Geral de Cartelas em Jogo
  const liveRankingTbody = document.getElementById('live-ranking-tbody');
  if (liveRankingTbody) {
    liveRankingTbody.innerHTML = '';
    const cardsInPlay = estadoJogo.cards || [];
    const ranking = obterRankingTop20(cardsInPlay);
    
    if (ranking.length === 0) {
      liveRankingTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 15px 0;">Nenhuma cartela ativa</td></tr>`;
    } else {
      ranking.forEach(card => {
        let classeGlow = '';
        if (card.numbersRemaining === 1) classeGlow = 'row-rest-1';
        else if (card.numbersRemaining === 2) classeGlow = 'row-rest-2';
        else if (card.numbersRemaining === 3) classeGlow = 'row-rest-3';

        const tr = document.createElement('tr');
        tr.className = classeGlow;
        tr.innerHTML = `
          <td style="padding: 8px 4px; font-weight: bold;">${card.id}</td>
          <td style="padding: 8px 4px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${card.pdv}</td>
          <td style="padding: 8px 4px; text-align: right; font-weight: bold;">${card.numbersRemaining}</td>
        `;
        liveRankingTbody.appendChild(tr);
      });
    }
  }

  // 6. Verificar se o jogador atual é vencedor
  verificarGanhadoresJogador();

  // 7. Atualizar visibilidade e conteúdo das mini telas de sorteio ao vivo
  atualizarVisibilidadeMiniPreview();
  atualizarConteudoMiniPreview(bolasSorteadas);

  // 8. Monitorar se há ganhadores gerais no jogo
  verificarGanhadoresGerais();
});

// Relógio e Contagem Regressiva local a cada 1 segundo
setInterval(() => {
  if (estadoJogo) {
    atualizarContagemRegressivaLocal();
  }
}, 1000);
