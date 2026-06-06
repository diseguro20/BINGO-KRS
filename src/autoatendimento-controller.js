/**
 * BINGOKRS - Controlador do Autoatendimento Totem (autoatendimento.html)
 */

import { FirebaseHelper } from './firebase-helper.js';
import { gerarCartela90Bolas } from './game.js';

// Estado local
let estado = null;
let ticketPrice = 2.0;
let selectedQty = 3;
let cartelasGeradas = [];
let pollingInterval = null;

// Funções auxiliares para gerar Pix Estático BR Code (EMV)
function formatEMV(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return id + len + value;
}

function calculateCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    crc ^= (charCode << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarPixEstatico(chave, nome, cidade, valor, txid = '***') {
  let payload = '';
  payload += formatEMV('00', '01'); // Format Indicator
  payload += formatEMV('01', '11'); // Único (11)
  
  let merchantInfo = '';
  merchantInfo += formatEMV('00', 'br.gov.bcb.pix');
  merchantInfo += formatEMV('01', chave);
  payload += formatEMV('26', merchantInfo);
  
  payload += formatEMV('52', '0000'); // Merchant Category Code
  payload += formatEMV('53', '986'); // Currency (BRL)
  payload += formatEMV('54', valor.toFixed(2)); // Amount
  payload += formatEMV('58', 'BR'); // Country Code
  payload += formatEMV('59', nome.substring(0, 25)); // Merchant Name
  payload += formatEMV('60', cidade.substring(0, 15)); // Merchant City
  
  let additionalData = formatEMV('05', txid);
  payload += formatEMV('62', additionalData);
  
  payload += '6304';
  const crc = calculateCRC16(payload);
  return payload + crc;
}

// Seletores DOM
const stepSelection = document.getElementById('step-selection');
const stepPayment = document.getElementById('step-payment');
const stepReceipt = document.getElementById('step-receipt');

const formSelection = document.getElementById('form-selection');
const clientPhone = document.getElementById('client-phone');
const clientName = document.getElementById('client-name');
const qtyButtons = document.querySelectorAll('.btn-qty');
const customQty = document.getElementById('custom-qty');
const totalPriceLabel = document.getElementById('total-price-label');
const suggestedGameId = document.getElementById('suggested-game-id');
const selectGameRound = document.getElementById('select-game-round');
const noRoundsWarning = document.getElementById('no-rounds-warning');
const btnSubmitSelection = document.getElementById('btn-submit-selection');

const selectPdvTotem = document.getElementById('select-pdv-totem');

const btnCopyPix = document.getElementById('btn-copy-pix');
const pixCopiaCola = document.getElementById('pix-copia-cola');
const btnSimulatePayment = document.getElementById('btn-simulate-payment');

const selectPrintMode = document.getElementById('select-print-mode');
const btnConnectPrinter = document.getElementById('btn-connect-printer');
const printerIcon = document.getElementById('printer-icon');
const printerStatusLabel = document.getElementById('printer-status-label');
const btnPrintAll = document.getElementById('btn-print-all');
const receiptTicketsList = document.getElementById('receipt-tickets-list');
const btnRestartTotem = document.getElementById('btn-restart-totem');

// ==========================================
// 0. CARREGAR PDVS CADASTRADOS
// ==========================================
let pdvsCadastrados = [];

async function carregarPdvs() {
  try {
    pdvsCadastrados = await FirebaseHelper.listarPdvsCadastrados();
    selectPdvTotem.innerHTML = '';
    
    if (pdvsCadastrados.length === 0) {
      selectPdvTotem.innerHTML = '<option value="">Nenhum PDV cadastrado</option>';
      selectPdvTotem.disabled = true;
      btnSubmitSelection.disabled = true;
      return;
    }
    
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.innerText = '-- Selecione seu estabelecimento --';
    selectPdvTotem.appendChild(defaultOpt);
    
    pdvsCadastrados.forEach(pdv => {
      const opt = document.createElement('option');
      opt.value = pdv.pdvNome;
      opt.innerText = pdv.pdvNome;
      selectPdvTotem.appendChild(opt);
    });
  } catch (err) {
    console.error('Erro ao carregar PDVs:', err);
    selectPdvTotem.innerHTML = '<option value="">Erro ao carregar PDVs</option>';
  }
}

carregarPdvs();

// ==========================================
// 1. MÁSCARA DE TELEFONE CELULAR BRASILEIRO
// ==========================================
clientPhone.addEventListener('input', (e) => {
  let val = e.target.value.replace(/\D/g, '');
  if (val.length > 11) val = val.substring(0, 11);
  
  if (val.length > 10) {
    // (XX) XXXXX-XXXX
    e.target.value = `(${val.substring(0, 2)}) ${val.substring(2, 7)}-${val.substring(7)}`;
  } else if (val.length > 6) {
    // (XX) XXXX-XXXX
    e.target.value = `(${val.substring(0, 2)}) ${val.substring(2, 6)}-${val.substring(6)}`;
  } else if (val.length > 2) {
    e.target.value = `(${val.substring(0, 2)}) ${val.substring(2)}`;
  } else if (val.length > 0) {
    e.target.value = `(${val}`;
  } else {
    e.target.value = '';
  }
});

// ==========================================
// 2. LOGICA DE CÁLCULO E QUANTIDADES
// ==========================================
function updateTotalPrice() {
  const customVal = parseInt(customQty.value);
  const qty = (!isNaN(customVal) && customVal > 0) ? customVal : selectedQty;
  const total = qty * ticketPrice;
  totalPriceLabel.innerText = total.toFixed(2).replace('.', ',');
}

qtyButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    qtyButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedQty = parseInt(btn.getAttribute('data-qty'));
    customQty.value = ''; // limpa customizada
    updateTotalPrice();
  });
});

customQty.addEventListener('input', () => {
  if (customQty.value) {
    qtyButtons.forEach(b => b.classList.remove('active'));
  } else {
    const matchingBtn = Array.from(qtyButtons).find(b => parseInt(b.getAttribute('data-qty')) === selectedQty);
    if (matchingBtn) matchingBtn.classList.add('active');
  }
  updateTotalPrice();
});

// ==========================================
// 3. NAVEGAÇÃO ENTRE PASSOS (WIZARD)
// ==========================================
function transitionTo(stepId) {
  [stepSelection, stepPayment, stepReceipt].forEach(sec => {
    sec.classList.remove('active');
  });
  document.getElementById(stepId).classList.add('active');
}

// Submeter identificação e ir para Pix
formSelection.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const selectedPdv = selectPdvTotem.value;
  if (!selectedPdv) {
    alert('Por favor, selecione o estabelecimento (PDV) onde você está comprando.');
    return;
  }
  
  const phone = clientPhone.value.trim();
  if (!phone || phone.length < 14) {
    alert('Por favor, insira um celular válido no formato (XX) 99999-9999.');
    return;
  }
  
  // Avança para tela de pagamento e dispara a geração do Pix
  transitionTo('step-payment');
  await gerarPixCobrançaTotem();
});

// Lógica de finalização de venda realizada com sucesso
async function finalizarVendaRealizada() {
  const phone = clientPhone.value.trim();
  const name = clientName.value.trim() || 'Cliente Totem';
  const customVal = parseInt(customQty.value);
  const qty = (!isNaN(customVal) && customVal > 0) ? customVal : selectedQty;
  
  const targetGameId = selectGameRound.value;
  if (!targetGameId) {
    throw new Error("Nenhum sorteio selecionado ou disponível.");
  }
  
  const cartelas = [];
  for (let i = 0; i < qty; i++) {
    cartelas.push(gerarCartela90Bolas(selectPdvTotem.value || "Autoatendimento", targetGameId));
  }
  
  await FirebaseHelper.registrarCartelasVenda(cartelas, { nome: name, celular: phone });
  cartelasGeradas = cartelas;
  renderizarRecibosVisual(cartelas);
  transitionTo('step-receipt');
}

// Gera cobrança Pix com base nas credenciais cadastradas pelo administrador
async function gerarPixCobrançaTotem() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  const customVal = parseInt(customQty.value);
  const qty = (!isNaN(customVal) && customVal > 0) ? customVal : selectedQty;
  const amount = qty * ticketPrice;
  const name = clientName.value.trim() || 'Cliente Totem';

  const qrCodeBox = document.querySelector('.qr-code-box');
  const paymentStatusText = document.querySelector('.payment-status-box span');
  const paymentStatusSpinner = document.querySelector('.payment-status-box .spinner');

  if (paymentStatusSpinner) paymentStatusSpinner.style.display = 'block';
  paymentStatusText.innerText = 'Aguardando confirmação do pagamento...';

  try {
    const config = await FirebaseHelper.buscarConfiguracaoGateway();

    if (!config) {
      console.warn("Nenhum gateway configurado. Usando Pix Estático de demonstração.");
      const demoPayload = gerarPixEstatico("krsbingo-auto-pix-key-placeholder", "KRS BINGO", "SAO PAULO", amount);
      pixCopiaCola.value = demoPayload;
      
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(demoPayload)}`;
      qrCodeBox.innerHTML = `<img src="${qrUrl}" alt="Pix QR Code" style="max-width: 200px; display: block;" />`;
      if (paymentStatusSpinner) paymentStatusSpinner.style.display = 'none';
      paymentStatusText.innerText = 'Pix Estático de Testes Gerado. Efetue o pagamento e simule aprovação.';
      return;
    }

    if (config.type === 'estatico') {
      const chave = config.estaticoChave || "krsbingo-auto-pix-key-placeholder";
      const nome = config.estaticoNome || "KRS BINGO";
      const cidade = config.estaticoCidade || "SAO PAULO";
      
      const payload = gerarPixEstatico(chave, nome, cidade, amount);
      pixCopiaCola.value = payload;

      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`;
      qrCodeBox.innerHTML = `<img src="${qrUrl}" alt="Pix QR Code" style="max-width: 200px; display: block;" />`;
      
      paymentStatusText.innerText = 'Pix Estático Gerado. Realize o pagamento e confirme.';
      if (paymentStatusSpinner) paymentStatusSpinner.style.display = 'none';

    } else if (config.type === 'mercadopago') {
      const accessToken = config.mpToken;
      const chavePix = config.mpChavePix;
      
      if (!accessToken) {
        throw new Error("Token do Mercado Pago não configurado.");
      }

      const idempotencyKey = 'idemp_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      
      try {
        paymentStatusText.innerText = 'Gerando Pix no Mercado Pago...';
        
        const response = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": idempotencyKey
          },
          body: JSON.stringify({
            transaction_amount: parseFloat(amount.toFixed(2)),
            description: `KRS BINGO - ${qty} cartelas`,
            payment_method_id: "pix",
            payer: {
              email: "cliente@totem.com",
              first_name: name.split(' ')[0] || "Cliente",
              last_name: name.split(' ').slice(1).join(' ') || "Totem",
              identification: {
                type: "CPF",
                number: "00000000000"
              }
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP ${response.status}`);
        }

        const paymentData = await response.json();
        
        const pixPayload = paymentData.point_of_interaction.transaction_data.qr_code;
        const qrCodeBase64 = paymentData.point_of_interaction.transaction_data.qr_code_base64;
        const paymentId = paymentData.id;

        pixCopiaCola.value = pixPayload;
        qrCodeBox.innerHTML = `<img src="data:image/png;base64,${qrCodeBase64}" alt="Pix QR Code" style="max-width: 200px; display: block;" />`;
        
        paymentStatusText.innerText = 'Aguardando pagamento automático...';

        // Iniciar polling de 5 segundos
        pollingInterval = setInterval(async () => {
          try {
            const checkRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
              headers: {
                "Authorization": `Bearer ${accessToken}`
              }
            });
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.status === 'approved') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                paymentStatusText.innerText = 'Pagamento aprovado com sucesso!';
                
                try {
                  await finalizarVendaRealizada();
                } catch (vendaErr) {
                  console.error("Erro ao faturar venda automatica:", vendaErr);
                  alert("Pagamento recebido, mas houve um erro ao registrar as cartelas: " + vendaErr.message);
                }
              } else if (checkData.status === 'rejected' || checkData.status === 'cancelled') {
                clearInterval(pollingInterval);
                pollingInterval = null;
                paymentStatusText.innerText = 'Pagamento recusado/cancelado. Tente novamente.';
                if (paymentStatusSpinner) paymentStatusSpinner.style.display = 'none';
              }
            }
          } catch (pollingErr) {
            console.error("Erro ao verificar status do pagamento:", pollingErr);
          }
        }, 5000);

      } catch (mpErr) {
        console.warn("Mercado Pago API failed or CORS blocked. Falling back to Static Pix.", mpErr);
        
        // Fallback para Pix Estático usando mpChavePix ou estaticoChave
        const fallbackChave = chavePix || config.estaticoChave || "krsbingo-auto-pix-key-placeholder";
        const fallbackNome = config.estaticoNome || "KRS BINGO";
        const fallbackCidade = config.estaticoCidade || "SAO PAULO";
        
        const payload = gerarPixEstatico(fallbackChave, fallbackNome, fallbackCidade, amount);
        pixCopiaCola.value = payload;

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload)}`;
        qrCodeBox.innerHTML = `<img src="${qrUrl}" alt="Pix QR Code" style="max-width: 200px; display: block;" />`;
        
        paymentStatusText.innerText = 'Aprovação manual (Fallback Pix): Realize o pagamento e confirme.';
        if (paymentStatusSpinner) paymentStatusSpinner.style.display = 'none';
      }
    }
  } catch (err) {
    console.error("Erro geral na geração do Pix:", err);
    paymentStatusText.innerText = 'Erro ao gerar Pix. Use a simulação abaixo para testar.';
    if (paymentStatusSpinner) paymentStatusSpinner.style.display = 'none';
  }
}

// ==========================================
// 4. PAGAMENTO SIMULADO E COPÍA E COLA
// ==========================================
btnCopyPix.addEventListener('click', () => {
  const pixStr = pixCopiaCola.value;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(pixStr).then(() => {
      btnCopyPix.innerText = 'Copiado!';
      btnCopyPix.style.background = 'var(--success)';
      setTimeout(() => {
        btnCopyPix.innerText = 'Copiar';
        btnCopyPix.style.background = '';
      }, 2000);
    }).catch(() => {
      fallbackCopyText(pixStr);
    });
  } else {
    fallbackCopyText(pixStr);
  }
});

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    btnCopyPix.innerText = 'Copiado!';
    btnCopyPix.style.background = 'var(--success)';
    setTimeout(() => {
      btnCopyPix.innerText = 'Copiar';
      btnCopyPix.style.background = '';
    }, 2000);
  } catch (err) {
    alert('Erro ao copiar Pix automaticamente. Copie o texto manualmente.');
  }
  document.body.removeChild(textArea);
}

btnSimulatePayment.addEventListener('click', async () => {
  btnSimulatePayment.disabled = true;
  btnSimulatePayment.innerText = '💰 Confirmando Transação...';
  
  try {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    await finalizarVendaRealizada();
  } catch (err) {
    alert("Erro ao faturar compra: " + err.message);
    btnSimulatePayment.disabled = false;
    btnSimulatePayment.innerText = '💰 Simular Pagamento Aprovado (Pix Pago)';
  }
});

// ==========================================
// 5. RENDERIZAÇÃO DAS CARTELAS EM CUPONS
// ==========================================
function renderizarRecibosVisual(cartelas) {
  receiptTicketsList.innerHTML = '';
  const dataSorteio = estado ? estado.dataSorteio : new Date().toLocaleDateString('pt-BR');
  
  cartelas.forEach(card => {
    const ticketDiv = document.createElement('div');
    ticketDiv.className = 'printable-ticket';
    
    // Nome do Bingo
    const brand = document.createElement('div');
    brand.className = 'ticket-brand';
    brand.innerText = 'KRS BINGO';
    ticketDiv.appendChild(brand);
    
    // Detalhes da Compra
    const details = document.createElement('div');
    details.className = 'ticket-details';
    details.innerHTML = `
      <strong>PDV:</strong> ${card.pdv}<br>
      <strong>Sorteio:</strong> #${card.gameId}<br>
      <strong>Data:</strong> ${dataSorteio}<br>
      <strong>Cliente:</strong> ${card.clienteNome}<br>
      <strong>Contato:</strong> ${card.clienteCelular}<br>
    `;
    ticketDiv.appendChild(details);
    
    // Código da Cartela
    const cardCode = document.createElement('div');
    cardCode.className = 'ticket-card-code';
    cardCode.innerHTML = `CARTELA: <span>${card.id}</span>`;
    ticketDiv.appendChild(cardCode);
    
    // Grid 3x9
    const gridContainer = document.createElement('div');
    gridContainer.className = 'cartela-grid-3x9 printable';
    
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const val = card.gridFlat[r * 9 + c];
        const cell = document.createElement('div');
        if (val === null || val === undefined) {
          cell.className = 'cell empty';
        } else {
          cell.className = 'cell';
          cell.innerText = val.toString().padStart(2, '0');
        }
        gridContainer.appendChild(cell);
      }
    }
    ticketDiv.appendChild(gridContainer);
    
    // Preço individual
    const priceDiv = document.createElement('div');
    priceDiv.className = 'ticket-price';
    priceDiv.innerText = `VALOR DO CUPOM: R$ ${ticketPrice.toFixed(2).replace('.', ',')}`;
    ticketDiv.appendChild(priceDiv);
    
    // Código de Barras
    const barcodeDiv = document.createElement('div');
    barcodeDiv.className = 'ticket-barcode';
    barcodeDiv.innerText = `||||| |||| || ||||| ${card.id}`;
    ticketDiv.appendChild(barcodeDiv);
    
    receiptTicketsList.appendChild(ticketDiv);
  });
}

// ==========================================
// 6. IMPRESSÃO BLUETOOTH E ESC/POS (REAPROVEITADO)
// ==========================================
let printerCharacteristic = null;
let bluetoothDevice = null;
let selectedPrintMode = localStorage.getItem('bingokrs_print_mode') || 'RAWBT';

if (selectPrintMode) {
  selectPrintMode.value = selectedPrintMode;
}
atualizarUIImpressoraStatus();

if (selectPrintMode) {
  selectPrintMode.addEventListener('change', (e) => {
    selectedPrintMode = e.target.value;
    localStorage.setItem('bingokrs_print_mode', selectedPrintMode);
    atualizarUIImpressoraStatus();
  });
}

function atualizarUIImpressoraStatus() {
  if (!btnConnectPrinter || !printerStatusLabel || !printerIcon) return;

  if (selectedPrintMode === 'RAWBT') {
    printerStatusLabel.innerText = "Modo: App RawBT";
    btnConnectPrinter.style.background = "rgba(0, 243, 255, 0.1)";
    btnConnectPrinter.style.borderColor = "var(--neon-cyan)";
    btnConnectPrinter.style.color = "var(--neon-cyan)";
    printerIcon.innerText = "📲";
  } else if (selectedPrintMode === 'NAV') {
    printerStatusLabel.innerText = "Modo: Navegador";
    btnConnectPrinter.style.background = "rgba(255, 255, 255, 0.05)";
    btnConnectPrinter.style.borderColor = "var(--prog-border)";
    btnConnectPrinter.style.color = "var(--text-muted)";
    printerIcon.innerText = "📄";
  } else if (selectedPrintMode === 'BLE') {
    printerIcon.innerText = "📶";
    if (printerCharacteristic) {
      const pName = localStorage.getItem('bingokrs_bt_printer_name') || "Impressora BLE";
      printerStatusLabel.innerText = pName;
      btnConnectPrinter.style.background = "rgba(0, 230, 118, 0.15)";
      btnConnectPrinter.style.borderColor = "var(--success)";
      btnConnectPrinter.style.color = "var(--success)";
    } else {
      printerStatusLabel.innerText = "Desconectada";
      btnConnectPrinter.style.background = "rgba(255, 23, 68, 0.15)";
      btnConnectPrinter.style.borderColor = "var(--danger)";
      btnConnectPrinter.style.color = "var(--danger)";
    }
  }
}

async function conectarImpressoraBluetooth() {
  try {
    printerStatusLabel.innerText = "Buscando...";
    
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '00001101-0000-1000-8000-00805f9b34fb',
        'e7e1a12c-4527-11e4-8988-041f72c48976'
      ]
    });

    const server = await bluetoothDevice.gatt.connect();
    
    let service = null;
    const serviceUUIDs = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7e1a12c-4527-11e4-8988-041f72c48976'
    ];
    
    for (const uuid of serviceUUIDs) {
      try {
        service = await server.getPrimaryService(uuid);
        if (service) break;
      } catch (e) {
        console.warn(`Serviço BLE ${uuid} não disponível, tentando...`);
      }
    }
    
    if (!service) {
      const services = await server.getPrimaryServices();
      if (services.length > 0) {
        service = services[0];
      } else {
        throw new Error("Nenhum serviço disponível.");
      }
    }
    
    const characteristics = await service.getCharacteristics();
    printerCharacteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
    
    if (!printerCharacteristic) {
      throw new Error("Escrita não suportada na impressora.");
    }

    const deviceName = bluetoothDevice.name || "Impressora BLE";
    localStorage.setItem('bingokrs_bt_printer_name', deviceName);
    
    atualizarUIImpressoraStatus();
    alert(`Impressora Bluetooth ${deviceName} conectada com sucesso!`);
  } catch (err) {
    console.error("Erro BLE:", err);
    bluetoothDevice = null;
    printerCharacteristic = null;
    atualizarUIImpressoraStatus();
    alert("Falha na conexão: " + err.message);
  }
}

if (btnConnectPrinter) {
  btnConnectPrinter.addEventListener('click', async () => {
    if (selectedPrintMode === 'RAWBT') {
      alert("No modo 'App RawBT', o aplicativo RawBT Android conecta nativamente ao bluetooth clássico do seu PAX Moderninha. Não é preciso parear no browser.");
      return;
    }
    if (selectedPrintMode === 'NAV') {
      alert("No modo 'Navegador', o browser abre o menu do sistema operacional para imprimir.");
      return;
    }
    if (!navigator.bluetooth) {
      alert("Web Bluetooth requer HTTPS ou localhost para funcionar.");
      return;
    }
    await conectarImpressoraBluetooth();
  });
}

function stringToUint8Array(str) {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i) & 0xff;
  }
  return arr;
}

function formatarReciboTexto(card, dataSorteio) {
  let text = "";
  text += "\x1b\x40"; // Inicializa impressora (ESC @)
  text += "\x1b\x61\x01"; // Alinhamento centralizado (ESC a 1)
  text += "\x1d\x21\x11"; // Letra tamanho duplo (GS ! 17)
  text += "KRS BINGO\n";
  text += "\x1d\x21\x00"; // Letra tamanho normal (GS ! 0)
  text += "--------------------------------\n";
  text += `PDV: ${card.pdv}\n`;
  text += `Sorteio: #${card.gameId}\n`;
  text += `Data: ${dataSorteio}\n`;
  text += `Cliente: ${card.clienteNome || ''}\n`;
  text += `Celular: ${card.clienteCelular || ''}\n`;
  text += "--------------------------------\n";
  text += "\x1d\x21\x01"; // Altura dupla (GS ! 1)
  text += `CARTELA: ${card.id}\n`;
  text += "\x1d\x21\x00"; // Normal
  text += "--------------------------------\n\n";

  // Desenhar a tabela da cartela
  text += "+-------------------------------+\n";
  for (let r = 0; r < 3; r++) {
    let rowText = "| ";
    for (let c = 0; c < 9; c++) {
      const val = card.gridFlat[r * 9 + c];
      if (val === null || val === undefined) {
        rowText += "   "; // Célula vazia
      } else {
        rowText += val.toString().padStart(2, '0') + " ";
      }
    }
    rowText += "|\n";
    text += rowText;
  }
  text += "+-------------------------------+\n\n";

  text += "--------------------------------\n";
  text += `VALOR DO CUPOM: R$ ${ticketPrice.toFixed(2).replace('.', ',')}\n`;
  text += "Boa Sorte! Obrigado.\n\n\n\n\n";
  text += "\x1d\x56\x01"; // Comando de corte parcial (GS V 1)
  return text;
}

btnPrintAll.addEventListener('click', async () => {
  if (cartelasGeradas.length === 0) return;

  const dataSorteio = estado ? estado.dataSorteio : new Date().toLocaleDateString('pt-BR');
  
  if (selectedPrintMode === 'NAV') {
    window.print();
  } else if (selectedPrintMode === 'RAWBT') {
    try {
      let textoCompleto = "";
      cartelasGeradas.forEach(card => {
        textoCompleto += formatarReciboTexto(card, dataSorteio);
      });
      
      const base64Data = btoa(textoCompleto);
      const rawbtIntent = `intent:#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;S.base64=${base64Data};end;`;
      window.location.href = rawbtIntent;
    } catch (e) {
      alert("Erro ao disparar aplicativo RawBT. Instale o app RawBT no terminal PAX Android.");
    }
  } else if (selectedPrintMode === 'BLE') {
    if (!printerCharacteristic) {
      alert("Nenhuma impressora Bluetooth conectada. Conecte pelo botão no topo.");
      return;
    }

    btnPrintAll.disabled = true;
    btnPrintAll.innerText = 'Imprimindo...';

    try {
      let textoCompleto = "";
      cartelasGeradas.forEach(card => {
        textoCompleto += formatarReciboTexto(card, dataSorteio);
      });

      const bytes = stringToUint8Array(textoCompleto);
      
      const fatias = 20;
      for (let i = 0; i < bytes.length; i += fatias) {
        const fatia = bytes.slice(i, i + fatias);
        await printerCharacteristic.writeValue(fatia);
      }
      
      alert("Impressão concluída!");
    } catch (err) {
      alert("Erro BLE: " + err.message);
    } finally {
      btnPrintAll.disabled = false;
      btnPrintAll.innerText = '🖨️ Imprimir Todas';
    }
  }
});

// Reiniciar totem
btnRestartTotem.addEventListener('click', () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  clientPhone.value = '';
  clientName.value = '';
  customQty.value = '';
  
  qtyButtons.forEach(b => b.classList.remove('active'));
  const defaultBtn = Array.from(qtyButtons).find(b => parseInt(b.getAttribute('data-qty')) === 3);
  if (defaultBtn) defaultBtn.classList.add('active');
  selectedQty = 3;
  
  cartelasGeradas = [];
  
  btnSimulatePayment.disabled = false;
  btnSimulatePayment.innerText = '💰 Simular Pagamento Aprovado (Pix Pago)';
  
  updateTotalPrice();
  transitionTo('step-selection');
});

// ==========================================
// 7. INICIALIZAÇÃO E ASSINATURA EM TEMPO REAL
// ==========================================

// Listener de mudança na rodada selecionada
selectGameRound.addEventListener('change', () => {
  const selectedOpt = selectGameRound.options[selectGameRound.selectedIndex];
  if (selectedOpt) {
    const selectedGameIdVal = selectedOpt.value;
    const selectedPriceVal = parseFloat(selectedOpt.getAttribute('data-price'));
    
    suggestedGameId.innerText = selectedGameIdVal;
    ticketPrice = selectedPriceVal;
    localStorage.setItem('bingokrs_cupom_temp', ticketPrice.toString());
    updateTotalPrice();
  }
});

FirebaseHelper.assinarEstadoJogo((gameData) => {
  estado = gameData;
  if (estado) {
    // Compilar rodadas disponíveis
    const availableRounds = [];
    
    // Se a partida atual no Firebase estiver aguardando apostas
    if (estado.status === 'WAITING' && estado.gameId) {
      const activePrice = parseFloat(estado.prizes?.cupom || 2.0);
      availableRounds.push({
        gameId: estado.gameId,
        price: activePrice,
        label: `Rodada ${estado.gameId} (Próxima Ativa) - R$ ${activePrice.toFixed(2).replace('.', ',')}`
      });
    }
    
    // Rodadas futuras programadas na fila
    if (estado.rodadasQueue && Array.isArray(estado.rodadasQueue)) {
      estado.rodadasQueue.forEach(item => {
        // Evita duplicar a rodada ativa
        if (item.gameId === estado.gameId && estado.status === 'WAITING') return;
        
        const price = parseFloat(item.prizes?.cupom || 2.0);
        const timeStr = item.startTime ? ` às ${item.startTime}` : '';
        const dateStr = item.startDate ? ` em ${item.startDate}` : '';
        availableRounds.push({
          gameId: item.gameId,
          price: price,
          label: `Rodada ${item.gameId} - R$ ${price.toFixed(2).replace('.', ',')}${dateStr}${timeStr}`
        });
      });
    }
    
    // Sincronizar UI se não houver rodadas válidas (bloqueio de vendas)
    if (availableRounds.length === 0) {
      noRoundsWarning.style.display = 'block';
      btnSubmitSelection.disabled = true;
      
      clientPhone.disabled = true;
      clientName.disabled = true;
      customQty.disabled = true;
      qtyButtons.forEach(b => b.disabled = true);
      selectGameRound.disabled = true;
      
      selectGameRound.innerHTML = '<option value="">Nenhuma rodada programada</option>';
      suggestedGameId.innerText = '--';
      ticketPrice = 2.0;
    } else {
      noRoundsWarning.style.display = 'none';
      btnSubmitSelection.disabled = false;
      
      clientPhone.disabled = false;
      clientName.disabled = false;
      customQty.disabled = false;
      qtyButtons.forEach(b => b.disabled = false);
      selectGameRound.disabled = false;
      
      // Salva valor selecionado anteriormente
      const prevSelected = selectGameRound.value;
      
      // Preenche select
      selectGameRound.innerHTML = '';
      availableRounds.forEach(round => {
        const opt = document.createElement('option');
        opt.value = round.gameId;
        opt.setAttribute('data-price', round.price.toString());
        opt.innerText = round.label;
        selectGameRound.appendChild(opt);
      });
      
      // Restaura seleção anterior se ainda estiver disponível
      if (prevSelected && availableRounds.some(r => r.gameId === prevSelected)) {
        selectGameRound.value = prevSelected;
      }
      
      // Sincroniza dados da rodada selecionada
      const selectedOpt = selectGameRound.options[selectGameRound.selectedIndex];
      if (selectedOpt) {
        const selectedGameIdVal = selectedOpt.value;
        const selectedPriceVal = parseFloat(selectedOpt.getAttribute('data-price'));
        
        suggestedGameId.innerText = selectedGameIdVal;
        ticketPrice = selectedPriceVal;
        localStorage.setItem('bingokrs_cupom_temp', ticketPrice.toString());
      }
    }
    
    updateTotalPrice();
  }
});
