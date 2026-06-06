/**
 * BINGOKRS - Controlador do Ponto de Venda (pdv.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { gerarCartela90Bolas } from './game.js';

// Estado local do PDV
let estado = null;
let rascunhoCartela = null;
let cartelaSelecionada = null; // Para o modal
let operadorLogado = null;
let heartbeatIntervalId = null;

// Elementos do DOM - Autenticação
const loginOverlay = document.getElementById('login-overlay');
const loginTitle = document.getElementById('login-title');
const loginSubtitle = document.getElementById('login-subtitle');
const loginErrorMsg = document.getElementById('login-error-msg');
const formLogin = document.getElementById('form-login');
const loginGroupPdv = document.getElementById('login-group-pdv');
const loginGroupName = document.getElementById('login-group-name');
const inputLoginPdvName = document.getElementById('login-pdv-name');
const inputLoginOperatorName = document.getElementById('login-operator-name');
const inputLoginEmail = document.getElementById('login-email');
const inputLoginPassword = document.getElementById('login-password');
const btnLoginSubmit = document.getElementById('btn-login-submit');
const btnToggleLoginMode = document.getElementById('btn-toggle-login-mode');
const toggleText = document.getElementById('toggle-text');

const loginGroupAuth = document.getElementById('login-group-auth');
const inputAuthEmail = document.getElementById('login-auth-email');
const inputAuthPassword = document.getElementById('login-auth-password');

// Elementos do DOM - Caixa PDV
const inputPdvName = document.getElementById('select-pdv-name');
const pdvNameStatus = document.getElementById('pdv-name-status');
const widgetCurrentBall = document.getElementById('widget-current-ball');
const widgetStatusText = document.getElementById('widget-status-text');
const widgetOrderText = document.getElementById('widget-order-text');
const btnLogout = document.getElementById('btn-logout');

// Cliente
const inputClientPhone = document.getElementById('client-phone');
const inputClientName = document.getElementById('client-name');
const inputClientCpf = document.getElementById('client-cpf');
const clientStatusInfo = document.getElementById('client-status-info');

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

let modoLogin = "LOGIN"; // LOGIN ou CADASTRO

// ==========================================
// 1. GESTÃO DE SESSÃO E AUTH DE OPERADORES
// ==========================================

// Alterna entre modo Login e Cadastro
btnToggleLoginMode.addEventListener('click', (e) => {
  e.preventDefault();
  loginErrorMsg.style.display = 'none';

  if (modoLogin === "LOGIN") {
    modoLogin = "CADASTRO";
    loginTitle.innerHTML = 'BINGOKRS <span style="background:var(--success); font-size: 11px; padding: 3px 8px; border-radius: 4px; vertical-align: middle; margin-left: 5px;">NOVO PDV</span>';
    loginSubtitle.innerText = 'Cadastre sua conta de operador de caixa e dê nome ao seu estabelecimento.';
    loginGroupPdv.style.display = 'block';
    loginGroupName.style.display = 'block';
    loginGroupAuth.style.display = 'block';
    inputLoginPdvName.required = true;
    inputLoginOperatorName.required = true;
    inputAuthEmail.required = true;
    inputAuthPassword.required = true;
    btnLoginSubmit.innerText = 'Cadastrar e Entrar';
    toggleText.innerText = 'Já possui conta?';
    btnToggleLoginMode.innerText = 'Acessar Caixa';
  } else {
    modoLogin = "LOGIN";
    loginTitle.innerHTML = 'BINGOKRS <span style="background:var(--primary); font-size: 11px; padding: 3px 8px; border-radius: 4px; vertical-align: middle; margin-left: 5px;">CAIXA PDV</span>';
    loginSubtitle.innerText = 'Faça login com seu operador ou registre seu novo estabelecimento.';
    loginGroupPdv.style.display = 'none';
    loginGroupName.style.display = 'none';
    loginGroupAuth.style.display = 'none';
    inputLoginPdvName.required = false;
    inputLoginOperatorName.required = false;
    inputAuthEmail.required = false;
    inputAuthPassword.required = false;
    btnLoginSubmit.innerText = 'Entrar no Caixa';
    toggleText.innerText = 'Novo estabelecimento?';
    btnToggleLoginMode.innerText = 'Cadastrar Novo PDV';
  }
});

// Envio do formulário de login/cadastro
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErrorMsg.style.display = 'none';
  btnLoginSubmit.disabled = true;
  btnLoginSubmit.innerText = 'Aguarde...';

  const email = inputLoginEmail.value.trim();
  const password = inputLoginPassword.value;

  try {
    if (modoLogin === "LOGIN") {
      await FirebaseHelper.login(email, password);
    } else {
      const pdvName = inputLoginPdvName.value.trim();
      const opName = inputLoginOperatorName.value.trim();
      const authEmail = inputAuthEmail.value.trim();
      const authPassword = inputAuthPassword.value;
      if (!pdvName || !opName || !authEmail || !authPassword) {
        throw new Error("Preencha todos os campos do cadastro e autorização.");
      }
      await FirebaseHelper.cadastrarOperadorComAutorizacao(email, password, pdvName, opName, authEmail, authPassword);
    }
  } catch (error) {
    loginErrorMsg.innerText = error.message || "Erro desconhecido na autenticação.";
    loginErrorMsg.style.display = 'block';
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.innerText = modoLogin === "LOGIN" ? 'Entrar no Caixa' : 'Cadastrar e Entrar';
  }
});

// Logout
btnLogout.addEventListener('click', async () => {
  if (confirm("Deseja fechar o caixa e deslogar do PDV?")) {
    await FirebaseHelper.logout();
    location.reload();
  }
});

// Assinatura de autenticação
FirebaseHelper.assinarAutenticacao((user, profile) => {
  if (user && profile) {
    operadorLogado = profile;
    inputPdvName.value = profile.pdvNome;
    pdvNameStatus.innerText = "Operador: " + profile.nome;
    pdvNameStatus.style.background = "var(--success)";
    
    // Esconde tela de login
    loginOverlay.style.display = 'none';
    
    // Heartbeat
    if (heartbeatIntervalId !== null) clearInterval(heartbeatIntervalId);
    FirebaseHelper.registrarHeartbeat(profile.pdvNome);
    heartbeatIntervalId = setInterval(() => {
      if (operadorLogado) {
        FirebaseHelper.registrarHeartbeat(operadorLogado.pdvNome);
      }
    }, 15000);

    // Renderiza dados locais
    renderizarListaVendidas();
  } else {
    operadorLogado = null;
    inputPdvName.value = "Carregando...";
    pdvNameStatus.innerText = "Inativo";
    pdvNameStatus.style.background = "var(--danger)";
    
    if (heartbeatIntervalId !== null) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }

    // Mostra tela de login
    loginOverlay.style.display = 'flex';
  }
});

// ==========================================
// 2. FORMULÁRIO DE CLIENTE (AUTOCAMPOS)
// ==========================================

inputClientPhone.addEventListener('input', async () => {
  const tel = inputClientPhone.value.trim();
  const telLimpo = tel.replace(/\D/g, '');

  if (telLimpo.length >= 10) {
    clientStatusInfo.innerText = "Pesquisando no banco...";
    clientStatusInfo.style.display = 'block';
    
    const cliente = await FirebaseHelper.buscarClientePorCelular(telLimpo);
    if (cliente) {
      inputClientName.value = cliente.nome;
      inputClientCpf.value = cliente.cpf || '';
      clientStatusInfo.innerText = `✅ Cliente localizado! Total de compras: ${cliente.totalCartelasCompradas || 0} cartelas.`;
      clientStatusInfo.style.color = 'var(--success)';
    } else {
      clientStatusInfo.innerText = "📝 Novo cliente (preencha os dados abaixo opcionalmente).";
      clientStatusInfo.style.color = 'var(--neon-cyan)';
    }
  } else {
    clientStatusInfo.style.display = 'none';
  }
});

// ==========================================
// 3. LOGICA DO LOTE
// ==========================================

batchQuantity.addEventListener('input', recalcularTotalLote);

function recalcularTotalLote() {
  if (!estado) return;
  const quant = parseInt(batchQuantity.value) || 0;
  const preco = estado.prizes.cupom;
  batchTotalValue.innerText = (quant * preco).toFixed(2).replace('.', ',');
}

// ==========================================
// 4. RENDERIZADOR DO PDV
// ==========================================

function renderizarPdv(novoEstado) {
  if (!novoEstado) return;
  estado = novoEstado;

  // Temporariamente armazena o cupom para o helper ler nas transações
  localStorage.setItem('bingokrs_cupom_temp', estado.prizes.cupom);

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
  
  if (estado.status === 'PLAYING') widgetStatusText.style.color = 'var(--primary)';
  else if (estado.status === 'ENDED') widgetStatusText.style.color = 'var(--danger)';
  else widgetStatusText.style.color = 'var(--success)';

  widgetOrderText.innerText = `ORDEM ${estado.drawnBalls.length}`;

  // 3. Atualizar textos dos botões de venda
  const targetId = estado.status === 'WAITING' ? estado.gameId : estado.nextGameId;
  btnSellCard.innerText = `Confirmar Venda p/ Sorteio ${targetId} (R$ ${precoFormatado})`;
  btnSellBatch.innerText = `Vender Lote para Sorteio ${targetId}`;

  if (rascunhoCartela) {
    previewGameId.innerText = targetId;
    rascunhoCartela.gameId = targetId;
  }

  // 4. Re-renderiza a lista de cartelas vendidas
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

function desenharGrid3x9(gridFlat, conteinerDom, sorteadas = []) {
  conteinerDom.innerHTML = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const val = gridFlat[r * 9 + c];
      const cell = document.createElement('div');
      
      if (val === null || val === undefined) {
        cell.className = 'cell empty';
      } else {
        cell.className = 'cell';
        cell.innerText = val.toString().padStart(2, '0');
        
        if (sorteadas.includes(val)) {
          cell.classList.add('hit');
        }
      }
      conteinerDom.appendChild(cell);
    }
  }
}

// ==========================================
// 5. REGISTROS DE VENDAS (UNITÁRIAS E LOTE)
// ==========================================

// Gera rascunho de cartela
btnGenerateDraft.addEventListener('click', () => {
  if (!estado || !operadorLogado) return;
  
  const pdvNome = operadorLogado.pdvNome;
  const targetId = estado.status === 'WAITING' ? estado.gameId : estado.nextGameId;
  
  rascunhoCartela = gerarCartela90Bolas(pdvNome, targetId);
  
  previewCode.innerText = rascunhoCartela.id;
  previewGameId.innerText = targetId;
  desenharGrid3x9(rascunhoCartela.gridFlat, previewGrid);

  btnSellCard.disabled = false;
});

// Auxiliar para colher dados do cliente e registrar no Firestore
async function processarCadastroCliente(quantidade) {
  const celular = inputClientPhone.value.trim();
  const nome = inputClientName.value.trim();
  const cpf = inputClientCpf.value.trim();

  if (celular && nome) {
    return await FirebaseHelper.cadastrarOuAtualizarCliente(nome, celular, cpf, quantidade);
  }
  return null;
}

// Confirma venda unitária
btnSellCard.addEventListener('click', async () => {
  if (!rascunhoCartela || !estado || !operadorLogado) return;

  btnSellCard.disabled = true;
  btnSellCard.innerText = 'Processando...';

  const pdvNome = operadorLogado.pdvNome;
  rascunhoCartela.pdv = pdvNome;

  const targetId = estado.status === 'WAITING' ? estado.gameId : estado.nextGameId;

  try {
    // 1. Cadastra/Atualiza cliente
    const clienteInfo = await processarCadastroCliente(1);

    // 2. Envia para o Firestore e atualiza as métricas
    await FirebaseHelper.registrarCartelasVenda([rascunhoCartela], clienteInfo);

    // 3. Envia comando para o Admin atualizar a memória do jogo ativo
    FirebaseHelper.enviarComando('REGISTRAR_CARTELA', { card: rascunhoCartela });

    // Abre modal para impressão
    const vendida = rascunhoCartela;
    
    // Limpa campos
    rascunhoCartela = null;
    previewCode.innerText = '-------';
    previewGameId.innerText = '--';
    previewGrid.innerHTML = Array(27).fill('<div class="cell empty"></div>').join('');
    inputClientPhone.value = '';
    inputClientName.value = '';
    inputClientCpf.value = '';
    clientStatusInfo.style.display = 'none';

    abrirModalCartela(vendida);
  } catch (error) {
    alert("Erro ao finalizar a venda: " + error.message);
  } finally {
    const precoFormatado = estado.prizes.cupom.toFixed(2).replace('.', ',');
    btnSellCard.innerText = `Confirmar Venda p/ Sorteio ${targetId} (R$ ${precoFormatado})`;
  }
});

// Venda em Lote
btnSellBatch.addEventListener('click', async () => {
  if (!estado || !operadorLogado) return;

  const pdvNome = operadorLogado.pdvNome;
  const quant = parseInt(batchQuantity.value) || 0;
  
  if (quant <= 0) {
    alert("Selecione uma quantidade válida para venda.");
    return;
  }

  btnSellBatch.disabled = true;
  btnSellBatch.innerText = 'Registrando Lote...';

  const targetId = estado.status === 'WAITING' ? estado.gameId : estado.nextGameId;
  
  const novasCartelas = [];
  for (let i = 0; i < quant; i++) {
    novasCartelas.push(gerarCartela90Bolas(pdvNome, targetId));
  }

  try {
    // 1. Processa cliente
    const clienteInfo = await processarCadastroCliente(quant);

    // 2. Registra no Firestore e faturamento
    await FirebaseHelper.registrarCartelasVenda(novasCartelas, clienteInfo);

    // 3. Envia comando para o Admin
    FirebaseHelper.enviarComando('REGISTRAR_CARTELAS_LOTE', { cards: novasCartelas });

    // Limpa cliente
    inputClientPhone.value = '';
    inputClientName.value = '';
    inputClientCpf.value = '';
    clientStatusInfo.style.display = 'none';

    alert(`Sucesso! ${quant} cartelas vendidas e registradas no Sorteio ${targetId}!`);
  } catch (error) {
    alert("Erro na venda em lote: " + error.message);
  } finally {
    btnSellBatch.disabled = false;
    btnSellBatch.innerText = `Vender Lote para Sorteio ${targetId}`;
  }
});

// ==========================================
// 6. LISTAGEM DE CARTELAS VENDIDAS DO PDV
// ==========================================

function renderizarListaVendidas() {
  if (!estado || !operadorLogado) return;

  const pdvNome = operadorLogado.pdvNome.toLowerCase();
  const busca = searchCardInput.value.trim().toUpperCase();
  const sorteadas = estado.drawnBalls;

  const minhasAtuais = estado.cards.filter(c => c.pdv.toLowerCase() === pdvNome);
  const minhasProximas = (estado.nextCards || []).filter(c => c.pdv.toLowerCase() === pdvNome);
  const todasMinhas = [...minhasAtuais, ...minhasProximas];
  
  const cartelasFiltradas = todasMinhas.filter(card => {
    return busca === '' || card.id.toUpperCase().includes(busca);
  });

  soldCountBadge.innerText = `${todasMinhas.length} Vendidas`;

  soldCardsTbody.innerHTML = '';
  if (cartelasFiltradas.length === 0) {
    soldCardsTbody.innerHTML = `<tr class="empty-row"><td colspan="4">Nenhuma cartela vendida neste filtro.</td></tr>`;
  } else {
    cartelasFiltradas.forEach(card => {
      let classeLinha = '';
      if (card.numbersRemaining === 1) classeLinha = 'alert-1';
      else if (card.numbersRemaining === 2) classeLinha = 'alert-2';
      else if (card.numbersRemaining === 3) classeLinha = 'alert-3';

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

    document.querySelectorAll('.btn-view-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        const cardObj = estado.cards.find(c => c.id === id) || (estado.nextCards || []).find(c => c.id === id);
        if (cardObj) {
          abrirModalCartela(cardObj);
        }
      });
    });
  }
}

searchCardInput.addEventListener('input', renderizarListaVendidas);

// ==========================================
// 7. DIALOGO DO MODAL
// ==========================================

function abrirModalCartela(card) {
  cartelaSelecionada = card;

  modalPdvName.innerText = card.pdv;
  modalSorteioId.innerText = card.gameId;
  modalTicketDate.innerText = estado ? estado.dataSorteio : new Date().toLocaleDateString('pt-BR');
  modalCardCode.innerText = card.id;

  const sorteadasDestacar = (estado && card.gameId === estado.gameId) ? estado.drawnBalls : [];
  desenharGrid3x9(card.gridFlat, modalGrid, sorteadasDestacar);

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

btnPrintTicket.addEventListener('click', () => {
  if (!cartelaSelecionada) return;
  alert(`Simulando Impressão da Cartela ${cartelaSelecionada.id}...\n\nImpressora Térmica acionada no ponto de venda.`);
});

// Inscreve para atualizações do estado do jogo
FirebaseHelper.assinarEstadoJogo(renderizarPdv);
