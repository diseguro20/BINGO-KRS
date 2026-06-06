/**
 * BINGOKRS - Controlador do Painel de Programação de Rodadas (programacao.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { avancarProximaRodada } from './game.js';

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
const inputStartDate = document.getElementById('input-start-date');
const inputStartTime = document.getElementById('input-start-time');
const selectDrawSpeed = document.getElementById('select-draw-speed');
const inputAutoStart = document.getElementById('input-auto-start');
const selectForcedPdv = document.getElementById('select-forced-pdv');
const groupForcedPdvCustom = document.getElementById('group-forced-pdv-custom');
const inputForcedPdvCustom = document.getElementById('input-forced-pdv-custom');
const selectRiggingProb = document.getElementById('input-rigging-prob');

// Elementos da IA Inteligente
const iaSchedulingContainer = document.getElementById('ia-scheduling-container');
const iaWarningBox = document.getElementById('ia-warning-box');
const iaPdvCountMsg = document.getElementById('ia-pdv-count-msg');
const iaRecommendationMsg = document.getElementById('ia-recommendation-msg');
const btnIaGenerateDay = document.getElementById('btn-ia-generate-day');

// Função auxiliar para obter data local YYYY-MM-DD
function obterDataHojeLocalString() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Inicializa a data de início com o dia de hoje
if (inputStartDate) {
  inputStartDate.value = obterDataHojeLocalString();
}

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

// Toggle do contêiner de IA inteligente
document.querySelectorAll('input[name="scheduling-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'IA') {
      iaSchedulingContainer.style.display = 'block';
    } else {
      iaSchedulingContainer.style.display = 'none';
    }
  });
});

/**
 * Sugere um ID do sorteio aleatório e único
 */
function sugerirProximoGameId() {
  if (!estado) return;
  
  let proximoId;
  let tentativas = 0;
  do {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    proximoId = `#${randomNum}`;
    tentativas++;
  } while (
    ((estado.rodadasQueue && estado.rodadasQueue.some(r => r.gameId === proximoId)) ||
     estado.gameId === proximoId ||
     estado.nextGameId === proximoId) && 
    tentativas < 100
  );
  
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

  // Ordena a fila por data e hora de início antes de exibir
  const obterDataHojeString = () => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  };
  const dataHoje = obterDataHojeString();

  estado.rodadasQueue.sort((a, b) => {
    if (!a.startTime && !b.startTime) return 0;
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    
    const dateA = a.startDate || dataHoje;
    const dateB = b.startDate || dataHoje;
    
    if (dateA !== dateB) {
      return dateA.localeCompare(dateB);
    }
    return a.startTime.localeCompare(b.startTime);
  });

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
    
    let tempoDisplay = `${rodada.countdownMinutes} min`;
    if (rodada.startTime) {
      if (rodada.startDate) {
        const parts = rodada.startDate.split('-');
        const dataFormatada = parts.length === 3 ? `${parts[2]}/${parts[1]}` : rodada.startDate;
        if (rodada.startDate === obterDataHojeLocalString()) {
          tempoDisplay = `⏰ ${rodada.startTime}`;
        } else {
          tempoDisplay = `⏰ ${dataFormatada} às ${rodada.startTime}`;
        }
      } else {
        tempoDisplay = `⏰ ${rodada.startTime}`;
      }
    }

    // Status da rodada
    let statusLabel = 'Aguardando';
    let statusClass = 'pending';
    if (rodada.status === 'PLAYING') {
      statusLabel = 'Ativo';
      statusClass = 'playing';
    } else if (rodada.status === 'FINISHED') {
      statusLabel = 'Finalizado';
      statusClass = 'finished';
    }
    const statusHtml = `<span class="badge-status ${statusClass}">${statusLabel}</span>`;

    const contagemHtml = `
      <div style="display: flex; gap: 8px; align-items: center;">
        <span class="${modoBadge}">${rodada.schedulingMode}</span>
        ${statusHtml}
      </div>
      <div style="margin-top: 6px; font-weight: 600;">${tempoDisplay} <br><span style="font-size: 11px; opacity: 0.85;">${autoDrawText}</span></div>
    `;

    // Vendedor forçado
    let pdvAlvoHtml = '<span class="badge-none">Nenhum (100% Aleatório)</span>';
    if (rodada.forcedPdvWinner && rodada.forcedPdvWinner !== 'NENHUM') {
      pdvAlvoHtml = `
        <div><span class="badge-forced">${rodada.forcedPdvWinner}</span></div>
        <div style="font-size: 11px; color: var(--neon-gold); margin-top: 4px;">Força: ${rodada.forcedRiggingProbability || 75}%</div>
      `;
    }

    const isPlaying = rodada.status === 'PLAYING';
    const deleteBtnHtml = isPlaying 
      ? `<button class="btn btn-danger-outline btn-mini btn-delete-round" disabled style="opacity: 0.3; cursor: not-allowed;">Deletar</button>`
      : `<button class="btn btn-danger-outline btn-mini btn-delete-round" data-index="${index}">Deletar</button>`;

    tr.innerHTML = `
      <td><strong style="color: var(--neon-cyan);">${rodada.gameId}</strong></td>
      <td>${premiosHtml}</td>
      <td>${contagemHtml}</td>
      <td>${pdvAlvoHtml}</td>
      <td>
        ${deleteBtnHtml}
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
let isSubmitting = false;

formScheduler.addEventListener('submit', (e) => {
  e.preventDefault();

  if (isSubmitting) return;
  isSubmitting = true;

  const btnSubmit = formScheduler.querySelector('button[type="submit"]');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Processando...';
  }

  try {
    const gameIdVal = inputGameId.value.trim();
    
    // Evita duplicar ID de rodada que já está na fila
    const duplicado = estado.rodadasQueue.some(r => r.gameId.toLowerCase() === gameIdVal.toLowerCase());
    if (duplicado) {
      alert(`O ID do sorteio ${gameIdVal} já está programado na fila. Escolha outro ID.`);
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerText = 'Agendar Rodada na Fila';
      }
      isSubmitting = false;
      return;
    }

    // Verifica se o PDV foi customizado
    let forcedPdvValue = selectForcedPdv.value;
    if (forcedPdvValue === "OUTRO") {
      forcedPdvValue = inputForcedPdvCustom.value.trim();
      if (!forcedPdvValue) {
        alert("Por favor, digite o nome do bar/PDV alvo.");
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerText = 'Agendar Rodada na Fila';
        }
        isSubmitting = false;
        return;
      }
    }

    const startTimeVal = inputStartTime.value || null;
    let startDateVal = inputStartDate ? (inputStartDate.value || null) : null;
    if (startTimeVal && !startDateVal) {
      startDateVal = obterDataHojeLocalString();
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
      countdownMinutes: startTimeVal ? null : (parseInt(selectCountdown.value) || 2),
      startTime: startTimeVal,
      startDate: startTimeVal ? startDateVal : null,
      drawSpeed: parseInt(selectDrawSpeed.value) || 3,
      autoStartDraw: inputAutoStart.checked,
      forcedPdvWinner: forcedPdvValue,
      forcedRiggingProbability: parseInt(selectRiggingProb.value) || 75
    };

    // Adiciona na fila
    estado.rodadasQueue.push(novaRodada);

    const activeRoundQueue = estado.rodadasQueue ? estado.rodadasQueue.find(r => r.gameId === estado.gameId) : null;
    const isRoundActive = activeRoundQueue && (activeRoundQueue.status === 'PLAYING' || activeRoundQueue.status === 'FINISHED');

    // Se a rodada atual estiver ociosa e houver rodadas agendadas, avança automaticamente imediatamente
    if (estado.status === 'WAITING' && 
        !isRoundActive &&
        !estado.countdownEndTime && 
        (!estado.drawnBalls || estado.drawnBalls.length === 0)) {
      console.log("[PROGRAMAÇÃO] Canal ocioso. Avançando para a rodada programada imediatamente.");
      estado = avancarProximaRodada(estado);
    }

    // Salva no banco de dados local
    FirebaseHelper.salvarEstadoJogo(estado);

    // Limpa campos customizados e sugere o próximo ID
    inputForcedPdvCustom.value = '';
    inputStartTime.value = '';
    if (inputStartDate) {
      inputStartDate.value = obterDataHojeLocalString();
    }
    sugerirProximoGameId();

    alert(`Rodada ${gameIdVal} agendada com sucesso!`);
  } catch (error) {
    console.error(error);
  } finally {
    isSubmitting = false;
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerText = 'Agendar Rodada na Fila';
    }
  }
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

// Monitorar PDVs online em tempo real
let pdvsOnlineCount = 0;
FirebaseHelper.assinarPdvsOnline((count, pdvsList) => {
  pdvsOnlineCount = count;
  iaPdvCountMsg.innerText = `Bares/PDVs Online: ${count} ativo(s)`;
  
  if (count >= 3) {
    iaWarningBox.style.borderLeft = "4px solid var(--neon-cyan)";
    iaPdvCountMsg.style.color = "var(--neon-cyan)";
    iaRecommendationMsg.innerHTML = `✅ Saúde da plataforma está estável. <br>Recomendação: <strong>Grade Padrão (12:00 às 23:45)</strong> de 15 em 15 min.`;
  } else {
    iaWarningBox.style.borderLeft = "4px solid var(--neon-gold)";
    iaPdvCountMsg.style.color = "var(--neon-gold)";
    iaRecommendationMsg.innerHTML = `⚠️ Poucos PDVs online! <br>Recomendação: <strong>Grade Reduzida (18:00 às 23:00)</strong> para evitar prejuízos.`;
  }
});

// Ação do Botão Gerar Grade IA
btnIaGenerateDay.addEventListener('click', async () => {
  if (!estado) return;

  const pdvsCount = pdvsOnlineCount;
  let startHour = 12;
  let endHour = 23;
  let maxMinutes = 45;
  let recommendedMsg = "";

  if (pdvsCount >= 3) {
    startHour = 12;
    endHour = 23;
    maxMinutes = 45;
    recommendedMsg = "Grade Padrão (12:00 às 23:45)";
  } else {
    startHour = 18;
    endHour = 23;
    maxMinutes = 0;
    recommendedMsg = "Grade Reduzida (18:00 às 23:00) devido a poucos PDVs online";
  }

  const confirmacao = confirm(`Deseja gerar automaticamente a programação IA para hoje?\n\n- Recomendação: ${recommendedMsg}\n- Intervalo: de 15 em 15 minutos\n\nIsso criará uma série de rodadas na fila e salvará no banco.`);
  if (!confirmacao) return;

  btnIaGenerateDay.disabled = true;
  btnIaGenerateDay.innerText = "Gerando Rodadas...";

  try {
    const dataHoje = obterDataHojeLocalString();
    let rodadasGeradas = 0;

    for (let h = startHour; h <= endHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === endHour && m > maxMinutes) break;

        const horaReal = h === 24 ? 0 : h;
        const horaStr = String(horaReal).padStart(2, '0');
        const minStr = String(m).padStart(2, '0');
        const horarioStr = `${horaStr}:${minStr}`;

        // Verifica se já existe uma rodada na fila para hoje neste horário
        const jaExiste = estado.rodadasQueue && estado.rodadasQueue.some(r => r.startDate === dataHoje && r.startTime === horarioStr);
        if (jaExiste) continue;

        // Gera um ID de jogo aleatório de 4 dígitos
        let proximoId;
        let tentativas = 0;
        do {
          const randomNum = Math.floor(1000 + Math.random() * 9000);
          proximoId = `#${randomNum}`;
          tentativas++;
        } while (
          ((estado.rodadasQueue && estado.rodadasQueue.some(r => r.gameId === proximoId)) ||
           estado.gameId === proximoId ||
           estado.nextGameId === proximoId) && 
          tentativas < 100
        );

        const novaRodada = {
          gameId: proximoId,
          prizes: {
            cupom: parseFloat(inputCupom.value) || 2.0,
            quadra: parseFloat(inputQuadra.value) || 50.0,
            quina: parseFloat(inputQuina.value) || 100.0,
            bingo: parseFloat(inputBingo.value) || 250.0,
            acumulado: parseFloat(inputAcumulado.value) || 1000.0
          },
          schedulingMode: 'IA',
          countdownMinutes: null,
          startTime: horarioStr,
          startDate: dataHoje,
          drawSpeed: parseInt(selectDrawSpeed.value) || 3,
          autoStartDraw: inputAutoStart.checked,
          forcedPdvWinner: 'NENHUM',
          forcedRiggingProbability: 75
        };

        estado.rodadasQueue.push(novaRodada);
        rodadasGeradas++;
      }
    }

    if (rodadasGeradas > 0) {
      // Verifica se a rodada atual deve avançar automaticamente
      const activeRoundQueue = estado.rodadasQueue ? estado.rodadasQueue.find(r => r.gameId === estado.gameId) : null;
      const isRoundActive = activeRoundQueue && (activeRoundQueue.status === 'PLAYING' || activeRoundQueue.status === 'FINISHED');

      if (estado.status === 'WAITING' && 
          !isRoundActive &&
          !estado.countdownEndTime && 
          (!estado.drawnBalls || estado.drawnBalls.length === 0)) {
        console.log("[PROGRAMAÇÃO IA] Canal ocioso. Avançando para a primeira rodada programada...");
        const { avancarProximaRodada } = await import('./game.js');
        estado = avancarProximaRodada(estado);
      }

      // Salva no banco
      FirebaseHelper.salvarEstadoJogo(estado);
      alert(`Sucesso! ${rodadasGeradas} rodadas programadas adicionadas à fila para hoje.`);
    } else {
      alert("Nenhuma rodada foi adicionada (todas as rodadas nesta faixa de horário já estão programadas).");
    }
  } catch (err) {
    console.error("Erro ao gerar grade de rodadas IA:", err);
    alert("Erro ao gerar grade: " + err.message);
  } finally {
    btnIaGenerateDay.disabled = false;
    btnIaGenerateDay.innerText = "🤖 Gerar Grade de Rodadas IA para Hoje";
  }
});
