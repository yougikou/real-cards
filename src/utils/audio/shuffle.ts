let audioCtx: AudioContext | null = null;

export function playShuffleSound() {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  // Resume context if it was suspended (e.g., by browser autoplay policies)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const ctx = audioCtx;

  const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = buffer;

  const gainNode = ctx.createGain();

  // Create an envelope for the shuffle sound (multiple short rustles)
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

  gainNode.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.15);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

  gainNode.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.3);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

  // Filter the white noise to make it sound more like cards
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 3000;
  filter.Q.value = 0.8;

  noiseSource.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  noiseSource.start();
}
