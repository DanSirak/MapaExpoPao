import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
const urlToken = new URLSearchParams(window.location.search).get('token');
if (urlToken) {
  sessionStorage.setItem('submit-token', urlToken);
  history.replaceState(null, '', window.location.pathname);
}
const token = sessionStorage.getItem('submit-token');

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
  center: [-3.7038, 40.4168],
  zoom: 8,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');

let pendingMarker = null;

// --- Panel elements ---
const coordsDisplay = document.getElementById('coords-display');
const latValue = document.getElementById('lat-value');
const lngValue = document.getElementById('lng-value');
const messageInput = document.getElementById('message-input');
const submitBtn = document.getElementById('submit-btn');
const cancelBtn = document.getElementById('cancel-btn');
const formSection = document.getElementById('form-section');
const statusMsg = document.getElementById('status-msg');

// --- Load existing markers on map ready ---
map.on('load', async () => {
  await loadMarkers();
});

// --- Click on map ---
map.on('click', (e) => {
  if (e.originalEvent.target.closest('.maplibregl-marker')) return;

  const { lng, lat } = e.lngLat;

  // Remove previous pending marker if any
  if (pendingMarker) pendingMarker.remove();

  pendingMarker = new maplibregl.Marker({ color: '#f59e0b' })
    .setLngLat([lng, lat])
    .addTo(map);

  latValue.textContent = lat.toFixed(6);
  lngValue.textContent = lng.toFixed(6);
  coordsDisplay.classList.remove('hidden');
  formSection.classList.remove('hidden');
  statusMsg.textContent = '';
  messageInput.focus();
});

// --- Submit ---
submitBtn.addEventListener('click', async () => {
  const lat = parseFloat(latValue.textContent);
  const lng = parseFloat(lngValue.textContent);
  const message = messageInput.value.trim();

  if (!message) {
    statusMsg.textContent = 'Escribe un mensaje antes de guardar.';
    statusMsg.className = 'status error';
    return;
  }

  submitBtn.disabled = true;
  statusMsg.textContent = 'Guardando...';
  statusMsg.className = 'status';

  try {
    let res;
    try {
      res = await fetch(`${API_BASE}/markers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, message, token }),
      });
    } catch {
      throw new Error('No se puede conectar con el servidor. ¿Está activo?');
    }

    if (res.status === 403) throw new Error('Token inválido. Escanea el QR de la exposición.');
    if (res.status === 429) throw new Error('Demasiados envíos. Espera un momento.');
    if (res.status === 400) {
      const body = await res.json();
      throw new Error(body.error ?? 'Datos incorrectos.');
    }
    if (!res.ok) throw new Error(`Error del servidor (${res.status}).`);

    const saved = await res.json();

    // Replace pending marker with a permanent one
    if (pendingMarker) pendingMarker.remove();
    pendingMarker = null;

    addMarkerToMap(saved);
    resetPanel();
    statusMsg.textContent = '¡Punto guardado!';
    statusMsg.className = 'status success';
    setTimeout(() => (statusMsg.textContent = ''), 3000);
  } catch (err) {
    statusMsg.textContent = err.message;
    statusMsg.className = 'status error';
  } finally {
    submitBtn.disabled = false;
  }
});

// --- Cancel ---
cancelBtn.addEventListener('click', () => {
  if (pendingMarker) pendingMarker.remove();
  pendingMarker = null;
  resetPanel();
});

function resetPanel() {
  coordsDisplay.classList.add('hidden');
  formSection.classList.add('hidden');
  messageInput.value = '';
}

// --- Load markers from server ---
async function loadMarkers() {
  try {
    const res = await fetch(`${API_BASE}/markers`);
    if (!res.ok) throw new Error();
    const markers = await res.json();
    markers.forEach(addMarkerToMap);
  } catch {
    console.warn('No se pudieron cargar los marcadores. ¿Está el servidor activo?');
  }
}

function addMarkerToMap(marker) {
  const popup = new maplibregl.Popup({ offset: 25 }).setHTML(`
    <div class="popup-content">
      <p class="popup-message">${escapeHtml(marker.message)}</p>
      <p class="popup-coords">${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)}</p>
    </div>
  `);

  new maplibregl.Marker({ color: '#3b82f6' })
    .setLngLat([marker.lng, marker.lat])
    .setPopup(popup)
    .addTo(map);

}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
