/**
 * BINGOKRS - Adaptador de Sincronização em Tempo Real
 * 
 * Este arquivo abstrai a comunicação entre as telas (TV, Admin, PDVs).
 * Atualmente usa a API nativa BroadcastChannel para sincronização instantânea
 * local (sem servidor). O código de integração com o Firebase Firestore já está
 * esquematizado abaixo para que você possa ativá-lo facilmente no futuro.
 */

// Cole aqui suas configurações do Firebase Console quando for integrar
export const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};

// IMPORTANTE: Para usar o Firebase na produção, descomente as linhas abaixo e instale o pacote:
// npm install firebase
/*
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
*/

// Instancia o canal de comunicação local do navegador
const localChannel = new BroadcastChannel('bingo-channel');

export const FirebaseHelper = {
  
  /**
   * Envia uma atualização de estado para todas as telas conectadas.
   * Salva localmente no localStorage e publica no canal.
   */
  async salvarEstadoJogo(estado) {
    // --- MODO LOCAL (BroadcastChannel + LocalStorage) ---
    localStorage.setItem('bingokrs_game_state', JSON.stringify(estado));
    localChannel.postMessage({ type: 'STATE_UPDATE', state: estado });
    
    // --- MODO FIREBASE (Descomente quando conectar o banco) ---
    /*
    try {
      await setDoc(doc(db, "bingo", "partida_atual"), estado);
    } catch (erro) {
      console.error("Erro ao salvar no Firebase:", erro);
    }
    */
  },

  /**
   * Assina as mudanças de estado do jogo. O callback é acionado
   * sempre que o estado sofrer alteração em qualquer tela.
   * Retorna uma função de desinscrição (unsubscribe).
   */
  assinarEstadoJogo(callback) {
    // --- MODO LOCAL ---
    const listener = (event) => {
      if (event.data && event.data.type === 'STATE_UPDATE') {
        callback(event.data.state);
      }
    };
    localChannel.addEventListener('message', listener);

    // Carrega o estado inicial armazenado
    const saved = localStorage.getItem('bingokrs_game_state');
    if (saved) {
      try {
        callback(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao ler estado do localStorage:", e);
      }
    }

    // Retorna a função de encerramento da escuta
    return () => {
      localChannel.removeEventListener('message', listener);
    };

    // --- MODO FIREBASE ---
    /*
    const unsub = onSnapshot(doc(db, "bingo", "partida_atual"), (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data());
      }
    });
    return unsub;
    */
  },

  /**
   * Método auxiliar para enviar comandos específicos de ação direta
   * (ex: tocar um som de vitória, forçar atualização visual ou piscar)
   */
  enviarComando(comando, payload = {}) {
    localChannel.postMessage({ type: 'COMMAND', command: comando, data: payload });
    
    // Firebase (opcional): comandos rápidos podem ser transmitidos por uma collection 'comandos'
  },

  /**
   * Escuta comandos rápidos enviados pelo canal.
   */
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
