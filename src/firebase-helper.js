/**
 * BINGOKRS - Adaptador de Sincronização em Tempo Real (Firebase & Fallback Local)
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { 
  getFirestore, doc, onSnapshot, setDoc, getDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, runTransaction 
} from 'firebase/firestore';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged 
} from 'firebase/auth';

// Cole suas configurações reais do Firebase Console aqui
export const firebaseConfig = {
  apiKey: "AIzaSyD5IxLkYGOpmo-HVyDv8rMZMly6jtyypQA",
  authDomain: "krs-bingo.firebaseapp.com",
  projectId: "krs-bingo",
  storageBucket: "krs-bingo.firebasestorage.app",
  messagingSenderId: "538951213822",
  appId: "1:538951213822:web:fa9498761479dc5360fbaf"
};

// Verifica se o Firebase está configurado com chaves reais
const isFirebaseConfigured = 
  firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== "SUA_API_KEY" && 
  firebaseConfig.projectId !== "SEU_PROJETO";

// Instâncias do Firebase (nulas caso esteja no modo fallback local)
let app = null;
let db = null;
let auth = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("[FIREBASE] Conectado ao Firestore e Auth na nuvem com sucesso.");
  } catch (error) {
    console.error("[FIREBASE] Erro ao inicializar o Firebase SDK:", error);
  }
} else {
  console.warn("[FIREBASE] Rodando no MODO SIMULADO (LocalStorage + BroadcastChannel). Insira suas chaves no firebase-helper.js para usar a nuvem.");
}

// Canal de comunicação local (Fallback e eventos secundários)
const localChannel = new BroadcastChannel('bingo-channel');

export const FirebaseHelper = {
  
  // ==========================================
  // 1. SISTEMA DE AUTENTICAÇÃO (OPERADORES / ADMIN)
  // ==========================================

  /**
   * Realiza login do operador ou admin
   */
  async login(email, password) {
    if (isFirebaseConfigured && auth) {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const docRef = doc(db, "operadores", userCredential.user.uid);
      const userDoc = await getDoc(docRef);
      let profile;
      if (userDoc.exists()) {
        profile = userDoc.data();
      } else {
        // Cria automaticamente o perfil no Firestore se for o email de administrador
        if (email.toLowerCase() === "admin@bingo.com") {
          profile = {
            uid: userCredential.user.uid,
            email: email,
            nome: "Administrador",
            pdvNome: "Administrador",
            tipo: "admin"
          };
        } else {
          profile = {
            uid: userCredential.user.uid,
            email: email,
            nome: "Operador de Caixa",
            pdvNome: "Caixa Geral",
            tipo: "operador"
          };
        }
        await setDoc(docRef, profile);
      }
      return { user: userCredential.user, profile };
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_operadores') || '[]';
      const operadores = JSON.parse(saved);
      const op = operadores.find(o => o.email === email && o.password === password);
      if (op) {
        localStorage.setItem('bingokrs_sessao_atual', JSON.stringify(op));
        localChannel.postMessage({ type: 'AUTH_CHANGED' });
        return { user: { uid: op.uid, email: op.email }, profile: op };
      }
      // Criar conta admin padrão simulada se for o primeiro login
      if (email === "admin@bingo.com" && password === "admin123") {
        const adminOp = { uid: "admin-id", email, pdvNome: "Administrador", tipo: "admin" };
        localStorage.setItem('bingokrs_sessao_atual', JSON.stringify(adminOp));
        localChannel.postMessage({ type: 'AUTH_CHANGED' });
        return { user: { uid: "admin-id", email }, profile: adminOp };
      }
      throw new Error("E-mail ou senha incorretos.");
    }
  },

  /**
   * Cadastra um novo operador de PDV
   */
  async cadastrarOperador(email, password, pdvNome, operadorName, tipo = "operador") {
    if (isFirebaseConfigured && auth && db) {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const profile = {
        uid: userCredential.user.uid,
        email,
        nome: operadorName,
        pdvNome: pdvNome.trim(),
        tipo
      };
      // Salva dados no Firestore
      await setDoc(doc(db, "operadores", userCredential.user.uid), profile);
      return { user: userCredential.user, profile };
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_operadores') || '[]';
      const operadores = JSON.parse(saved);
      if (operadores.some(o => o.email === email)) {
        throw new Error("E-mail já cadastrado.");
      }
      const profile = {
        uid: "user-" + Date.now(),
        email,
        password, // Simulação simples
        nome: operadorName,
        pdvNome: pdvNome.trim(),
        tipo
      };
      operadores.push(profile);
      localStorage.setItem('bingokrs_operadores', JSON.stringify(operadores));
      // Loga automaticamente
      localStorage.setItem('bingokrs_sessao_atual', JSON.stringify(profile));
      localChannel.postMessage({ type: 'AUTH_CHANGED' });
      return { user: { uid: profile.uid, email }, profile };
    }
  },

  async cadastrarOperadorComAutorizacao(emailNovo, passwordNovo, pdvNome, operadorName, emailAutorizador, passwordAutorizador) {
    if (isFirebaseConfigured && auth && db) {
      let profileAuth;
      let tempApp = null;
      try {
        // Inicializa um Firebase App secundário e temporário para não interferir na sessão principal
        tempApp = initializeApp(firebaseConfig, "TempAuthApp_" + Date.now());
        const tempAuth = getAuth(tempApp);
        const tempDb = getFirestore(tempApp);
        
        const userCredAuth = await signInWithEmailAndPassword(tempAuth, emailAutorizador.trim(), passwordAutorizador);
        const docRef = doc(tempDb, "operadores", userCredAuth.user.uid);
        const userDoc = await getDoc(docRef);
        
        if (!userDoc.exists()) {
          throw new Error("Perfil do autorizador não encontrado.");
        }
        profileAuth = userDoc.data();
        
        if (profileAuth.tipo !== 'operador' && profileAuth.tipo !== 'admin') {
          throw new Error("Apenas operadores ativos ou administradores podem autorizar.");
        }
      } catch (err) {
        throw new Error("Autorização falhou: E-mail ou senha do autorizador incorretos ou permissão insuficiente. " + err.message);
      } finally {
        if (tempApp) {
          try {
            await deleteApp(tempApp);
          } catch (e) {
            console.error("Erro ao deletar app temporário:", e);
          }
        }
      }

      // 2. Autorização confirmada, cria o novo operador e faz login
      const userCredential = await createUserWithEmailAndPassword(auth, emailNovo.trim(), passwordNovo);
      const profile = {
        uid: userCredential.user.uid,
        email: emailNovo.trim(),
        nome: operadorName,
        pdvNome: pdvNome.trim(),
        tipo: "operador"
      };
      
      await setDoc(doc(db, "operadores", userCredential.user.uid), profile);
      return { user: userCredential.user, profile };
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_operadores') || '[]';
      const operadores = JSON.parse(saved);
      
      // Procura o autorizador
      const autorizador = operadores.find(o => o.email === emailAutorizador.trim() && o.password === passwordAutorizador);
      const isAdminSimulado = (emailAutorizador.trim() === "admin@bingo.com" && passwordAutorizador === "admin123");
      
      if (!autorizador && !isAdminSimulado) {
        throw new Error("Autorização falhou: Apenas um operador ou admin cadastrado no sistema pode autorizar a criação.");
      }

      if (operadores.some(o => o.email === emailNovo.trim())) {
        throw new Error("E-mail do novo operador já cadastrado.");
      }
      
      const profile = {
        uid: "user-" + Date.now(),
        email: emailNovo.trim(),
        password: passwordNovo,
        nome: operadorName,
        pdvNome: pdvNome.trim(),
        tipo: "operador"
      };
      
      operadores.push(profile);
      localStorage.setItem('bingokrs_operadores', JSON.stringify(operadores));
      // Loga automaticamente
      localStorage.setItem('bingokrs_sessao_atual', JSON.stringify(profile));
      localChannel.postMessage({ type: 'AUTH_CHANGED' });
      return { user: { uid: profile.uid, email: emailNovo.trim() }, profile };
    }
  },

  /**
   * Encerra a sessão
   */
  async logout() {
    if (isFirebaseConfigured && auth) {
      await signOut(auth);
    } else {
      localStorage.removeItem('bingokrs_sessao_atual');
      localChannel.postMessage({ type: 'AUTH_CHANGED' });
    }
  },

  /**
   * Escuta alterações de estado de login
   */
  assinarAutenticacao(callback) {
    if (isFirebaseConfigured && auth && db) {
      return onAuthStateChanged(auth, async (user) => {
        if (user) {
          const userDoc = await getDoc(doc(db, "operadores", user.uid));
          if (userDoc.exists()) {
            callback(user, userDoc.data());
          } else {
            callback(user, { pdvNome: "Caixa Geral", tipo: "operador" });
          }
        } else {
          callback(null, null);
        }
      });
    } else {
      // MODO SIMULADO
      const checkSession = () => {
        const session = localStorage.getItem('bingokrs_sessao_atual');
        if (session) {
          const profile = JSON.parse(session);
          callback({ uid: profile.uid, email: profile.email }, profile);
        } else {
          callback(null, null);
        }
      };

      const listener = (event) => {
        if (event.data && event.data.type === 'AUTH_CHANGED') {
          checkSession();
        }
      };

      localChannel.addEventListener('message', listener);
      checkSession();

      return () => {
        localChannel.removeEventListener('message', listener);
      };
    }
  },

  // ==========================================
  // 2. SINCRONIZAÇÃO DE ESTADO DO JOGO E FILA
  // ==========================================

  /**
   * Salva o estado do jogo
   */
  async salvarEstadoJogo(estado) {
    if (isFirebaseConfigured && db) {
      try {
        await setDoc(doc(db, "partidas", "atual"), estado);
      } catch (e) {
        console.error("Erro ao salvar no Firestore:", e);
      }
    } else {
      // MODO SIMULADO
      localStorage.setItem('bingokrs_game_state', JSON.stringify(estado));
      localChannel.postMessage({ type: 'STATE_UPDATE', state: estado });
    }
  },

  /**
   * Assina atualizações de estado do jogo em tempo real
   */
  assinarEstadoJogo(callback) {
    if (isFirebaseConfigured && db) {
      return onSnapshot(doc(db, "partidas", "atual"), async (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data());
        } else {
          // Documento não existe ainda (projeto novo) — cria estado inicial
          console.log("[FIREBASE] Documento 'partidas/atual' não encontrado. Criando estado inicial...");
          try {
            const { criarEstadoInicial } = await import('./game.js');
            const estadoInicial = criarEstadoInicial();
            await setDoc(doc(db, "partidas", "atual"), estadoInicial);
            console.log("[FIREBASE] Estado inicial criado com sucesso no Firestore.");
            // O onSnapshot vai disparar de novo com o novo doc
          } catch (err) {
            console.error("[FIREBASE] Erro ao criar estado inicial:", err);
          }
        }
      });
    } else {
      // MODO SIMULADO
      const listener = (event) => {
        if (event.data && event.data.type === 'STATE_UPDATE') {
          callback(event.data.state);
        }
      };
      localChannel.addEventListener('message', listener);

      const saved = localStorage.getItem('bingokrs_game_state');
      if (saved) {
        try {
          callback(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }

      return () => {
        localChannel.removeEventListener('message', listener);
      };
    }
  },

  // ==========================================
  // 3. SISTEMA DE CLIENTES (CADASTRO E CONSULTA)
  // ==========================================

  /**
   * Busca um cliente pelo número de celular
   */
  async buscarClientePorCelular(celular) {
    const celLimpo = celular.replace(/\D/g, '');
    if (!celLimpo) return null;

    if (isFirebaseConfigured && db) {
      const q = query(collection(db, "clientes"), where("celular", "==", celLimpo));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        return querySnap.docs[0].data();
      }
      return null;
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_clientes') || '[]';
      const clientes = JSON.parse(saved);
      const c = clientes.find(cli => cli.celular === celLimpo);
      return c || null;
    }
  },

  /**
   * Cadastra ou atualiza compras de um cliente
   */
  async cadastrarOuAtualizarCliente(nome, celular, cpf, quantidadeNovasCartelas) {
    const celLimpo = celular.replace(/\D/g, '');
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (!celLimpo) return null;

    const dadosCliente = {
      nome: nome.trim(),
      celular: celLimpo,
      cpf: cpfLimpo,
      dataUltimaCompra: Date.now()
    };

    if (isFirebaseConfigured && db) {
      const q = query(collection(db, "clientes"), where("celular", "==", celLimpo));
      const querySnap = await getDocs(q);

      if (!querySnap.empty) {
        const docRef = querySnap.docs[0].ref;
        const cliAtual = querySnap.docs[0].data();
        dadosCliente.totalCartelasCompradas = (cliAtual.totalCartelasCompradas || 0) + quantidadeNovasCartelas;
        await updateDoc(docRef, dadosCliente);
      } else {
        dadosCliente.dataCadastro = Date.now();
        dadosCliente.totalCartelasCompradas = quantidadeNovasCartelas;
        await setDoc(doc(collection(db, "clientes")), dadosCliente);
      }
      return dadosCliente;
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_clientes') || '[]';
      const clientes = JSON.parse(saved);
      let idx = clientes.findIndex(cli => cli.celular === celLimpo);

      if (idx !== -1) {
        clientes[idx].nome = dadosCliente.nome;
        clientes[idx].cpf = dadosCliente.cpf;
        clientes[idx].totalCartelasCompradas = (clientes[idx].totalCartelasCompradas || 0) + quantidadeNovasCartelas;
        clientes[idx].dataUltimaCompra = dadosCliente.dataUltimaCompra;
      } else {
        dadosCliente.dataCadastro = Date.now();
        dadosCliente.totalCartelasCompradas = quantidadeNovasCartelas;
        clientes.push(dadosCliente);
      }
      localStorage.setItem('bingokrs_clientes', JSON.stringify(clientes));
      return dadosCliente;
    }
  },

  // ==========================================
  // 4. REGISTRO DE CARTELAS E CONTROLE FINANCEIRO
  // ==========================================

  /**
   * Registra novas cartelas no banco e atualiza métricas de faturamento
   */
  async registrarCartelasVenda(cartelas, clienteInfo = null) {
    const valorUnitario = cartelas[0]?.gameId ? parseFloat(localStorage.getItem('bingokrs_cupom_temp') || 2.0) : 2.0; // Pega preço cupom do estado
    const totalVenda = cartelas.length * valorUnitario;
    const pdv = cartelas[0]?.pdv || "Simulador";

    if (isFirebaseConfigured && db) {
      // Salva cada cartela na coleção no Firestore
      for (const card of cartelas) {
        if (clienteInfo) {
          card.clienteNome = clienteInfo.nome;
          card.clienteCelular = clienteInfo.celular;
        }
        card.dataVenda = Date.now();
        await setDoc(doc(db, "cartelas", card.id), card);
      }

      // Atualiza métricas e estado da partida via Transação Única
      const metricaRef = doc(db, "metricas", "financeiro");
      const partidaRef = doc(db, "partidas", "atual");
      try {
        await runTransaction(db, async (transaction) => {
          const metricaSnap = await transaction.get(metricaRef);
          const partidaSnap = await transaction.get(partidaRef);

          // 1. Processa métricas
          let dataMetricas = { totalFaturamento: 0, totalPremiosPagos: 0, rankingPdvs: {} };
          if (metricaSnap.exists()) {
            dataMetricas = metricaSnap.data();
          }
          dataMetricas.totalFaturamento = (dataMetricas.totalFaturamento || 0) + totalVenda;
          if (!dataMetricas.rankingPdvs) dataMetricas.rankingPdvs = {};
          dataMetricas.rankingPdvs[pdv] = (dataMetricas.rankingPdvs[pdv] || 0) + totalVenda;

          // 2. Processa estado da partida (Direct sync cross-device)
          if (partidaSnap.exists()) {
            const partidaData = partidaSnap.data();
            const statusAtual = partidaData.status;

            cartelas.forEach(c => {
              if (!c.gameId) {
                c.gameId = (statusAtual === 'WAITING') ? partidaData.gameId : partidaData.nextGameId;
              }
              if (clienteInfo) {
                c.clienteNome = clienteInfo.nome;
                c.clienteCelular = clienteInfo.celular;
              }
              c.dataVenda = Date.now();
            });

            if (!partidaData.cards) partidaData.cards = [];
            if (!partidaData.nextCards) partidaData.nextCards = [];

            cartelas.forEach(c => {
              if (c.gameId === partidaData.gameId && statusAtual === 'WAITING') {
                if (!partidaData.cards.some(existing => existing.id === c.id)) {
                  partidaData.cards.push(c);
                }
              } else {
                if (!partidaData.nextCards.some(existing => existing.id === c.id)) {
                  partidaData.nextCards.push(c);
                }
              }
            });

            const { processarEstadoJogo } = await import('./game.js');
            const partidaAtualizada = processarEstadoJogo(partidaData);

            transaction.update(partidaRef, {
              cards: partidaAtualizada.cards || [],
              nextCards: partidaAtualizada.nextCards || [],
              winners: partidaAtualizada.winners || { quadra: [], quina: [], bingo: [], acumulado: [] },
              status: partidaAtualizada.status
            });
          }

          transaction.set(metricaRef, dataMetricas);
        });
      } catch (err) {
        console.error("Erro na transação de faturamento e estado:", err);
      }
    } else {
      // MODO SIMULADO
      const savedCards = localStorage.getItem('bingokrs_cartelas_registradas') || '[]';
      const cardsArr = JSON.parse(savedCards);
      
      cartelas.forEach(card => {
        if (clienteInfo) {
          card.clienteNome = clienteInfo.nome;
          card.clienteCelular = clienteInfo.celular;
        }
        card.dataVenda = Date.now();
        cardsArr.push(card);
      });
      localStorage.setItem('bingokrs_cartelas_registradas', JSON.stringify(cardsArr));

      // Atualiza métrica simulada
      const savedMet = localStorage.getItem('bingokrs_metricas') || '{"totalFaturamento":0,"totalPremiosPagos":0,"rankingPdvs":{}}';
      const met = JSON.parse(savedMet);
      met.totalFaturamento += totalVenda;
      if (!met.rankingPdvs) met.rankingPdvs = {};
      met.rankingPdvs[pdv] = (met.rankingPdvs[pdv] || 0) + totalVenda;
      localStorage.setItem('bingokrs_metricas', JSON.stringify(met));
      localChannel.postMessage({ type: 'METRICS_UPDATE', metrics: met });
    }
  },

  /**
   * Busca todas as cartelas registradas para um determinado ID de Sorteio/Jogo
   */
  async buscarCartelasPorGameId(gameId) {
    if (isFirebaseConfigured && db) {
      const q = query(collection(db, "cartelas"), where("gameId", "==", gameId));
      const querySnap = await getDocs(q);
      const list = [];
      querySnap.forEach(docSnap => {
        list.push(docSnap.data());
      });
      return list;
    } else {
      // MODO SIMULADO
      const savedCards = localStorage.getItem('bingokrs_cartelas_registradas') || '[]';
      const cardsArr = JSON.parse(savedCards);
      return cardsArr.filter(c => c.gameId === gameId);
    }
  },

  /**
   * Adiciona o valor pago de prêmio às métricas acumuladoras
   */
  async registrarPremioPago(valor) {
    if (isFirebaseConfigured && db) {
      const metricaRef = doc(db, "metricas", "financeiro");
      try {
        await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(metricaRef);
          let data = { totalFaturamento: 0, totalPremiosPagos: 0, rankingPdvs: {} };
          if (docSnap.exists()) {
            data = docSnap.data();
          }
          data.totalPremiosPagos = (data.totalPremiosPagos || 0) + valor;
          transaction.set(metricaRef, data);
        });
      } catch (err) {
        console.error(err);
      }
    } else {
      // MODO SIMULADO
      const savedMet = localStorage.getItem('bingokrs_metricas') || '{"totalFaturamento":0,"totalPremiosPagos":0,"rankingPdvs":{}}';
      const met = JSON.parse(savedMet);
      met.totalPremiosPagos += valor;
      localStorage.setItem('bingokrs_metricas', JSON.stringify(met));
      localChannel.postMessage({ type: 'METRICS_UPDATE', metrics: met });
    }
  },

  /**
   * Assina mudanças em tempo real nas métricas financeiras
   */
  assinarMetricasFinanceiras(callback) {
    if (isFirebaseConfigured && db) {
      return onSnapshot(doc(db, "metricas", "financeiro"), (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data());
        } else {
          callback({ totalFaturamento: 0, totalPremiosPagos: 0, rankingPdvs: {} });
        }
      });
    } else {
      // MODO SIMULADO
      const listener = (event) => {
        if (event.data && event.data.type === 'METRICS_UPDATE') {
          callback(event.data.metrics);
        }
      };
      localChannel.addEventListener('message', listener);

      const saved = localStorage.getItem('bingokrs_metricas');
      if (saved) {
        callback(JSON.parse(saved));
      } else {
        callback({ totalFaturamento: 0, totalPremiosPagos: 0, rankingPdvs: {} });
      }

      return () => {
        localChannel.removeEventListener('message', listener);
      };
    }
  },

  // ==========================================
  // 4.5 HEARTBEAT E PDVS ONLINE
  // ==========================================

  async registrarHeartbeat(pdvNome) {
    if (isFirebaseConfigured && db) {
      try {
        const pdvRef = doc(db, "pdvs_online", pdvNome);
        await setDoc(pdvRef, {
          pdvNome: pdvNome,
          lastActive: Date.now()
        });
      } catch (e) {
        console.error("Erro ao registrar heartbeat do PDV:", e);
      }
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_pdvs_online') || '{}';
      const pdvs = JSON.parse(saved);
      pdvs[pdvNome] = Date.now();
      localStorage.setItem('bingokrs_pdvs_online', JSON.stringify(pdvs));
    }
  },

  assinarPdvsOnline(callback) {
    if (isFirebaseConfigured && db) {
      return onSnapshot(collection(db, "pdvs_online"), (snapshot) => {
        const agora = Date.now();
        let count = 0;
        const list = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.lastActive >= agora - 60000) {
            count++;
            list.push(data.pdvNome);
          }
        });
        callback(count, list);
      });
    } else {
      // MODO SIMULADO
      const checkSimulado = () => {
        const saved = localStorage.getItem('bingokrs_pdvs_online') || '{}';
        const pdvs = JSON.parse(saved);
        const agora = Date.now();
        let count = 0;
        const list = [];
        for (const pdv in pdvs) {
          if (pdvs[pdv] >= agora - 60000) {
            count++;
            list.push(pdv);
          }
        }
        callback(count, list);
      };
      const intervalId = setInterval(checkSimulado, 5000);
      checkSimulado();
      return () => clearInterval(intervalId);
    }
  },

  // ==========================================
  // 5. EVENTOS E COMANDOS DIRETOS (SOM, ALERTAS)
  // ==========================================

  enviarComando(comando, payload = {}) {
    localChannel.postMessage({ type: 'COMMAND', command: comando, data: payload });
  },

  assinarComandos(callback) {
    const listener = (event) => {
      if (event.data && event.data.type === 'COMMAND') {
        callback(event.data.command, event.data.data);
      }
    };
    localChannel.addEventListener('message', listener);
    return () => {
      localChannel.removeEventListener('message', listener);
    };
  },

  // ==========================================
  // 6. GERENCIAMENTO DE PDVS E COMISSÕES
  // ==========================================

  /**
   * Lista todos os PDVs cadastrados (nomes únicos extraídos dos operadores)
   */
  async listarPdvsCadastrados() {
    let pdvMap = {};
    
    if (isFirebaseConfigured && db) {
      try {
        const qPdvs = query(collection(db, "pdvs"));
        const querySnapPdvs = await getDocs(qPdvs);
        querySnapPdvs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.pdvNome) {
            pdvMap[data.pdvNome] = {
              pdvNome: data.pdvNome,
              endereco: data.endereco || '',
              whatsapp: data.whatsapp || '',
              comissaoTipo: data.comissaoTipo || 'bruta',
              comissaoValor: data.comissaoValor || 10,
              operadores: []
            };
          }
        });
      } catch (err) {
        console.warn("[FIREBASE] Erro ao carregar coleção pdvs, tentando operadores:", err);
      }
      
      try {
        const qOps = query(collection(db, "operadores"));
        const querySnapOps = await getDocs(qOps);
        querySnapOps.forEach(docSnap => {
          const data = docSnap.data();
          if (data.pdvNome && data.tipo === 'operador') {
            if (!pdvMap[data.pdvNome]) {
              pdvMap[data.pdvNome] = {
                pdvNome: data.pdvNome,
                endereco: '',
                whatsapp: '',
                comissaoTipo: 'bruta',
                comissaoValor: 10,
                operadores: []
              };
            }
            if (!pdvMap[data.pdvNome].operadores) {
              pdvMap[data.pdvNome].operadores = [];
            }
            pdvMap[data.pdvNome].operadores.push({
              nome: data.nome,
              email: data.email,
              uid: data.uid
            });
          }
        });
      } catch (err) {
        console.error("[FIREBASE] Erro ao carregar operadores:", err);
      }
      
      return Object.values(pdvMap);
    } else {
      // MODO SIMULADO
      const savedPdvs = localStorage.getItem('bingokrs_pdvs') || '{}';
      const pdvs = JSON.parse(savedPdvs);
      Object.keys(pdvs).forEach(k => {
        pdvMap[k] = { 
          pdvNome: pdvs[k].pdvNome,
          endereco: pdvs[k].endereco || '',
          whatsapp: pdvs[k].whatsapp || '',
          comissaoTipo: pdvs[k].comissaoTipo || 'bruta',
          comissaoValor: pdvs[k].comissaoValor || 10,
          operadores: [] 
        };
      });
      
      const savedOps = localStorage.getItem('bingokrs_operadores') || '[]';
      const operadores = JSON.parse(savedOps);
      operadores.forEach(op => {
        if (op.pdvNome && op.tipo === 'operador') {
          if (!pdvMap[op.pdvNome]) {
            pdvMap[op.pdvNome] = {
              pdvNome: op.pdvNome,
              endereco: '',
              whatsapp: '',
              comissaoTipo: 'bruta',
              comissaoValor: 10,
              operadores: []
            };
          }
          if (!pdvMap[op.pdvNome].operadores) pdvMap[op.pdvNome].operadores = [];
          pdvMap[op.pdvNome].operadores.push({
            nome: op.nome,
            email: op.email,
            uid: op.uid
          });
        }
      });
      
      return Object.values(pdvMap);
    }
  },

  /**
   * Salva ou atualiza a configuração de comissão de um PDV
   */
  async salvarComissaoPdv(pdvNome, comissaoTipo, comissaoValor) {
    const dados = {
      pdvNome,
      comissaoTipo,
      comissaoValor: parseFloat(comissaoValor),
      updatedAt: Date.now()
    };

    if (isFirebaseConfigured && db) {
      await setDoc(doc(db, "pdv_comissoes", pdvNome), dados);
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_pdv_comissoes') || '{}';
      const comissoes = JSON.parse(saved);
      comissoes[pdvNome] = dados;
      localStorage.setItem('bingokrs_pdv_comissoes', JSON.stringify(comissoes));
    }
    return dados;
  },

  /**
   * Busca a configuração de comissão de um PDV
   */
  async buscarComissaoPdv(pdvNome) {
    if (isFirebaseConfigured && db) {
      const docRef = doc(db, "pdv_comissoes", pdvNome);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_pdv_comissoes') || '{}';
      const comissoes = JSON.parse(saved);
      return comissoes[pdvNome] || null;
    }
  },

  /**
   * Cadastra um novo operador e o PDV associado pelo Administrador
   */
  async cadastrarOperadorPorAdmin(email, password, pdvNome, operadorName, comissaoTipo, comissaoValor, endereco, whatsapp) {
    const comValor = parseFloat(comissaoValor) || 10;
    const comTipo = comissaoTipo || 'bruta';
    const cleanPdvNome = pdvNome.trim();

    if (isFirebaseConfigured && auth && db) {
      let tempApp = null;
      try {
        // Inicializa Firebase App temporário para evitar deslogar o Admin
        tempApp = initializeApp(firebaseConfig, "TempPdvApp_" + Date.now());
        const tempAuth = getAuth(tempApp);
        const tempDb = getFirestore(tempApp);
        
        // Cria credencial no Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(tempAuth, email.trim(), password);
        
        // Cria documento do operador
        const profile = {
          uid: userCredential.user.uid,
          email: email.trim(),
          nome: operadorName,
          pdvNome: cleanPdvNome,
          tipo: "operador"
        };
        await setDoc(doc(tempDb, "operadores", userCredential.user.uid), profile);
        
        // Salva dados cadastrais em pdvs
        const pdvDetails = {
          pdvNome: cleanPdvNome,
          endereco: endereco || '',
          whatsapp: whatsapp || '',
          comissaoTipo: comTipo,
          comissaoValor: comValor,
          updatedAt: Date.now()
        };
        await setDoc(doc(tempDb, "pdvs", cleanPdvNome), pdvDetails);
        
        // Salva na coleção legada pdv_comissoes para faturamento
        await setDoc(doc(tempDb, "pdv_comissoes", cleanPdvNome), {
          pdvNome: cleanPdvNome,
          comissaoTipo: comTipo,
          comissaoValor: comValor,
          updatedAt: Date.now()
        });

        return { uid: userCredential.user.uid, pdvNome: cleanPdvNome };
      } catch (err) {
        throw new Error(err.message);
      } finally {
        if (tempApp) {
          try {
            await deleteApp(tempApp);
          } catch (e) {
            console.error("Erro ao limpar app temporário:", e);
          }
        }
      }
    } else {
      // MODO SIMULADO
      const savedOps = localStorage.getItem('bingokrs_operadores') || '[]';
      const operadores = JSON.parse(savedOps);
      if (operadores.some(o => o.email === email.trim())) {
        throw new Error("E-mail de operador já cadastrado.");
      }
      
      const newUid = "user-" + Date.now();
      const profile = {
        uid: newUid,
        email: email.trim(),
        password,
        nome: operadorName,
        pdvNome: cleanPdvNome,
        tipo: "operador"
      };
      operadores.push(profile);
      localStorage.setItem('bingokrs_operadores', JSON.stringify(operadores));
      
      // Salva em pdvs simulado
      const savedPdvs = localStorage.getItem('bingokrs_pdvs') || '{}';
      const pdvs = JSON.parse(savedPdvs);
      pdvs[cleanPdvNome] = {
        pdvNome: cleanPdvNome,
        endereco: endereco || '',
        whatsapp: whatsapp || '',
        comissaoTipo: comTipo,
        comissaoValor: comValor,
        updatedAt: Date.now()
      };
      localStorage.setItem('bingokrs_pdvs', JSON.stringify(pdvs));
      
      // Salva comissões simuladas
      const savedCom = localStorage.getItem('bingokrs_pdv_comissoes') || '{}';
      const comissoes = JSON.parse(savedCom);
      comissoes[cleanPdvNome] = {
        pdvNome: cleanPdvNome,
        comissaoTipo: comTipo,
        comissaoValor: comValor,
        updatedAt: Date.now()
      };
      localStorage.setItem('bingokrs_pdv_comissoes', JSON.stringify(comissoes));
      
      localChannel.postMessage({ type: 'AUTH_CHANGED' });
      return { uid: newUid, pdvNome: cleanPdvNome };
    }
  },

  /**
   * Atualiza as informações e comissões de um PDV
   */
  async atualizarPdvPorAdmin(pdvNomeOriginal, pdvNomeNovo, comissaoTipo, comissaoValor, endereco, whatsapp) {
    const comValor = parseFloat(comissaoValor) || 10;
    const comTipo = comissaoTipo || 'bruta';
    const cleanPdvNomeNovo = pdvNomeNovo.trim();
    const cleanPdvNomeOriginal = pdvNomeOriginal.trim();

    if (isFirebaseConfigured && db) {
      const pdvDetails = {
        pdvNome: cleanPdvNomeNovo,
        endereco: endereco || '',
        whatsapp: whatsapp || '',
        comissaoTipo: comTipo,
        comissaoValor: comValor,
        updatedAt: Date.now()
      };
      
      // Salva novos dados do estabelecimento
      await setDoc(doc(db, "pdvs", cleanPdvNomeNovo), pdvDetails);
      await setDoc(doc(db, "pdv_comissoes", cleanPdvNomeNovo), {
        pdvNome: cleanPdvNomeNovo,
        comissaoTipo: comTipo,
        comissaoValor: comValor,
        updatedAt: Date.now()
      });
      
      // Se mudou o nome, limpa as referências ao nome anterior e atualiza os operadores associados
      if (cleanPdvNomeOriginal !== cleanPdvNomeNovo) {
        try {
          await deleteDoc(doc(db, "pdvs", cleanPdvNomeOriginal));
          await deleteDoc(doc(db, "pdv_comissoes", cleanPdvNomeOriginal));
        } catch (e) {
          console.error("Erro ao deletar PDV antigo:", e);
        }
        
        const q = query(collection(db, "operadores"), where("pdvNome", "==", cleanPdvNomeOriginal));
        const querySnap = await getDocs(q);
        const batchPromise = [];
        querySnap.forEach(docSnap => {
          const docRef = doc(db, "operadores", docSnap.id);
          batchPromise.push(updateDoc(docRef, { pdvNome: cleanPdvNomeNovo }));
        });
        await Promise.all(batchPromise);
      }
      
      return pdvDetails;
    } else {
      // MODO SIMULADO
      const savedPdvs = localStorage.getItem('bingokrs_pdvs') || '{}';
      const pdvs = JSON.parse(savedPdvs);
      
      const pdvDetails = {
        pdvNome: cleanPdvNomeNovo,
        endereco: endereco || '',
        whatsapp: whatsapp || '',
        comissaoTipo: comTipo,
        comissaoValor: comValor,
        updatedAt: Date.now()
      };
      
      delete pdvs[cleanPdvNomeOriginal];
      pdvs[cleanPdvNomeNovo] = pdvDetails;
      localStorage.setItem('bingokrs_pdvs', JSON.stringify(pdvs));
      
      // Sincroniza comissões
      const savedCom = localStorage.getItem('bingokrs_pdv_comissoes') || '{}';
      const comissoes = JSON.parse(savedCom);
      delete comissoes[cleanPdvNomeOriginal];
      comissoes[cleanPdvNomeNovo] = {
        pdvNome: cleanPdvNomeNovo,
        comissaoTipo: comTipo,
        comissaoValor: comValor,
        updatedAt: Date.now()
      };
      localStorage.setItem('bingokrs_pdv_comissoes', JSON.stringify(comissoes));
      
      // Atualiza operadores no LocalStorage
      if (cleanPdvNomeOriginal !== cleanPdvNomeNovo) {
        const savedOps = localStorage.getItem('bingokrs_operadores') || '[]';
        const operadores = JSON.parse(savedOps);
        operadores.forEach(op => {
          if (op.pdvNome === cleanPdvNomeOriginal) {
            op.pdvNome = cleanPdvNomeNovo;
          }
        });
        localStorage.setItem('bingokrs_operadores', JSON.stringify(operadores));
      }
      
      localChannel.postMessage({ type: 'AUTH_CHANGED' });
      return pdvDetails;
    }
  },

  /**
   * Remove um PDV e seus operadores do sistema
   */
  async excluirPdvPorAdmin(pdvNome) {
    const cleanPdvNome = pdvNome.trim();
    if (isFirebaseConfigured && db) {
      await deleteDoc(doc(db, "pdvs", cleanPdvNome));
      await deleteDoc(doc(db, "pdv_comissoes", cleanPdvNome));
      
      // Remove operadores daquele PDV no Firestore (eles perdem o acesso ao caixa)
      const q = query(collection(db, "operadores"), where("pdvNome", "==", cleanPdvNome));
      const querySnap = await getDocs(q);
      const batchPromise = [];
      querySnap.forEach(docSnap => {
        const docRef = doc(db, "operadores", docSnap.id);
        batchPromise.push(deleteDoc(docRef));
      });
      await Promise.all(batchPromise);
    } else {
      // MODO SIMULADO
      const savedPdvs = localStorage.getItem('bingokrs_pdvs') || '{}';
      const pdvs = JSON.parse(savedPdvs);
      delete pdvs[cleanPdvNome];
      localStorage.setItem('bingokrs_pdvs', JSON.stringify(pdvs));
      
      const savedCom = localStorage.getItem('bingokrs_pdv_comissoes') || '{}';
      const comissoes = JSON.parse(savedCom);
      delete comissoes[cleanPdvNome];
      localStorage.setItem('bingokrs_pdv_comissoes', JSON.stringify(comissoes));
      
      const savedOps = localStorage.getItem('bingokrs_operadores') || '[]';
      let operadores = JSON.parse(savedOps);
      operadores = operadores.filter(op => op.pdvNome !== cleanPdvNome);
      localStorage.setItem('bingokrs_operadores', JSON.stringify(operadores));
      
      localChannel.postMessage({ type: 'AUTH_CHANGED' });
    }
  },

  /**
   * Salva as configurações de integração do Gateway Pix
   */
  async salvarConfiguracaoGateway(configData) {
    if (isFirebaseConfigured && db) {
      await setDoc(doc(db, "configuracoes", "gateway_pix"), {
        ...configData,
        updatedAt: Date.now()
      });
    } else {
      // MODO SIMULADO
      localStorage.setItem('bingokrs_gateway_pix', JSON.stringify({
        ...configData,
        updatedAt: Date.now()
      }));
    }
    localChannel.postMessage({ type: 'GATEWAY_CONFIG_CHANGED' });
    return configData;
  },

  /**
   * Busca as configurações de integração do Gateway Pix
   */
  async buscarConfiguracaoGateway() {
    if (isFirebaseConfigured && db) {
      const docRef = doc(db, "configuracoes", "gateway_pix");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_gateway_pix');
      return saved ? JSON.parse(saved) : null;
    }
  },

  /**
   * Realiza o cadastro de um novo jogador
   */
  async cadastrarJogador(nome, celular, email, senha) {
    const celLimpo = celular.replace(/\D/g, '');
    const emailLimpo = email.trim().toLowerCase();
    const dados = {
      nome: nome.trim(),
      celular: celLimpo,
      email: emailLimpo,
      senha: senha,
      createdAt: Date.now()
    };

    if (isFirebaseConfigured && db) {
      const qCel = query(collection(db, "jogadores"), where("celular", "==", celLimpo));
      const snapCel = await getDocs(qCel);
      if (!snapCel.empty) {
        throw new Error("Celular já cadastrado.");
      }

      const qEmail = query(collection(db, "jogadores"), where("email", "==", emailLimpo));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        throw new Error("E-mail já cadastrado.");
      }

      const playerRef = doc(collection(db, "jogadores"));
      dados.uid = playerRef.id;
      await setDoc(playerRef, dados);
      return dados;
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_jogadores') || '[]';
      const jogadores = JSON.parse(saved);

      if (jogadores.some(j => j.celular === celLimpo)) {
        throw new Error("Celular já cadastrado.");
      }
      if (jogadores.some(j => j.email === emailLimpo)) {
        throw new Error("E-mail já cadastrado.");
      }

      dados.uid = "jogador-" + Date.now();
      jogadores.push(dados);
      localStorage.setItem('bingokrs_jogadores', JSON.stringify(jogadores));
      return dados;
    }
  },

  /**
   * Realiza o login de um jogador
   */
  async loginJogador(emailOuCelular, senha) {
    const limpo = emailOuCelular.replace(/\D/g, '');
    const queryTerm = emailOuCelular.trim().toLowerCase();

    if (isFirebaseConfigured && db) {
      let q = query(collection(db, "jogadores"), where("email", "==", queryTerm));
      let snap = await getDocs(q);
      
      if (snap.empty && limpo) {
        q = query(collection(db, "jogadores"), where("celular", "==", limpo));
        snap = await getDocs(q);
      }

      if (snap.empty) {
        throw new Error("Usuário não cadastrado.");
      }

      const jogador = snap.docs[0].data();
      if (jogador.senha !== senha) {
        throw new Error("Senha incorreta.");
      }

      return jogador;
    } else {
      // MODO SIMULADO
      const saved = localStorage.getItem('bingokrs_jogadores') || '[]';
      const jogadores = JSON.parse(saved);
      const jogador = jogadores.find(j => j.email === queryTerm || (limpo && j.celular === limpo));

      if (!jogador) {
        throw new Error("Usuário não cadastrado.");
      }
      if (jogador.senha !== senha) {
        throw new Error("Senha incorreta.");
      }

      return jogador;
    }
  },

  /**
   * Busca as cartelas compradas por um celular
   */
  async buscarCartelasPorCelular(celular) {
    const cleanPhone = celular.replace(/\D/g, '');
    if (isFirebaseConfigured && db) {
      const q = query(collection(db, "cartelas"));
      const querySnap = await getDocs(q);
      const list = [];
      querySnap.forEach(docSnap => {
        const card = docSnap.data();
        const cardPhoneClean = (card.clienteCelular || '').replace(/\D/g, '');
        if (cardPhoneClean === cleanPhone) {
          list.push(card);
        }
      });
      return list;
    } else {
      // MODO SIMULADO
      const savedCards = localStorage.getItem('bingokrs_cartelas_registradas') || '[]';
      const cardsArr = JSON.parse(savedCards);
      return cardsArr.filter(c => {
        const cardPhoneClean = (c.clienteCelular || '').replace(/\D/g, '');
        return cardPhoneClean === cleanPhone;
      });
    }
  }
};
