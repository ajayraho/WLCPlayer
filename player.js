// player.js

// ─────────────────────────────────────────────────────────────────────────────
// ELEMENT REFERENCES
// ─────────────────────────────────────────────────────────────────────────────
const video      = document.getElementById('video');
const overlay    = document.getElementById('controls-overlay');
const subCont    = document.getElementById('subtitle-container');

const playBtn    = document.getElementById('play');
const stopBtn    = document.getElementById('stop');
const muteBtn    = document.getElementById('mute');
const volumeSl   = document.getElementById('volume');
const seekSl     = document.getElementById('seek');
const timeCur    = document.getElementById('current-time');
const timeRem    = document.getElementById('remaining-time');

const openFile   = document.getElementById('open-file');
const loadSub    = document.getElementById('load-sub');

const subDec     = document.getElementById('sub-decrease');
const subInc     = document.getElementById('sub-increase');
const subVal     = document.getElementById('sub-value');

const audDec     = document.getElementById('aud-decrease');
const audInc     = document.getElementById('aud-increase');
const audVal     = document.getElementById('aud-value');

const speedDec   = document.getElementById('speed-down');
const speedInc   = document.getElementById('speed-up');
const speedVal   = document.getElementById('speed-value');

const fsBtn      = document.getElementById('full-screen');

const subSettingsBtn = document.getElementById('sub-settings');
const subPanel       = document.getElementById('sub-settings-panel');
const fntSizeInput   = document.getElementById('sub-font-size');
const fntColorInput  = document.getElementById('sub-font-color');
const bgChoiceInput  = document.getElementById('sub-bg-choice');   // NEW
const bgColorInput   = document.getElementById('sub-bg-color');
const posPxInput     = document.getElementById('sub-position-px'); // NEW: number input
const applyBtn       = document.getElementById('sub-settings-apply');


// ─────────────────────────────────────────────────────────────────────────────
// STATE & HELPERS
// ─────────────────────────────────────────────────────────────────────────────
let subDelay = 0, audDelay = 0, speed = 1;
let cues = [];           // parsed subtitles
let audioCtx, sourceNode, delayNode;


// ─────────────────────────────────────────────────────────────────────────────
// FADE‑AWAY CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
let fadeTimeout;
function resetFade() {
  clearTimeout(fadeTimeout);
  overlay.classList.remove('hidden');
  fadeTimeout = setTimeout(() => overlay.classList.add('hidden'), 1500);
}
video.addEventListener('mousemove', resetFade);
overlay.addEventListener('mousemove', resetFade);
overlay.addEventListener('mouseleave', () => overlay.classList.add('hidden')); // fade when you leave
resetFade();


// ─────────────────────────────────────────────────────────────────────────────
// BASIC CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
playBtn.onclick = () => video.paused ? video.play() : video.pause();
video.addEventListener('play',  () => playBtn.textContent = '⏸');
video.addEventListener('pause', () => playBtn.textContent = '⏵');

stopBtn.onclick = () => { video.pause(); video.currentTime = 0; };

muteBtn.onclick = () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? '🔇' : '🔊';
};
volumeSl.oninput = () => {
  video.volume = volumeSl.value;
  video.muted = video.volume == 0;
  muteBtn.textContent = video.muted ? '🔇' : '🔊';
  showStatusMessage(`Volume: ${Math.round(video.volume * 100)}%`);
};


video.addEventListener('loadedmetadata', () => {
  seekSl.max = video.duration;
  timeRem.textContent = formatTime(video.duration);
});
video.addEventListener('timeupdate', () => {
  seekSl.value        = video.currentTime;
  timeCur.textContent = formatTime(video.currentTime);
  timeRem.textContent = formatTime(video.duration - video.currentTime);

  // Subtitle rendering
  const t = video.currentTime + subDelay/1000;
  const cue = cues.find(c => t >= c.start && t <= c.end);
  if (cue) {
    subCont.textContent = cue.text;
    subCont.style.display = 'block';
  } else {
    subCont.style.display = 'none';
  }
});
seekSl.oninput = () => { video.currentTime = seekSl.value; };

// Double‑click resets
subVal.addEventListener('dblclick', () => {
  subDelay = 0;
  subVal.textContent = '0 ms';
  saveSettings();
});
audVal.addEventListener('dblclick', () => {
  audDelay = 0;
  audVal.textContent = '0 ms';
  if (delayNode) delayNode.delayTime.value = 0;
  saveSettings();
});
speedVal.addEventListener('dblclick', () => {
  speed = 1;
  video.playbackRate = 1;
  speedVal.textContent = '1×';
  saveSettings();
});


// ─────────────────────────────────────────────────────────────────────────────
// LOAD VIDEO & SUBTITLE FILES
// ─────────────────────────────────────────────────────────────────────────────
openFile.onclick = () => {
  const inp = document.createElement('input');
  inp.type   = 'file';
  inp.accept = 'video/*';
  inp.onchange = () => {
    video.src = URL.createObjectURL(inp.files[0]);
    video.play();
    loadSettings();

    // experimental: ask to load default .srt
    const base = inp.files[0].name.replace(/\.[^/.]+$/, '');
    if (confirm(`Load default subtitles “${base}.srt”?`)) {
      loadSub.click(); // user‑initiated click
    }
  };
  inp.click();
};

loadSub.onclick = () => {
  const inp = document.createElement('input');
  inp.type   = 'file';
  inp.accept = '.srt';
  inp.onchange = () => {
    const file = inp.files[0];
    const reader = new FileReader();
    reader.onload = () => { cues = parseSRT(reader.result); };
    reader.readAsText(file);
  };
  inp.click();
};

// Simple SRT parser
function parseSRT(data) {
  return data
    .split(/\r?\n\r?\n/)
    .map(block => {
      const lines = block.split(/\r?\n/);
      if (!/^\d+$/.test(lines[0])) return null;
      const [, times, ...txt] = lines;
      const [start, end] = times.split(' --> ').map(t => {
        const [h,m,s] = t.replace(',', '.').split(/[:.]/).map(Number);
        return h*3600 + m*60 + s + (Number('0.' + t.split(',')[1])||0);
      });
      return { start, end, text: txt.join('\n') };
    })
    .filter(Boolean);
}


// ─────────────────────────────────────────────────────────────────────────────
// SYNC & SPEED
// ─────────────────────────────────────────────────────────────────────────────
function updateSub(v) {
  subDelay += v;
  subVal.textContent = `${subDelay} ms`;
  showStatusMessage(`Subtitle delay: ${subDelay}ms`);
  saveSettings();
}

subDec.onclick = () => updateSub(-100);
subInc.onclick = () => updateSub( 100);

function ensureAudio() {
  if (audioCtx) return;
  audioCtx   = new AudioContext();
  sourceNode = audioCtx.createMediaElementSource(video);
  delayNode  = audioCtx.createDelay();
  sourceNode.connect(delayNode).connect(audioCtx.destination);
}

function updateAud(v) {
  audDelay += v;
  audVal.textContent = `${audDelay} ms`;
  ensureAudio();
  delayNode.delayTime.value = Math.max(0, audDelay/1000);
  showStatusMessage(`Audio delay: ${audDelay}ms`);
  saveSettings();
}

audDec.onclick = () => updateAud(-100);
audInc.onclick = () => updateAud( 100);

function updateSpeed(v) {
  speed = Math.min(3, Math.max(0.25, speed + v));
  video.playbackRate = speed;
  speedVal.textContent = `${speed.toFixed(2)}×`;
  showStatusMessage(`Playback speed: ${speed.toFixed(2)}x`);
  saveSettings();
}

speedDec.onclick = () => updateSpeed(-0.25);
speedInc.onclick = () => updateSpeed( 0.25);


// ─────────────────────────────────────────────────────────────────────────────
// FULLSCREEN & SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────
fsBtn.onclick = () => {
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
};
document.addEventListener('keydown', e => {
  switch (e.key) {
    case ' ': playBtn.click();   break;
    case 's': stopBtn.click();   break;
    case 'm': muteBtn.click();   break;
    case '[': subDec.click();    break;
    case ']': subInc.click();    break;
    case 'g': audDec.click();    break;
    case 'h': audInc.click();    break;
    case ',': speedDec.click();  break;
    case '.': speedInc.click();  break;
    case 'f': fsBtn.click();     break;
    case 'ArrowUp':
  video.volume = Math.min(1, video.volume + 0.05);
  volumeSl.value = video.volume;
  showStatusMessage(`Volume: ${Math.round(video.volume * 100)}%`);
  break;
case 'ArrowDown':
  video.volume = Math.max(0, video.volume - 0.05);
  volumeSl.value = video.volume;
  showStatusMessage(`Volume: ${Math.round(video.volume * 100)}%`);
  break;

    case 'ArrowLeft':
      video.currentTime = Math.max(0, video.currentTime - 5); break;
    case 'ArrowRight':
      video.currentTime = Math.min(video.duration, video.currentTime + 5); break;
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// SUBTITLE SETTINGS PANEL
// ─────────────────────────────────────────────────────────────────────────────
subSettingsBtn.onclick = () => subPanel.classList.toggle('hidden');

applyBtn.onclick = () => {
  // Font size & color
  subCont.style.fontSize  = fntSizeInput.value + 'px';
  subCont.style.color     = fntColorInput.value;

  // Background choice
  if (bgChoiceInput.value === 'transparent') {
    subCont.style.background = 'transparent';
  } else {
    subCont.style.background = bgColorInput.value + '80';
  }

  // Bottom position in px
  const px = parseInt(posPxInput.value, 10) || 0;
  subCont.style.bottom = px + 'px';

  subPanel.classList.add('hidden');
};


// ─────────────────────────────────────────────────────────────────────────────
// SPLASH‑SCREEN (fade out after 1s)
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  setTimeout(() => {
    splash.style.transition = 'opacity 0.5s';
    splash.style.opacity = 0;
    setTimeout(() => splash.remove(), 500);
  }, 4000);
});


// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────
function saveSettings() {
  chrome.storage.local.set({
    subDelay, audDelay, speed,
    fontSize: fntSizeInput.value,
    fontColor: fntColorInput.value,
    bgChoice: bgChoiceInput.value,
    bgColor:  bgColorInput.value,
    bottomPx: posPxInput.value
  });
}

function loadSettings() {
  chrome.storage.local.get([
    'subDelay','audDelay','speed',
    'fontSize','fontColor','bgChoice','bgColor','bottomPx','volume'
  ], data => {
    if (data.subDelay  != null) subDelay  = data.subDelay;
    if (data.audDelay  != null) audDelay  = data.audDelay;
    if (data.speed     != null) speed     = data.speed;
    if (data.volume    != null) volumeSl.value = data.volume;

    if (data.fontSize  != null) fntSizeInput.value = data.fontSize;
    if (data.fontColor != null) fntColorInput.value = data.fontColor;
    if (data.bgChoice  != null) bgChoiceInput.value = data.bgChoice;
    if (data.bgColor   != null) bgColorInput.value = data.bgColor;
    if (data.bottomPx  != null) posPxInput.value   = data.bottomPx;

    subVal.textContent    = `${subDelay} ms`;
    audVal.textContent    = `${audDelay} ms`;
    speedVal.textContent  = `${speed.toFixed(2)}×`;
    video.playbackRate    = speed;
    video.volume          = data.volume ?? video.volume;

    // apply settings to subtitle container
    applyBtn.click();
    ensureAudio();
    if (delayNode) delayNode.delayTime.value = Math.max(0, audDelay/1000);
  });
}

// initial load
loadSettings();

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const paddedMins = mins.toString().padStart(2, '0');
  const paddedSecs = secs.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${paddedMins}:${paddedSecs}`;
  } else {
    return `${paddedMins}:${paddedSecs}`;
  }
}

function showStatusMessage(message) {
  const statusEl = document.getElementById('statusOverlay');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.style.opacity = '1';

  clearTimeout(statusEl._hideTimeout);
  statusEl._hideTimeout = setTimeout(() => {
    statusEl.style.opacity = '0';
  }, 1500); // Hide after 1.5 seconds
}



document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status-text");
  const messages = [
    "Setting up resources...",
    "Loading settings...",
    "Building UI...",
    "Starting engine...",
    "Finalizing...",
    "Ready!"
  ];

  let i = 0;

  function showNextMessage() {
    if (i < messages.length) {
      status.textContent = messages[i++];
      // Add a little randomness: delay between 500ms and 900ms
      const randomDelay = 500 + Math.random() * 400;
      setTimeout(showNextMessage, randomDelay);
    } else {
      // Done with messages – do whatever you want here
      // document.getElementById("splash-screen").style.display = 'none';
    }
  }

  showNextMessage();
});
