/**
 * BINGOKRS - Controlador do Painel de Programação de Rodadas (programacao.html)
 */

import { FirebaseHelper } from './firebase-helper.js';

// Estado local
let estado = null;
let pdvsCarregados = new Set(['Bar do Marcão', 'Choperia Miami', 'Distribuidora Neon', 'Adega do Zé', 'Bingo Club']);

// Elementos do DOM
const formScheduler = document.getElementById('form-round-scheduler');
const inputGameId = document.getElementById('input-game-id');
const inputCupom = document.getElementById('input-cupom');
const inputQuadra = document.getElementById('input-quadra');
const inputQuina = document.getElementById('input-quina');
const inputBingo = document.getElementById('input-bingo');
const inputAcumulado = document.getElementById('input-acumulado');
const selectCountdown = document.getElementById('input-countdown');
const selectDrawSpeed = document.getElementById('select-draw-speed');
const inputAutoStart = document.getElementById('input-auto-start');
const selectForcedPdv = document.getElementById('select-forced-pdv');
const groupForcedPdvCustom = document.getElementById('group-forced-pdv-custom');
const inputForcedPdvCustom = document.getElementById('input-forced-pdv-custom');
const selectRiggingProb = document.getElementById('input-rigging-prob');

const queueTbody = document.getElementById('queue-tbody');
const btnClearQueue = document.getElementById('btn-clear-queue');

// Elementos do DOM - Autenticação
const loginOverlay = document.getElementById('login-overlay');
const loginErrorMsg = document.getElementById('login-error-msg');
const formLogin = document.getElementById('form-login');
const inputLoginEmail = document.getElementById('login-email');
const inputLoginPassword = document.getElementById('login-password');
const btnLoginSubmit = document.getElementById('btn-login-submit');

/**
 * Inicializa e preenche o dropdown de PDVs
 */
function atualizarDropdownPdvs() {
  if (!estado) return;

  // Escaneia cartelas atuais e futuras buscando novos PDVs
  const cartelas = [...(estado.cards || []), ...(estado.nextCards || [])];
  cartelas.forEach(c => {
    if (c.pdv && c.pdv.trim() !== "") {
      pdvsCarregados.add(c.pdv.trim());
    }
  });

  // Guarda o valor selecionado atualmente
  const valorSelecionado = selectForcedPdv.value;

  // Limpa o select mantendo as opções especiais
  selectForcedPdv.innerHTML = `
    <option value="NENHUM">NENHUM (Sorteio 100% Aleatório)</option>
  `;

  // Adiciona os PDVs conhecidos
  Array.from(pdvsCarregados).sort().forEach(pdv => {
    const option = document.createElement('option');
    option.value = pdv;
    option.innerText = pdv;
    selectForcedPdv.appendChild(option);
  });

  // Adiciona a opção de digitar manual no final
  const optionOutro = document.createElement('option');
  optionOutro.value = "OUTRO";
  optionOutro.innerText = "OUTRO (Digitar Nome...)";
  selectForcedPdv.appendChild(optionOutro);

  // Restaura seleção anterior
  if (Array.from(selectForcedPdv.options).some(o => o.value === valorSelecionado)) {
    selectForcedPdv.value = valorSelecionado;
  } else {
    selectForcedPdv.value = "NENHUM";
  }
}

/**
 * Controla exibição do campo de texto customizado para PDV
 */
selectForcedPdv.addEventListener('change', () => {
  if (selectForcedPdv.value === "OUTRO") {
    groupForcedPdvCustom.style.display = "block";
    inputForcedPdvCustom.required = true;
    inputForcedPdvCustom.focus();
  } else {
    groupForcedPdvCustom.style.display = "none";
    inputForcedPdvCustom.required = false;
  }
});

/**
 * Sugere o próximo ID do sorteio sequencial
 */
function sugerirProximoGameId() {
  if (!estado) return;
  
  let ultimoId = estado.nextGameId || "#0002";
  
  // Se houver rodadas agendadas, pega o ID da última da fila
  if (estado.rodadasQueue && estado.rodadasQueue.length > 0) {
    ultimoId = estado.rodadasQueue[estado.rodadasQueue.length - 1].gameId;
  }
  
  // Incrementa (ex: #0002 -> #0003)
  const numId = parseInt(ultimoId.replace('#', '')) || 0;
  const proximoId = '#' + (numId + 1).toString().padStart(4, '0');
  inputGameId.value = proximoId;
}

/**
 * Renderiza a fila de rodadas agendadas
 */
function renderizarFila() {
  queueTbody.innerHTML = '';

  if (!estado.rodadasQueue || estado.rodadasQueue.length === 0) {
    queueTbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-row">Nenhuma rodada agendada na fila.</td>
      </tr>
    `;
    return;
  }

  estado.rodadasQueue.forEach((rodada, index) => {
    const tr = document.createElement('tr');
    
    // Prêmios formatados
    const premiosHtml = `
      <div>Quadra: R$ ${rodada.prizes.quadra.toFixed(2)}</div>
      <div>Quina: R$ ${rodada.prizes.quina.toFixed(2)}</div>
      <div>Bingo: R$ ${rodada.prizes.bingo.toFixed(2)}</div>
      <div>Acumulado: R$ ${rodada.prizes.acumulado.toFixed(2)}</div>
      <div style="font-size: 11px; color: var(--text-muted);">Preço Cupom: R$ ${rodada.prizes.cupom.toFixed(2)}</div>
    `;

    // Modo e contagem
    const modoBadge = rodada.schedulingMode === 'IA' ? 'badge-mode ia' : 'badge-mode manual';
    const autoDrawText = rodada.autoStartDraw ? `(Auto-start ${rodada.drawSpeed}s)` : '(Sem auto-start)';
    const contagemHtml = `
      <div><span class="${modoBadge}">${rodada.schedulingMode}</span></div>
      <div style="margin-top: 6px;">${rodada.countdownMinutes} min ${autoDrawText}</div>
    `;

    // Vendedor forçado
    let pdvAlvoHtml = '<span class="badge-none">Nenhum (100% Aleatório)</span>';
    if (rodada.forcedPdvWinner && rodada.forcedPdvWinner !== 'NENHUM') {
      pdvAlvoHtml = `
        <div><span class="badge-forced">${rodada.forcedPdvWinner}</span></div>
        <div style="font-size: 11px; color: var(--neon-gold); margin-top: 4px;">Força: ${rodada.forcedRiggingProbability || 75}%</div>
      `;
    }

    tr.innerHTML = `
      <td><strong style="color: var(--neon-cyan);">${rodada.gameId}</strong></td>
      <td>${premiosHtml}</td>
      <td>${contagemHtml}</td>
      <td>${pdvAlvoHtml}</td>
      <td>
        <button class="btn btn-danger-outline btn-mini btn-delete-round" data-index="${index}">Deletar</button>
      </td>
    `;
    
    queueTbody.appendChild(tr);
  });

  // Bind do botão de deleção individual
  document.querySelectorAll('.btn-delete-round').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      deletarRodadaDaFila(idx);
    });
  });
}

/**
 * Carrega e assina o estado do jogo
 */
function renderizarProgramacao(novoEstado) {
  if (!novoEstado) return;
  
  // Inicializa a fila se ela não existir no estado
  if (!novoEstado.rodadasQueue) {
    novoEstado.rodadasQueue = [];
  }
  
  const precisaSugerirId = (estado === null);
  estado = novoEstado;

  // Atualiza listagem de PDVs e tabela
  atualizarDropdownPdvs();
  renderizarFila();

  if (precisaSugerirId) {
    sugerirProximoGameId();
  }
}

/**
 * Salva agendamento na fila
 */
formScheduler.addEventListener('submit', (e) => {
  e.preventDefault();

  const gameIdVal = inputGameId.value.trim();
  
  // Evita duplicar ID de rodada que já está na fila
  const duplicado = estado.rodadasQueue.some(r => r.gameId.toLowerCase() === gameIdVal.toLowerCase());
  if (duplicado) {
    alert(`O ID do sorteio ${gameIdVal} já está programado na fila. Escolha outro ID.`);
    return;
  }

  // Verifica se o PDV foi customizado
  let forcedPdvValue = selectForcedPdv.value;
  if (forcedPdvValue === "OUTRO") {
    forcedPdvValue = inputForcedPdvCustom.value.trim();
    if (!forcedPdvValue) {
      alert("Por favor, digite o nome do bar/PDV alvo.");
      return;
    }
  }

  const novaRodada = {
    gameId: gameIdVal,
    prizes: {
      cupom: parseFloat(inputCupom.value) || 2.0,
      quadra: parseFloat(inputQuadra.value) || 50.0,
      quina: parseFloat(inputQuina.value) || 100.0,
      bingo: parseFloat(inputBingo.value) || 250.0,
      acumulado: parseFloat(inputAcumulado.value) || 1000.0
    },
    schedulingMode: document.querySelector('input[name="scheduling-mode"]:checked').value,
    countdownMinutes: parseInt(selectCountdown.value) || 2,
    drawSpeed: parseInt(selectDrawSpeed.value) || 3,
    autoStartDraw: inputAutoStart.checked,
    forcedPdvWinner: forcedPdvValue,
    forcedRiggingProbability: parseInt(selectRiggingProb.value) || 75
  };

  // Adiciona na fila
  estado.rodadasQueue.push(novaRodada);

  // Salva no banco de dados local
  FirebaseHelper.salvarEstadoJogo(estado);

  // Limpa campos customizados e sugere o próximo ID
  inputForcedPdvCustom.value = '';
  sugerirProximoGameId();

  alert(`Rodada ${gameIdVal} agendada com sucesso!`);
});

/**
 * Remove rodada da fila por índice
 */
function deletarRodadaDaFila(index) {
  if (confirm("Deseja realmente remover esta rodada da programação?")) {
    estado.rodadasQueue.splice(index, 1);
    FirebaseHelper.salvarEstadoJogo(estado);
    sugerirProximoGameId();
  }
}

/**
 * Limpa toda a fila de rodadas agendadas
 */
btnClearQueue.addEventListener('click', () => {
  if (estado.rodadasQueue.length === 0) return;

  if (confirm("Deseja remover absolutamente TODAS as rodadas da fila de agendamento?")) {
    estado.rodadasQueue = [];
    FirebaseHelper.salvarEstadoJogo(estado);
    sugerirProximoGameId();
    alert("Fila de programação limpa.");
  }
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

// Inscreve no estado do jogo
FirebaseHelper.assinarEstadoJogo(renderizarProgramacao);
