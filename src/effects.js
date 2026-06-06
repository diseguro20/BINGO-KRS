/**
 * BINGOKRS - Efeitos Visuais, Sonoros e Narração
 */

// ==========================================
// 1. FIREWORKS - Fogos de Artifício (Canvas)
// ==========================================

class Particle {
  constructor(x, y, color, velocity, gravity, fade) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.velocity = velocity;
    this.gravity = gravity;
    this.alpha = 1;
    this.fade = fade;
    this.radius = Math.random() * 2.5 + 1;
  }

  update() {
    this.velocity.x *= 0.98;
    this.velocity.y *= 0.98;
    this.velocity.y += this.gravity;
    this.x += this.velocity.x;
    this.y += this.velocity.y;
    this.alpha -= this.fade;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(this.alpha, 0);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }
}

const FIREWORK_COLORS = [
  '#FF007F', '#00F3FF', '#FFD700', '#A855F7', '#00FF88',
  '#FF6B35', '#FF1493', '#00BFFF', '#ADFF2F', '#FF4500'
];

export function launchFireworks(durationMs = 10000) {
  const canvas = document.createElement('canvas');
  canvas.id = 'fireworks-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;pointer-events:none;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let particles = [];
  let running = true;
  const startTime = Date.now();

  function createExplosion(x, y) {
    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const particleCount = 20 + Math.floor(Math.random() * 15);
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 / particleCount) * i;
      const speed = Math.random() * 5 + 1.5;
      particles.push(new Particle(
        x, y, color,
        { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        0.04,
        0.012 + Math.random() * 0.015
      ));
    }
    // Inner ring with different color
    const color2 = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 / 6) * i;
      const speed = Math.random() * 2.5 + 0.8;
      particles.push(new Particle(
        x, y, color2,
        { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        0.03,
        0.015 + Math.random() * 0.01
      ));
    }
  }

  let nextExplosion = 0;

  function animate() {
    if (!running) return;
    const elapsed = Date.now() - startTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Launch new explosions periodically
    if (elapsed < durationMs - 2000 && Date.now() > nextExplosion) {
      const x = Math.random() * canvas.width * 0.7 + canvas.width * 0.15;
      const y = Math.random() * canvas.height * 0.5 + canvas.height * 0.1;
      createExplosion(x, y);
      nextExplosion = Date.now() + 200 + Math.random() * 400;
    }

    // Update and draw particles
    particles = particles.filter(p => p.alpha > 0.01);
    particles.forEach(p => {
      p.update();
      p.draw(ctx);
    });

    if (elapsed < durationMs || particles.length > 0) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }

  animate();

  // Cleanup after duration
  setTimeout(() => {
    running = false;
    setTimeout(() => {
      if (canvas.parentNode) canvas.remove();
    }, 3000);
  }, durationMs);
}

// ==========================================
// 2. SOUND EFFECTS - Efeitos Sonoros (Web Audio API)
// ==========================================

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playSirenSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 3;

    // Main siren oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    // Siren sweep up and down
    osc.frequency.linearRampToValueAtTime(900, now + 0.5);
    osc.frequency.linearRampToValueAtTime(400, now + 1.0);
    osc.frequency.linearRampToValueAtTime(1000, now + 1.5);
    osc.frequency.linearRampToValueAtTime(500, now + 2.0);
    osc.frequency.linearRampToValueAtTime(1100, now + 2.5);
    osc.frequency.linearRampToValueAtTime(400, now + 3.0);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.3);
    gain.gain.linearRampToValueAtTime(0.15, now + 2.5);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);

    // Add harmonic
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(800, now);
    osc2.frequency.linearRampToValueAtTime(1800, now + 0.5);
    osc2.frequency.linearRampToValueAtTime(800, now + 1.0);
    osc2.frequency.linearRampToValueAtTime(2000, now + 1.5);
    osc2.frequency.linearRampToValueAtTime(1000, now + 2.0);
    osc2.frequency.linearRampToValueAtTime(2200, now + 2.5);
    osc2.frequency.linearRampToValueAtTime(800, now + 3.0);

    gain2.gain.setValueAtTime(0.08, now);
    gain2.gain.linearRampToValueAtTime(0, now + duration);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + duration);
  } catch (e) {
    console.warn('[EFFECTS] Erro ao tocar sirene:', e);
  }
}

export function playApplauseSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 5;

    // White noise buffer for applause
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter to make it sound like crowd
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.3);
    gain.gain.setValueAtTime(0.12, now + 3);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + duration);
  } catch (e) {
    console.warn('[EFFECTS] Erro ao tocar aplausos:', e);
  }
}

// Short celebration jingle/horn
export function playCelebrationHorn() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.15);
      gain.gain.setValueAtTime(0, now + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.05);
      gain.gain.linearRampToValueAtTime(i === 3 ? 0.2 : 0, now + i * 0.15 + 0.3);
      if (i === 3) {
        gain.gain.linearRampToValueAtTime(0, now + 1.5);
      }
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + 2);
    });
  } catch (e) {
    console.warn('[EFFECTS] Erro ao tocar fanfarra:', e);
  }
}

// ==========================================
// 3. NARRAÇÃO DE VOZ (Speech Synthesis API)
// ==========================================

let vozFeminina = null;
let vozCarregada = false;

// Pre-load Portuguese female voice
function carregarVoz() {
  if (vozCarregada) return;
  const voices = window.speechSynthesis.getVoices();
  // Try to find pt-BR female voice
  const ptBrVoices = voices.filter(v => v.lang.startsWith('pt'));
  // Prefer female voices (usually contain 'female', 'feminino', or specific names)
  vozFeminina = ptBrVoices.find(v => 
    v.name.toLowerCase().includes('female') || 
    v.name.toLowerCase().includes('feminino') ||
    v.name.toLowerCase().includes('francisca') ||
    v.name.toLowerCase().includes('luciana') ||
    v.name.toLowerCase().includes('vitoria') ||
    v.name.toLowerCase().includes('google') // Google voices are usually good quality
  ) || ptBrVoices[0] || voices[0];
  
  if (ptBrVoices.length > 0) vozCarregada = true;
  console.log('[NARRAÇÃO] Voz selecionada:', vozFeminina?.name || 'padrão do sistema');
}

// Load voices when available
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = carregarVoz;
  carregarVoz();
}

export function narrarBola(numero) {
  if (!window.speechSynthesis) return;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  carregarVoz();
  
  const numStr = numero.toString();
  let texto = `Bola ${numero}`;
  
  // Add flair for special numbers
  if (numero % 10 === 0) {
    texto = `Bola redonda, ${numero}`;
  } else if (numero === 13) {
    texto = `Bola ${numero}, o gato preto!`;
  } else if (numero === 7 || numero === 77) {
    texto = `Bola da sorte, ${numero}!`;
  } else if (numero === 90) {
    texto = `A última bola, ${numero}!`;
  } else if (numero === 1) {
    texto = `A primeira, bola ${numero}!`;
  }
  
  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = 'pt-BR';
  utterance.rate = 0.95;
  utterance.pitch = 1.1;
  utterance.volume = 1;
  
  if (vozFeminina) {
    utterance.voice = vozFeminina;
  }
  
  window.speechSynthesis.speak(utterance);
}

export function narrarPremio(categoria, cardId, pdv) {
  if (!window.speechSynthesis) return;
  
  window.speechSynthesis.cancel();
  carregarVoz();
  
  const nomesCategorias = {
    quadra: 'Quadra',
    quina: 'Quina',
    bingo: 'Bingo',
    acumulado: 'Prêmio Acumulado'
  };
  
  const catNome = nomesCategorias[categoria.toLowerCase()] || categoria;
  const texto = `Atenção! Saiu ${catNome}! A cartela vencedora é ${cardId}, do ponto de venda ${pdv}! Parabéns ao ganhador!`;
  
  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = 'pt-BR';
  utterance.rate = 0.85;
  utterance.pitch = 1.1;
  utterance.volume = 1;
  
  if (vozFeminina) {
    utterance.voice = vozFeminina;
  }
  
  window.speechSynthesis.speak(utterance);
}

// Convenience: play a tick/ding sound when a ball is drawn
export function playBallDrawSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) {
    console.warn('[EFFECTS] Erro ao tocar som de bola:', e);
  }
}
