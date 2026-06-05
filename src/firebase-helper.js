/**
 * BINGOKRS - Adaptador de Sincronização em Tempo Real (Firebase & Fallback Local)
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, doc, onSnapshot, setDoc, getDoc, updateDoc, 
  collection, query, where, getDocs, runTransaction 
} from 'firebase/firestore';
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged 
} from 'firebase/auth';

// Cole suas configurações reais do Firebase Console aqui
export const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
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
      // Busca dados adicionais do operador no Firestore
      const userDoc = await getDoc(doc(db, "operadores", userCredential.user.uid));
      if (userDoc.exists()) {
        return { user: userCredential.user, profile: userDoc.data() };
      }
      return { user: userCredential.user, profile: { pdvNome: "Caixa Geral", tipo: "operador" } };
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
      return onSnapshot(doc(db, "partidas", "atual"), (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data());
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

      // Atualiza métricas no Firestore via Transação para evitar concorrência
      const metricaRef = doc(db, "metricas", "financeiro");
      try {
        await runTransaction(db, async (transaction) => {
          const docSnap = await transaction.get(metricaRef);
          let data = { totalFaturamento: 0, totalPremiosPagos: 0, rankingPdvs: {} };
          if (docSnap.exists()) {
            data = docSnap.data();
          }
          data.totalFaturamento = (data.totalFaturamento || 0) + totalVenda;
          if (!data.rankingPdvs) data.rankingPdvs = {};
          data.rankingPdvs[pdv] = (data.rankingPdvs[pdv] || 0) + totalVenda;

          transaction.set(metricaRef, data);
        });
      } catch (err) {
        console.error("Erro ao atualizar métricas financeiras:", err);
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
  }
};
