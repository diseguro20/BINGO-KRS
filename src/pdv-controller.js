/**
 * BINGOKRS - Controlador do Ponto de Venda (pdv.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { gerarCartela90Bolas, processarEstadoJogo } from './game.js';

// Estado local do PDV
let estado = null;
let rascunhoCartela = null;
let cartelaSelecionada = null; // Para o modal

// Elementos do DOM
const inputPdvName = document.getElementById('select-pdv-name');
const pdvNameStatus = document.getElementById('pdv-name-status');
const widgetCurrentBall = document.getElementById('widget-current-ball');
const widgetStatusText = document.getElementById('widget-status-text');
const widgetOrderText = document.getElementById('widget-order-text');

// Preview e Vendas
const previewGrid = document.getElementById('preview-grid');
const previewCode = document.getElementById('preview-code');
const previewGameId = document.getElementById('preview-game-id');
const btnGenerateDraft = document.getElementById('btn-generate-draft');
const btnSellCard = document.getElementById('btn-sell-card');
const cupomPrices = document.querySelectorAll('.cupom-price');

// Lote
const batchQuantity = document.getElementById('batch-quantity');
const batchTotalValue = document.getElementById('batch-total-value');
const btnSellBatch = document.getElementById('btn-sell-batch');

// Tabela de Vendidas
const soldCountBadge = document.getElementById('sold-count-badge');
const searchCardInput = document.getElementById('search-card-input');
const soldCardsTbody = document.getElementById('sold-cards-tbody');

// Modal
const cartelaModal = document.getElementById('cartela-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnPrintTicket = document.getElementById('btn-print-ticket');
const modalPdvName = document.getElementById('modal-pdv-name');
const modalSorteioId = document.getElementById('modal-sorteio-id');
const modalTicketDate = document.getElementById('modal-ticket-date');
const modalCardCode = document.getElementById('modal-card-code');
const modalGrid = document.getElementById('modal-grid');

// Inicialização da identificação do PDV via LocalStorage
const pdvSalvo = localStorage.getItem('bingokrs_pdv_identificador');
if (pdvSalvo) {
  inputPdvName.value = pdvSalvo;
}

// Salva alteração de nome do PDV
inputPdvName.addEventListener('input', () => {
  const nome = inputPdvName.value.trim() || "Sem Nome";
  localStorage.setItem('bingokrs_pdv_identificador', nome);
  renderizarListaVendidas();
});

/**
 * Escuta atualizações no lote para recalcular o preço total instantaneamente
 */
batchQuantity.addEventListener('input', recalcularTotalLote);

function recalcularTotalLote() {
  if (!estado) return;
  const quant = parseInt(batchQuantity.value) || 0;
  const preco = estado.prizes.cupom;
  batchTotalValue.innerText = (quant * preco).toFixed(2).replace('.', ',');
}

/**
 * Renderiza o widget de transmissão e atualiza dados de preços
 */
function renderizarPdv(novoEstado) {
  if (!novoEstado) return;
  const statusAnterior = estado ? estado.status : null;
  estado = novoEstado;

  // 1. Atualizar Preços nas Labels
  const precoFormatado = estado.prizes.cupom.toFixed(2).replace('.', ',');
  cupomPrices.forEach(el => el.innerText = precoFormatado);
  recalcularTotalLote();

  // 2. Widget Ao Vivo
  if (estado.drawnBalls.length > 0) {
    const atual = estado.drawnBalls[estado.drawnBalls.length - 1];
    widgetCurrentBall.innerText = atual.toString().padStart(2, '0');
  } else {
    widgetCurrentBall.innerText = '--';
  }
  
  widgetStatusText.innerText = obterTextoStatusPdv(estado.status);
  
  // Altera cores do status
  if (estado.status === 'PLAYING') widgetStatusText.style.color = 'var(--primary)';
  else if (estado.status === 'ENDED') widgetStatusText.style.color = 'var(--danger)';
  else widgetStatusText.style.color = 'var(--success)';

  widgetOrderText.innerText = `ORDEM ${estado.drawnBalls.length}`;

  // 3. Atualizar textos dos botões de venda dependendo do sorteio ativo
  const targetId = estado.status === 'WAITING' ? estado.gameId : estado.nextGameId;
  const tipoRodada = estado.status === 'WAITING' ? 'Atual' : 'Próx';

  btnSellCard.innerText = `Confirmar Venda p/ Sorteio ${targetId} (R$ ${precoFormatado})`;
  btnSellBatch.innerText = `Vender Lote para Sorteio ${targetId}`;

  // Se o rascunho existir e o sorteio avançou/mudou de status, cancela ou atualiza o rascunho
  if (rascunhoCartela) {
    previewGameId.innerText = targetId;
    rascunhoCartela.gameId = targetId;
  }

  // 4. Re-renderiza a lista de cartelas vendidas por este PDV
  renderizarListaVendidas();
}

function obterTextoStatusPdv(status) {
  switch (status) {
    case 'WAITING': return 'AGUARDANDO';
    case 'PLAYING': return 'SORTEANDO';
    case 'ENDED': return 'FINALIZADO';
    default: return status;
  }
}

/**
 * Desenha o Grid 3x9 da cartela dentro de um contêiner específico
 */
function desenharGrid3x9(grid, conteinerDom, sorteadas = []) {
  conteinerDom.innerHTML = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const val = grid[r][c];
      const cell = document.createElement('div');
      
      if (val === null) {
        cell.className = 'cell empty';
      } else {
        cell.className = 'cell';
        cell.innerText = val.toString().padStart(2, '0');
        
        // Se este número já foi sorteado, destaca no grid do PDV
        if (sorteadas.includes(val)) {
          cell.classList.add('hit');
        }
      }
      conteinerDom.appendChild(cell);
    }
  }
}

/**
 * Gera rascunho de cartela para venda individual
 */
btnGenerateDraft.addEventListener('click', () => {
  if (!estado) return;
  
  const pdvNome = inputPdvName.value.trim() || "Ponto de Venda";
  const targetId = estado.status === 'WAITING' ? estado.gameId : estado.nextGameId;
  
  rascunhoCartela = gerarCartela90Bolas(pdvNome, targetId);
  
  // Exibe o rascunho visualmente
  previewCode.innerText = rascunhoCartela.id;
  previewGameId.innerText = targetId;
  desenharGrid3x9(rascunhoCartela.grid, previewGrid);

  btnSellCard.disabled = false;
});

/**
 * Confirma e registra a venda da cartela individual
 */
btnSellCard.addEventListener('click', () => {
  if (!rascunhoCartela || !estado) return;

  const pdvNome = inputPdvName.value.trim() || "Ponto de Venda";
  rascunhoCartela.pdv = pdvNome;

  const statusAtual = estado.status;
  const targetId = statusAtual === 'WAITING' ? estado.gameId : estado.nextGameId;

  // Envia comando para o Administrador registrar de forma centralizada e segura
  FirebaseHelper.enviarComando('REGISTRAR_CARTELA', { card: rascunhoCartela });

  // Armazena temporariamente para abrir o modal de impressão
  const vendida = rascunhoCartela;

  // Limpa o painel de rascunho
  rascunhoCartela = null;
  previewCode.innerText = '-------';
  previewGameId.innerText = '--';
  previewGrid.innerHTML = Array(27).fill('<div class="cell empty"></div>').join('');
  btnSellCard.disabled = true;

  // Abre modal para impressão
  abrirModalCartela(vendida);
});

/**
 * Venda rápida em Lote
 */
btnSellBatch.addEventListener('click', () => {
  if (!estado) return;

  const pdvNome = inputPdvName.value.trim() || "Ponto de Venda";
  const quant = parseInt(batchQuantity.value) || 0;
  
  if (quant <= 0) {
    alert("Selecione uma quantidade válida para venda.");
    return;
  }

  const statusAtual = estado.status;
  const targetId = statusAtual === 'WAITING' ? estado.gameId : estado.nextGameId;
  
  const novasCartelas = [];
  for (let i = 0; i < quant; i++) {
    novasCartelas.push(gerarCartela90Bolas(pdvNome, targetId));
  }

  // Envia o lote de cartelas para o Administrador registrar centralizadamente
  FirebaseHelper.enviarComando('REGISTRAR_CARTELAS_LOTE', { cards: novasCartelas });

  alert(`${quant} cartelas enviadas para registro no Sorteio ${targetId}!`);
});

/**
 * Renderiza a lista de cartelas vendidas deste PDV filtrada por busca
 */
function renderizarListaVendidas() {
  if (!estado) return;

  const pdvNome = inputPdvName.value.trim().toLowerCase();
  const busca = searchCardInput.value.trim().toUpperCase();
  const sorteadas = estado.drawnBalls;

  // Filtra cartelas deste PDV específico nas duas listas (Atuais e Próximas)
  const minhasAtuais = estado.cards.filter(c => c.pdv.toLowerCase() === pdvNome);
  const minhasProximas = (estado.nextCards || []).filter(c => c.pdv.toLowerCase() === pdvNome);
  
  // Combina ambas as listas
  const todasMinhas = [...minhasAtuais, ...minhasProximas];
  
  const cartelasFiltradas = todasMinhas.filter(card => {
    return busca === '' || card.id.toUpperCase().includes(busca);
  });

  // Atualiza Badge com total geral vendido neste PDV (sem busca)
  soldCountBadge.innerText = `${todasMinhas.length} Vendidas`;

  soldCardsTbody.innerHTML = '';
  if (cartelasFiltradas.length === 0) {
    soldCardsTbody.innerHTML = `<tr class="empty-row"><td colspan="4">Nenhuma cartela vendida neste filtro.</td></tr>`;
  } else {
    cartelasFiltradas.forEach(card => {
      // Classes de alertas baseados em acertos
      let classeLinha = '';
      if (card.numbersRemaining === 1) classeLinha = 'alert-1';
      else if (card.numbersRemaining === 2) classeLinha = 'alert-2';
      else if (card.numbersRemaining === 3) classeLinha = 'alert-3';

      // Constrói lista visual dos 15 números destacando os já sorteados
      const listaNumHtml = card.numbers.map(num => {
        const isDrawn = sorteadas.includes(num);
        return `<span class="number-span ${isDrawn ? 'drawn' : ''}">${num.toString().padStart(2, '0')}</span>`;
      }).join(' ');

      const tr = document.createElement('tr');
      tr.className = classeLinha;
      tr.innerHTML = `
        <td><strong>${card.id}</strong></td>
        <td class="numbers-cell">${listaNumHtml}</td>
        <td><span class="rest-badge">${card.numbersRemaining}</span></td>
        <td>
          <button class="btn btn-secondary btn-mini btn-view-modal" data-id="${card.id}">Visualizar</button>
        </td>`;
      soldCardsTbody.appendChild(tr);
    });

    // Vincula ações nos botões de visualização criados
    document.querySelectorAll('.btn-view-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        // Procura nas duas listas
        const cardObj = estado.cards.find(c => c.id === id) || (estado.nextCards || []).find(c => c.id === id);
        if (cardObj) {
          abrirModalCartela(cardObj);
        }
      });
    });
  }
}

// Filtro de Busca
searchCardInput.addEventListener('input', renderizarListaVendidas);

/**
 * Gerenciamento do Modal de Impressão
 */
function abrirModalCartela(card) {
  cartelaSelecionada = card;

  modalPdvName.innerText = card.pdv;
  modalSorteioId.innerText = card.gameId; // Exibe o sorteio associado à cartela
  modalTicketDate.innerText = estado ? estado.dataSorteio : new Date().toLocaleDateString('pt-BR');
  modalCardCode.innerText = card.id;

  // Destaca as bolas sorteadas somente se for o sorteio ativo
  const sorteadasDestacar = (estado && card.gameId === estado.gameId) ? estado.drawnBalls : [];
  desenharGrid3x9(card.grid, modalGrid, sorteadasDestacar);

  cartelaModal.classList.add('open');
}

function fecharModal() {
  cartelaModal.classList.remove('open');
  cartelaSelecionada = null;
}

closeModalBtn.addEventListener('click', fecharModal);
btnCloseModal.addEventListener('click', fecharModal);
cartelaModal.addEventListener('click', (e) => {
  if (e.target === cartelaModal) fecharModal();
});

// Simula Impressão Térmica
btnPrintTicket.addEventListener('click', () => {
  if (!cartelaSelecionada) return;
  
  // Abre o diálogo do navegador para imprimir apenas a área do cupom se configurado,
  // ou faz uma simulação elegante
  alert(`Simulando Impressão da Cartela ${cartelaSelecionada.id}...\n\nImpressora Térmica acionada no ponto de venda.`);
});

// Inscreve para atualizações do estado do jogo
FirebaseHelper.assinarEstadoJogo(renderizarPdv);
