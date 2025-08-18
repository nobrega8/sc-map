const map = L.map('map').setView([39.5, -8.0], 7);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Global variables for club data and markers
let allClubs = [];
let activeMarkers = new Map();
let loadMarkersTimeout;

function criarIcon(logoUrl) {
    return L.icon({
        iconUrl: logoUrl,
        iconSize: [50, 50],
        className: 'club-icon'
    });
}

function createPlaceholderIcon() {
    // Create a simple placeholder icon for clubs not yet loaded
    return L.divIcon({
        html: '<div class="placeholder-club-icon">⚽</div>',
        iconSize: [30, 30],
        className: 'placeholder-icon'
    });
}

function createEquipmentHTML(equipamentos) {
    if (!equipamentos || equipamentos.length === 0) {
        return '';
    }
    
    let equipmentHTML = '<div class="equipment-container">';
    equipamentos.forEach(equipment => {
        if (equipment.url) {
            equipmentHTML += `
                <div class="equipment-item">
                    <img src="${equipment.url}" alt="${equipment.alt_text || equipment.type}" class="equipment-img" 
                         onerror="this.style.display='none'">
                    <span class="equipment-type">${equipment.type}</span>
                </div>
            `;
        }
    });
    equipmentHTML += '</div>';
    
    return equipmentHTML;
}

// Load markers for clubs in the current viewport with a buffer
function loadVisibleMarkers() {
    const startTime = performance.now();
    const bounds = map.getBounds();
    
    // Add a buffer zone around the visible area to preload nearby clubs
    const bufferFactor = 0.2; // 20% buffer
    const latDiff = bounds.getNorth() - bounds.getSouth();
    const lngDiff = bounds.getEast() - bounds.getWest();
    
    const bufferedBounds = L.latLngBounds([
        [bounds.getSouth() - latDiff * bufferFactor, bounds.getWest() - lngDiff * bufferFactor],
        [bounds.getNorth() + latDiff * bufferFactor, bounds.getEast() + lngDiff * bufferFactor]
    ]);
    
    let markersAdded = 0;
    let markersRemoved = 0;
    
    allClubs.forEach(clube => {
        if (clube.latitude && clube.longitude) {
            const clubKey = clube.id;
            const isInBufferedViewport = bufferedBounds.contains([clube.latitude, clube.longitude]);
            const hasMarker = activeMarkers.has(clubKey);
            
            if (isInBufferedViewport && !hasMarker) {
                // Create marker for club in buffered viewport
                const marker = L.marker(
                    [clube.latitude, clube.longitude],
                    { icon: criarIcon(clube.logo) }
                ).addTo(map);

                const equipmentHTML = createEquipmentHTML(clube.equipamentos);
                const stadiumInfo = clube.stadium ? `<div class="popup-info">Estádio: ${clube.stadium}</div>` : '';
                
                const popupHTML = `
                    <div class="popup-content">
                        <div class="popup-title">${clube.club}</div>
                        ${stadiumInfo}
                        ${equipmentHTML}
                        <a href="${clube.url}" target="_blank" class="popup-link">Ver no ZeroZero</a>
                    </div>
                `;
                marker.bindPopup(popupHTML);
                
                // Store the marker
                activeMarkers.set(clubKey, marker);
                markersAdded++;
            } else if (!isInBufferedViewport && hasMarker) {
                // Remove marker for club outside buffered viewport
                const marker = activeMarkers.get(clubKey);
                map.removeLayer(marker);
                activeMarkers.delete(clubKey);
                markersRemoved++;
            }
        }
    });
    
    const endTime = performance.now();
    if (markersAdded > 0 || markersRemoved > 0) {
        console.log(`Lazy loading: +${markersAdded} -${markersRemoved} markers. Active: ${activeMarkers.size}. Time: ${(endTime - startTime).toFixed(1)}ms`);
    }
}

// Debounced version of loadVisibleMarkers to improve performance
function debouncedLoadVisibleMarkers() {
    clearTimeout(loadMarkersTimeout);
    loadMarkersTimeout = setTimeout(loadVisibleMarkers, 150);
}

// Add map event listeners for dynamic loading
map.on('moveend', debouncedLoadVisibleMarkers);
map.on('zoomend', debouncedLoadVisibleMarkers);
function toggleSubmissionForm() {
    const form = document.getElementById('submission-form');
    form.classList.toggle('hidden');
    
    // Reset form when closing
    if (form.classList.contains('hidden')) {
        document.getElementById('club-form').reset();
    }
}

// Handle form submission
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('club-form');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Extract club ID from ZeroZero URL
        const url = document.getElementById('club-url').value;
        const clubId = extractClubId(url);
        
        const clubData = {
            id: clubId,
            club: document.getElementById('club-name').value,
            stadium: document.getElementById('club-stadium').value || null,
            logo: document.getElementById('club-logo').value,
            equipamentos: [], // Empty for now, can be filled manually
            address: document.getElementById('club-address').value || null,
            latitude: parseFloat(document.getElementById('club-latitude').value),
            longitude: parseFloat(document.getElementById('club-longitude').value),
            url: url
        };
        
        // Load existing submissions or create new array
        loadExistingSubmissions()
            .then(submissions => {
                submissions.push(clubData);
                downloadSubmissions(submissions);
                toggleSubmissionForm();
                alert('Submissão criada! O ficheiro submissions.json foi descarregado. Por favor, envie-o num Pull Request para o repositório.');
            })
            .catch(err => {
                console.error('Erro ao carregar submissões existentes:', err);
                // If no existing file, create new one
                downloadSubmissions([clubData]);
                toggleSubmissionForm();
                alert('Submissão criada! O ficheiro submissions.json foi descarregado. Por favor, envie-o num Pull Request para o repositório.');
            });
    });
});

// Extract club ID from ZeroZero URL
function extractClubId(url) {
    const match = url.match(/\/(\d+)$/);
    return match ? match[1] : new Date().getTime().toString();
}

// Load existing submissions.json if it exists
async function loadExistingSubmissions() {
    try {
        const response = await fetch('submissions.json');
        if (response.ok) {
            return await response.json();
        }
        throw new Error('No existing submissions file');
    } catch (err) {
        return [];
    }
}

// Download submissions as JSON file
function downloadSubmissions(submissions) {
    const dataStr = JSON.stringify(submissions, null, 4);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'submissions.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

// Load club data and initialize lazy loading
fetch('clubes.json')
    .then(response => response.json())
    .then(data => {
        allClubs = data;
        console.log(`Loaded ${allClubs.length} clubs. Implementing lazy loading for better performance.`);
        
        // Initial load of visible markers
        loadVisibleMarkers();
        
        // Log performance info
        const clubsWithLogos = allClubs.filter(club => club.logo).length;
        console.log(`${clubsWithLogos} clubs have logos. Only loading logos for clubs in viewport.`);
    })
    .catch(err => console.error('Erro ao carregar clubes.json:', err));
