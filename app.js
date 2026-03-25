// ══════════════════════════════════════════════════════════════════════
//  GeoNotes PWA — Application Logic
// ══════════════════════════════════════════════════════════════════════
const API_URL = 'api/main.php';
const STORAGE_KEY = 'geonotes_data';
const PENDING_KEY = 'geonotes_pending';

const noteInput = document.getElementById('noteInput');
const nameInput = document.getElementById('nameInput');
const notesGrid = document.getElementById('notesGrid');
const emptyState = document.getElementById('emptyState');
const noteCount = document.getElementById('noteCount');
const charCount = document.getElementById('charCount');
const btnClearAll = document.getElementById('btnClearAll');
const btnExport = document.getElementById('btnExport');
const btnSave = document.getElementById('btnSave');
const offlineBanner = document.getElementById('offlineBanner');
const connectionStatus = document.getElementById('connectionStatus');
const searchInput = document.getElementById('searchInput');

// Restore last used name from localStorage
const savedName = localStorage.getItem('geonotes_username');
if (savedName && nameInput) nameInput.value = savedName;

document.getElementById('year').textContent = new Date().getFullYear();

let allNotes = [];
let selectedCat = 'general';
let filterCat = 'all';
let currentPhoto = null;
let editingNote = null;
let deferredPrompt = null;
let statsChart = null;
let selectedVisibility = 'publico';

const CAT_COLORS = {
    general: { bg: 'rgba(99,102,241,.15)', color: '#818cf8', label: '📌 General' },
    trabajo: { bg: 'rgba(16,185,129,.15)', color: '#34d399', label: '💼 Trabajo' },
    personal: { bg: 'rgba(244,114,182,.15)', color: '#f472b6', label: '💜 Personal' },
    escuela: { bg: 'rgba(251,191,36,.15)', color: '#fbbf24', label: '📚 Escuela' },
    idea: { bg: 'rgba(139,92,246,.15)', color: '#a78bfa', label: '💡 Idea' }
};

// ── LOCAL STORAGE ─────────────────────────────────────────────────
function getLocalNotes() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function setLocalNotes(n) { localStorage.setItem(STORAGE_KEY, JSON.stringify(n)); }
function getPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch { return []; } }
function setPending(a) { localStorage.setItem(PENDING_KEY, JSON.stringify(a)); }

// ── API HELPERS ───────────────────────────────────────────────────
async function apiGet(action) {
    const r = await fetch(`${API_URL}?action=${action}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}
async function apiPost(action, body) {
    const r = await fetch(`${API_URL}?action=${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}
async function apiPut(action, id, body) {
    const r = await fetch(`${API_URL}?action=${action}&id=${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}
async function apiDelete(action, id) {
    const u = id != null ? `${API_URL}?action=${action}&id=${id}` : `${API_URL}?action=${action}`;
    const r = await fetch(u, { method: 'DELETE' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}

// ── CATEGORY SELECTOR ─────────────────────────────────────────────
function selectCat(cat) {
    selectedCat = cat;
    document.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
}
function filterByCat(cat) {
    filterCat = cat;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === cat));
    filterNotes();
}

// ── VISIBILITY SELECTOR ───────────────────────────────────────────
function selectVisibility(vis) {
    selectedVisibility = vis;
    const isPub = vis === 'publico';
    const bPub = document.getElementById('btnPub');
    const bPriv = document.getElementById('btnPriv');

    bPub.className = isPub 
        ? 'flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-400 ring-1 ring-indigo-500/30 transition hover:bg-indigo-500/20 active:scale-95 ring-2'
        : 'flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 ring-1 ring-slate-700 transition hover:bg-slate-700 active:scale-95';

    bPriv.className = !isPub 
        ? 'flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-400 ring-1 ring-indigo-500/30 transition hover:bg-indigo-500/20 active:scale-95 ring-2'
        : 'flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 ring-1 ring-slate-700 transition hover:bg-slate-700 active:scale-95';
}

// ── PHOTO CAPTURE ─────────────────────────────────────────────────
function handlePhoto(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX = 300;
            let w = img.width, h = img.height;
            if (w > h) { h = h * MAX / w; w = MAX; } else { w = w * MAX / h; h = MAX; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            currentPhoto = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('photoPreview').src = currentPhoto;
            document.getElementById('photoPreview').classList.remove('hidden');
            document.getElementById('removePhoto').classList.remove('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function removePhoto() {
    currentPhoto = null;
    document.getElementById('photoInput').value = '';
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('removePhoto').classList.add('hidden');
}

// ── LOAD NOTES ────────────────────────────────────────────────────
// ── MERGE LOCAL & SERVER ──────────────────────────────────────────
function mergeNotes(serverNotes) {
    const localNotes = getLocalNotes();
    const myPrivateNotes = localNotes.filter(n => n.visibilidad === 'privado');
    const merged = [...serverNotes];
    myPrivateNotes.forEach(pn => {
        if (!merged.find(m => (m.id && m.id === pn.id) || m.timestamp === pn.timestamp)) {
            merged.push(pn);
        }
    });
    merged.sort((a,b) => (b.timestamp || b.id) - (a.timestamp || a.id));
    return merged;
}

async function loadNotes() {
    if (navigator.onLine) {
        try {
            const serverNotes = await apiGet('list');
            allNotes = mergeNotes(serverNotes);
            setLocalNotes(allNotes);
        } catch (e) {
            console.warn('[App] API unavailable:', e);
            allNotes = getLocalNotes();
        }
    } else {
        allNotes = getLocalNotes();
    }
    filterNotes();
    loadStats();
}

function filterNotes() {
    let notes = [...allNotes];
    const q = searchInput.value.toLowerCase().trim();
    if (q) notes = notes.filter(n => n.text.toLowerCase().includes(q));
    if (filterCat !== 'all') notes = notes.filter(n => (n.categoria || 'general') === filterCat);
    
    // In many-to-one local state, we might have our own private notes in localStorage
    // Merge them if they are not already in the list
    if (navigator.onLine) {
        const local = getLocalNotes();
        local.forEach(ln => {
            if (ln.visibilidad === 'privado' && !notes.find(n => n.id === ln.id || n.timestamp === ln.timestamp)) {
                notes.unshift(ln);
            }
        });
        // Sort again
        notes.sort((a,b) => (b.id || b.timestamp) - (a.id || a.timestamp));
    }

    renderNotes(notes);
}

// ── RENDER NOTES ──────────────────────────────────────────────────
function renderNotes(notes) {
    notesGrid.innerHTML = '';
    noteCount.textContent = notes.length;
    emptyState.classList.toggle('hidden', notes.length > 0);
    btnClearAll.classList.toggle('hidden', notes.length === 0);
    btnExport.classList.toggle('hidden', notes.length === 0);

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card glass rounded-2xl p-5 animate-fade-in';
        card.onclick = (e) => { if (!e.target.closest('button')) openMapModal(note); };

        const date = new Date(note.timestamp);
        const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        const isSynced = note.id != null;
        const isPrivate = note.visibilidad === 'privado';
        
        const syncBadge = isSynced
            ? `<span class="sync-badge synced">✓ MySQL</span>`
            : '<span class="sync-badge local">⏳ Local</span>';
        
        const visBadge = isPrivate
            ? `<span class="sync-badge local" style="background:rgba(139,92,246,.15);color:#a78bfa" title="Solo accesible con código">🔒 Privada ${note.share_code ? `[${note.share_code}]` : ''}</span>`
            : '';

        const cat = note.categoria || 'general';
        const catInfo = CAT_COLORS[cat] || CAT_COLORS.general;
        const shareMsg = isPrivate && note.share_code 
            ? `Nota Privada GeoNotes: "${note.text}" (Ubicación: ${note.lat ? `${note.lat.toFixed(4)}, ${note.lng.toFixed(4)}` : 'Sin ubicación'}). Usa el código [ ${note.share_code} ] para verla.`
            : `Nota GeoNotes: "${note.text}" ${note.lat ? `(Google Maps: https://www.google.com/maps?q=${note.lat},${note.lng})` : ''}`;
        const safeMsg = shareMsg.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        card.innerHTML = `
      ${note.photo ? `<img src="${note.photo}" class="w-full h-32 object-cover rounded-xl mb-3" alt="Foto"/>` : ''}
      <div class="mb-3 flex items-start justify-between gap-2">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            ${note.nombre ? `<p class="text-xs font-semibold text-indigo-400">👤 ${escapeHTML(note.nombre)}</p>` : ''}
            ${visBadge}
          </div>
          <p class="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap break-words">${escapeHTML(note.text)}</p>
          ${isPrivate && note.share_code ? `<p class="mt-2 text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded inline-block">Código amigo: ${note.share_code}</p>` : ''}
        </div>
        <div class="flex shrink-0 gap-1">
          <button onclick="event.stopPropagation();shareNote('${safeMsg}')" class="rounded-lg p-1.5 text-slate-500 transition hover:bg-indigo-500/15 hover:text-indigo-400" title="Compartir">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
          </button>
          <button onclick="event.stopPropagation();openEditModal(${isSynced ? note.id : -1},'${note.timestamp}')" class="rounded-lg p-1.5 text-slate-500 transition hover:bg-amber-500/15 hover:text-amber-400" title="Editar">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick="event.stopPropagation();deleteNote(${isSynced ? note.id : -1},'${note.timestamp}')" class="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/15 hover:text-red-400" title="Eliminar">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span class="cat-pill" style="background:${catInfo.bg};color:${catInfo.color};cursor:default;font-size:10px">${catInfo.label}</span>
        <span>📅 ${dateStr} · ${timeStr}</span>
        ${note.lat != null ? `<span class="text-indigo-400/80">📍 ${note.lat.toFixed(4)}, ${note.lng.toFixed(4)}</span>` : '<span class="text-slate-600 italic">Sin ubicación</span>'}
        ${syncBadge}
      </div>
    `;
        notesGrid.appendChild(card);
    });
}

// ── SAVE NOTE ─────────────────────────────────────────────────────
function saveNote() {
    const nombre = nameInput.value.trim();
    if (!nombre) { showToast('Escribe tu nombre antes de guardar.', 'warn'); nameInput.focus(); nameInput.classList.add('ring-red-500'); setTimeout(() => nameInput.classList.remove('ring-red-500'), 2000); return; }
    const text = noteInput.value.trim();
    if (!text) { showToast('Escribe algo antes de guardar.', 'warn'); noteInput.focus(); return; }
    // Save name for next time
    localStorage.setItem('geonotes_username', nombre);
    btnSave.disabled = true;
    btnSave.innerHTML = '<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Guardando…';

    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            pos => commitNote(text, nombre, pos.coords.latitude, pos.coords.longitude),
            () => commitNote(text, nombre, null, null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    } else {
        commitNote(text, nombre, null, null);
    }
}

async function commitNote(text, nombre, lat, lng) {
    const noteData = { text, nombre, lat, lng, categoria: selectedCat, photo: currentPhoto || null, visibilidad: selectedVisibility };

    if (navigator.onLine) {
        try {
            const result = await apiPost('save', noteData);
            // Save our own notes to localStorage so we see them even if they are private
            const notes = getLocalNotes();
            notes.unshift(result);
            setLocalNotes(notes);
            showToast(result.visibilidad === 'privado' ? '¡Nota privada guardada! Usa el código para compartir.' : '¡Nota guardada en MySQL!', 'success');
        } catch {
            saveToLocalFallback(noteData);
            showToast('Guardada localmente.', 'warn');
        }
    } else {
        saveToLocalFallback(noteData);
        showToast('Guardada localmente — se sincronizará al conectar.', 'warn');
    }

    noteInput.value = '';
    charCount.textContent = '0 caracteres';
    removePhoto();
    selectVisibility('publico'); // Reset to public
    restoreSaveButton();
    sendTestNotification(text);
    await loadNotes();
}

function saveToLocalFallback(noteData) {
    const notes = getLocalNotes();
    const localNote = { ...noteData, timestamp: Date.now() };
    notes.unshift(localNote);
    setLocalNotes(notes);
    const pending = getPending();
    pending.push(localNote);
    setPending(pending);
}

// ── SYNC PENDING ──────────────────────────────────────────────────
async function syncPendingNotes() {
    const pending = getPending();
    if (!pending.length) return;
    let synced = 0;
    for (const note of pending) {
        try {
            await apiPost('save', { text: note.text, nombre: note.nombre, lat: note.lat, lng: note.lng, categoria: note.categoria });
            synced++;
        } catch { break; }
    }
    if (synced > 0) {
        setPending(pending.slice(synced));
        showToast(`${synced} nota(s) sincronizada(s) con MySQL.`, 'success');
        await loadNotes();
    }
}

// ── DELETE / CLEAR ────────────────────────────────────────────────
async function deleteNote(dbId, timestamp) {
    if (navigator.onLine && dbId > 0) {
        try { await apiDelete('delete', dbId); } catch (e) { console.warn(e); }
    }
    const notes = getLocalNotes().filter(n => String(n.timestamp) !== String(timestamp));
    setLocalNotes(notes);
    showToast('Nota eliminada.', 'info');
    await loadNotes();
}

async function clearAllNotes() {
    if (!confirm('¿Eliminar todas las notas? Esta acción no se puede deshacer.')) return;
    if (navigator.onLine) { try { await apiDelete('clear'); } catch { } }
    setLocalNotes([]);
    setPending([]);
    showToast('Todas las notas eliminadas.', 'info');
    await loadNotes();
}

function restoreSaveButton() {
    btnSave.disabled = false;
    btnSave.innerHTML = '<span class="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"></span><svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg> Guardar Nota';
}

// ── EDIT NOTE ─────────────────────────────────────────────────────
function openEditModal(dbId, timestamp) {
    const note = allNotes.find(n => (dbId > 0 && n.id === dbId) || String(n.timestamp) === String(timestamp));
    if (!note) return;
    editingNote = { dbId, timestamp };
    document.getElementById('editTextarea').value = note.text;
    document.getElementById('editModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('editModal').classList.remove('active');
    document.body.style.overflow = '';
}

async function submitEdit() {
    if (!editingNote) return;
    const newText = document.getElementById('editTextarea').value.trim();
    if (!newText) { showToast('El texto no puede estar vacío.', 'warn'); return; }

    if (navigator.onLine && editingNote.dbId > 0) {
        try { await apiPut('update', editingNote.dbId, { text: newText }); } catch (e) { console.warn(e); }
    }

    const notes = getLocalNotes();
    const idx = notes.findIndex(n => String(n.timestamp) === String(editingNote.timestamp));
    if (idx >= 0) { notes[idx].text = newText; setLocalNotes(notes); }

    closeEditModal();
    showToast('Nota actualizada.', 'success');
    await loadNotes();
}

// ── SHARE NOTE ────────────────────────────────────────────────────
async function shareNote(text) {
    if (navigator.share) {
        try { await navigator.share({ title: 'GeoNotes', text }); } catch { }
    } else {
        await navigator.clipboard.writeText(text);
        showToast('Nota copiada al portapapeles.', 'success');
    }
}

// ── EXPORT CSV ────────────────────────────────────────────────────
function exportCSV() {
    if (!allNotes.length) return;
    let csv = 'Nombre,Texto,Categoria,Latitud,Longitud,Fecha\n';
    allNotes.forEach(n => {
        const nombre = (n.nombre || '').replace(/"/g, '""');
        const text = (n.text || '').replace(/"/g, '""');
        const fecha = new Date(n.timestamp).toLocaleString('es-ES');
        csv += `"${nombre}","${text}","${n.categoria || 'general'}","${n.lat || ''}","${n.lng || ''}","${fecha}"\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'geonotes_export.csv';
    a.click();
    showToast('CSV descargado.', 'success');
}

// ── THEME TOGGLE ──────────────────────────────────────────────────
function toggleTheme() {
    document.documentElement.classList.toggle('light');
    const isLight = document.documentElement.classList.contains('light');
    localStorage.setItem('geonotes_theme', isLight ? 'light' : 'dark');
    document.getElementById('themeIcon').innerHTML = isLight
        ? '<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>';
}
if (localStorage.getItem('geonotes_theme') === 'light') toggleTheme();

// ── STATS CHART ───────────────────────────────────────────────────
async function loadStats() {
    let data = [];
    if (navigator.onLine) {
        try { data = await apiGet('stats'); } catch { }
    }
    if (!data.length) {
        const counts = {};
        allNotes.forEach(n => {
            const d = new Date(n.timestamp).toISOString().slice(0, 10);
            counts[d] = (counts[d] || 0) + 1;
        });
        data = Object.entries(counts).sort().slice(-7).map(([dia, total]) => ({ dia, total }));
    }
    if (!data.length) return;

    const labels = data.map(d => { const p = d.dia.split('-'); return `${p[2]}/${p[1]}`; }).reverse();
    const values = data.map(d => parseInt(d.total)).reverse();

    if (statsChart) statsChart.destroy();
    statsChart = new Chart(document.getElementById('statsChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Notas',
                data: values,
                backgroundColor: 'rgba(99,102,241,.5)',
                borderColor: '#6366f1',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, color: '#64748b' }, grid: { color: 'rgba(148,163,184,.1)' } },
                x: { ticks: { color: '#64748b' }, grid: { display: false } }
            }
        }
    });
}

// ── MAP MODAL ─────────────────────────────────────────────────────
let leafletMap = null;

function openMapModal(note) {
    const modal = document.getElementById('mapModal');
    const noteText = document.getElementById('modalNoteText');
    const noteDate = document.getElementById('modalNoteDate');
    const modalTitle = document.getElementById('modalTitle');
    const modalCoords = document.getElementById('modalCoords');
    const modalPhoto = document.getElementById('modalPhoto');

    modalTitle.textContent = note.nombre ? `De: ${note.nombre}` : 'Nota Guardada';
    noteText.textContent = note.text;
    
    // Privacy info
    const isPriv = note.visibilidad === 'privado';
    const visHtml = isPriv 
        ? `<div class="mt-3 flex items-center gap-2 rounded-lg bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30">
             <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
             Nota Privada — Código: <span class="font-mono font-bold tracking-wider">${note.share_code || 'N/A'}</span>
           </div>`
        : '';
    
    const date = new Date(note.timestamp);
    noteDate.innerHTML = `
        ${visHtml}
        <div class="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </div>
    `;

    if (note.photo) { modalPhoto.src = note.photo; modalPhoto.classList.remove('hidden'); }
    else { modalPhoto.classList.add('hidden'); }

    if (note.lat != null && note.lng != null) {
        modalCoords.textContent = `📍 ${note.lat.toFixed(6)}, ${note.lng.toFixed(6)}`;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (navigator.onLine) {
            // Online: show interactive Leaflet map
            document.getElementById('mapContainer').style.display = 'block';
            document.getElementById('mapContainer').innerHTML = '';
            setTimeout(() => {
                if (leafletMap) leafletMap.remove();
                leafletMap = L.map('mapContainer').setView([note.lat, note.lng], 15);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; OpenStreetMap'
                }).addTo(leafletMap);
                L.marker([note.lat, note.lng]).addTo(leafletMap)
                    .bindPopup(`<b>📝 Nota</b><br>${escapeHTML(note.text.substring(0, 60))}`)
                    .openPopup();
                leafletMap.invalidateSize();
            }, 100);
        } else {
            // Offline: show styled static location card
            document.getElementById('mapContainer').style.display = 'block';
            const gmapsUrl = `https://www.google.com/maps?q=${note.lat},${note.lng}`;
            document.getElementById('mapContainer').innerHTML = `
                <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(30,41,59,.9),rgba(15,23,42,.95));border-radius:12px;padding:24px;text-align:center;gap:12px">
                    <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:grid;place-items:center;box-shadow:0 0 30px rgba(99,102,241,.3)">
                        <svg style="width:28px;height:28px;color:white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                    </div>
                    <p style="color:#c7d2fe;font-size:13px;font-weight:600;margin:0">Ubicación guardada</p>
                    <p style="color:#818cf8;font-size:15px;font-weight:700;font-family:monospace;margin:0">${note.lat.toFixed(6)}, ${note.lng.toFixed(6)}</p>
                    <div style="display:flex;align-items:center;gap:6px;padding:4px 12px;border-radius:8px;background:rgba(251,191,36,.12);margin-top:2px">
                        <svg style="width:14px;height:14px;color:#fbbf24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4m0 4h.01"/>
                        </svg>
                        <span style="color:#fbbf24;font-size:11px;font-weight:500">Sin conexión — el mapa se mostrará al reconectar</span>
                    </div>
                    <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:8px 16px;border-radius:10px;background:rgba(99,102,241,.15);color:#a5b4fc;font-size:12px;font-weight:600;text-decoration:none;border:1px solid rgba(99,102,241,.25);transition:all .2s" onmouseover="this.style.background='rgba(99,102,241,.25)'" onmouseout="this.style.background='rgba(99,102,241,.15)'">
                        <svg style="width:14px;height:14px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                        </svg>
                        Abrir en Google Maps
                    </a>
                </div>
            `;
        }
    } else {
        document.getElementById('modalTitle').textContent = 'Nota sin ubicación';
        document.getElementById('modalCoords').textContent = 'Sin coordenadas GPS.';
        document.getElementById('mapContainer').style.display = 'none';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeMapModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('mapModal').classList.remove('active');
    document.body.style.overflow = '';
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
}

// ── PWA INSTALL PROMPT ────────────────────────────────────────────
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const installDismissed = localStorage.getItem('geonotes_install_dismissed');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone && !installDismissed) {
        document.getElementById('installBanner').classList.remove('hidden');
    }
});

// If beforeinstallprompt doesn't fire (iOS, in-app browsers, etc.)
// show manual install instructions after a short delay
if (!isStandalone && !installDismissed) {
    setTimeout(() => {
        // If the native prompt already showed, skip
        if (deferredPrompt) return;
        const iosBanner = document.getElementById('iosInstallBanner');
        if (isIOS) {
            // Show iOS-specific steps (Share → Add to Home Screen)
            document.getElementById('iosSteps').classList.remove('hidden');
            document.getElementById('genericSteps').classList.add('hidden');
        } else {
            // Show generic browser steps (Menu → Install)
            document.getElementById('iosSteps').classList.add('hidden');
            document.getElementById('genericSteps').classList.remove('hidden');
        }
        iosBanner.classList.remove('hidden');
    }, 3000);
}

function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        document.getElementById('installBanner').classList.add('hidden');
    });
}

function dismissInstall() {
    document.getElementById('installBanner').classList.add('hidden');
    localStorage.setItem('geonotes_install_dismissed', '1');
}

function dismissIOSInstall() {
    document.getElementById('iosInstallBanner').classList.add('hidden');
    localStorage.setItem('geonotes_install_dismissed', '1');
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────
function requestNotificationPermission() {
    if (!('Notification' in window)) { showToast('Tu navegador no soporta notificaciones.', 'warn'); return; }
    Notification.requestPermission().then(p => {
        if (p === 'granted') {
            showToast('¡Notificaciones activadas!', 'success');
            updateNotifButton();
            new Notification('GeoNotes PWA', { body: '🎉 Notificaciones activadas.', icon: 'icon-192.png' });
        } else {
            showToast('Permiso denegado.', 'warn');
        }
    });
}

function sendTestNotification(text) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('GeoNotes — Nueva Nota', {
            body: text.length > 80 ? text.slice(0, 80) + '…' : text,
            icon: 'icon-192.png'
        });
    }
}

function updateNotifButton() {
    if ('Notification' in window && Notification.permission === 'granted') {
        document.getElementById('notifLabel').textContent = 'Activas';
    }
}

// ── ONLINE / OFFLINE ──────────────────────────────────────────────
function updateOnlineStatus() {
    const on = navigator.onLine;
    offlineBanner.classList.toggle('hidden', on);
    connectionStatus.innerHTML = on
        ? '<span class="text-emerald-400">● Conectado — MySQL</span>'
        : '<span class="text-amber-400">● Sin conexión — localStorage</span>';
    if (on) syncPendingNotes();
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ── TOAST ─────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const colors = {
        success: 'bg-emerald-600/90 text-white',
        warn: 'bg-amber-500/90 text-slate-900',
        info: 'bg-slate-700/90 text-slate-100'
    };
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg backdrop-blur animate-fade-in ${colors[type] || colors.info}`;
    t.innerHTML = `<span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = 'opacity .3s';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

// ── UTILITIES ─────────────────────────────────────────────────────
function escapeHTML(s) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
}

noteInput.addEventListener('input', () => {
    charCount.textContent = `${noteInput.value.length} caracteres`;
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMapModal(); closeEditModal(); }
});

// ── ACCESS PRIVATE NOTE ───────────────────────────────────────────
async function accessPrivateNote() {
    const input = document.getElementById('codeSearchInput');
    const code = input.value.trim().toUpperCase();
    if (!code) { showToast('Ingresa un código.', 'warn'); return; }

    try {
        const response = await fetch(`api.php?action=get_by_code&code=${code}`);
        if (!response.ok) {
            if (response.status === 404) throw new Error('Código no válido o nota inexistente.');
            throw new Error('Error al buscar la nota.');
        }
        const note = await response.json();
        
        // Show in map modal
        openMapModal(note);
        input.value = '';
        showToast('Nota encontrada.', 'success');
    } catch (e) {
        showToast(e.message, 'warn');
    }
}

// ── SERVICE WORKER ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(r => console.log('[App] SW:', r.scope))
            .catch(e => console.warn(e));
    });
}

// ── DOWNLOAD / INSTALL BUTTON ─────────────────────────────────────
function triggerInstall() {
    if (deferredPrompt) {
        // Chrome/Edge: use native install prompt
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
            document.getElementById('installBanner').classList.add('hidden');
        });
    } else if (isIOS) {
        // iOS: show the manual instructions banner
        document.getElementById('iosSteps').classList.remove('hidden');
        document.getElementById('genericSteps').classList.add('hidden');
        document.getElementById('iosInstallBanner').classList.remove('hidden');
    } else {
        // Other browsers: show generic instructions
        document.getElementById('iosSteps').classList.add('hidden');
        document.getElementById('genericSteps').classList.remove('hidden');
        document.getElementById('iosInstallBanner').classList.remove('hidden');
    }
}

// Hide download button if already installed as standalone
if (isStandalone) {
    const dl = document.getElementById('btnDownload');
    if (dl) dl.style.display = 'none';
}

// ── AUTO-RELOAD (poll every 10s when online) ──────────────────────
let autoReloadInterval = null;
function startAutoReload() {
    if (autoReloadInterval) return;
    autoReloadInterval = setInterval(async () => {
        if (!navigator.onLine) return;
        try {
            const freshNotes = await apiGet('list');
            // Validate response is an array
            if (!Array.isArray(freshNotes)) return;
            // Check if anything changed: different count or different newest note
            const changed = freshNotes.length !== allNotes.length
                || (freshNotes.length > 0 && allNotes.length > 0 && freshNotes[0].id !== allNotes[0].id)
                || (freshNotes.length > 0 && allNotes.length === 0);
            if (changed) {
                allNotes = mergeNotes(freshNotes);
                setLocalNotes(allNotes);
                filterNotes();
                loadStats();
                console.log('[AutoReload] Updated notes:', allNotes.length);
            }
        } catch (e) { console.warn('[AutoReload]', e); }
    }, 10000);
}

// ── INIT ──────────────────────────────────────────────────────────
loadNotes();
updateOnlineStatus();
updateNotifButton();
startAutoReload();
