// Initialize map if Leaflet is available, otherwise use fallback
let map;
if (typeof L !== 'undefined') {
    map = L.map('map').setView([39.5, -8.0], 7);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);
} else {
    // Fallback when Leaflet is not available
    console.warn('Leaflet not loaded, using fallback mode');
    map = {
        setView: function(coords, zoom) { console.log('Map setView:', coords, zoom); },
        on: function(event, handler) { console.log('Map event handler:', event); },
        getBounds: function() { 
            return {
                getNorth: () => 42,
                getSouth: () => 37,
                getEast: () => -6,
                getWest: () => -10
            };
        }
    };
}

// Global variables for club data and markers
let allClubs = [];
let activeMarkers = new Map();
let loadMarkersTimeout;
let currentFilter = 'all';
let availableCompetitions = new Set();

function criarIcon(logoUrl) {
    if (typeof L !== 'undefined') {
        return L.icon({
            iconUrl: logoUrl,
            iconSize: [50, 50],
            className: 'club-icon'
        });
    }
    return null; // Fallback
}

function createPlaceholderIcon() {
    if (typeof L !== 'undefined') {
        // Create a simple placeholder icon for clubs not yet loaded
        return L.divIcon({
            html: '<div class="placeholder-club-icon">⚽</div>',
            iconSize: [30, 30],
            className: 'placeholder-icon'
        });
    }
    return null; // Fallback
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

// Competition filter functions (filter button now just shows/hides sidebar)
function toggleCompetitionFilter() {
    const sidebar = document.getElementById('clubs-sidebar');
    if (sidebar) {
        sidebar.style.display = sidebar.style.display === 'none' ? 'block' : 'none';
        // Also adjust map margin
        const map = document.getElementById('map');
        if (sidebar.style.display === 'none') {
            map.style.marginLeft = '0';
        } else {
            map.style.marginLeft = '320px';
        }
    }
}

function buildCompetitionList() {
    // Collect all unique competitions from clubs
    availableCompetitions.clear();
    allClubs.forEach(club => {
        if (club.filtro && Array.isArray(club.filtro)) {
            club.filtro.forEach(competition => {
                availableCompetitions.add(competition);
            });
        }
    });

    // Build the filter UI
    const competitionList = document.getElementById('competition-list');
    competitionList.innerHTML = '';
    
    // Sort competitions alphabetically
    const sortedCompetitions = Array.from(availableCompetitions).sort();
    
    sortedCompetitions.forEach(competition => {
        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.setAttribute('data-filter', competition);
        button.textContent = formatCompetitionName(competition);
        button.onclick = () => setCompetitionFilter(competition);
        competitionList.appendChild(button);
    });
}

function formatCompetitionName(competition) {
    // Convert "portugal-1liga-2024" to "Portugal 1ª Liga 2024"
    const parts = competition.split('-');
    if (parts.length >= 3) {
        const country = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        const comp = parts[1].replace('1liga', '1ª Liga')
                           .replace('2liga', '2ª Liga')
                           .replace('3liga', '3ª Liga')
                           .replace('champions', 'Champions League')
                           .replace('taca', 'Taça')
                           .replace('aflisboa', 'AF Lisboa')
                           .replace('campeonato', 'Campeonato')
                           .replace('afsetubal', 'AF Setúbal')
                           .replace('afbraga', 'AF Braga')
                           .replace('afporto', 'AF Porto')
                           .replace('afmadeira', 'AF Madeira')
                           .replace('afviseu', 'AF Viseu')
                           .replace('afbraganca', 'AF Bragança')
                           .replace('afcoimbra', 'AF Coimbra')
                           .replace('afleiria', 'AF Leiria')
                           .replace('afguarda', 'AF Guarda')
                           .replace('afsantarém', 'AF Santarém');
        const year = parts[2];
        return `${country} ${comp} ${year}`;
    }
    return competition;
}

function setCompetitionFilter(filter) {
    currentFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (filter === 'all') {
        document.querySelector('.filter-btn[data-filter="all"]').classList.add('active');
    } else {
        document.querySelector(`.filter-btn[data-filter="${filter}"]`).classList.add('active');
    }
    
    // Reload markers with filter
    clearMarkers();
    loadVisibleMarkers();
    
    // Update clubs list to reflect filter
    buildClubsList();
}

function clearMarkers() {
    if (typeof L !== 'undefined') {
        activeMarkers.forEach(marker => {
            map.removeLayer(marker);
        });
    }
    activeMarkers.clear();
}

function shouldShowClub(club) {
    if (currentFilter === 'all') {
        return true;
    }
    
    if (!club.filtro || !Array.isArray(club.filtro)) {
        return false;
    }
    
    return club.filtro.includes(currentFilter);
}

// Load markers for clubs in the current viewport with a buffer
function loadVisibleMarkers() {
    if (typeof L === 'undefined') {
        console.log('Leaflet not available, skipping marker loading');
        return;
    }
    
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
            const shouldShow = shouldShowClub(clube);
            
            if (isInBufferedViewport && !hasMarker && shouldShow) {
                // Create marker for club in buffered viewport that matches filter
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
                        <div class="popup-actions">
                            <a href="${clube.url}" target="_blank" class="popup-link">Ver no ZeroZero</a>
                            <button onclick="openEditForm('${clube.id}')" class="edit-button">Sugerir Alteração</button>
                        </div>
                    </div>
                `;
                marker.bindPopup(popupHTML);
                
                // Store the marker
                activeMarkers.set(clubKey, marker);
                markersAdded++;
            } else if ((!isInBufferedViewport || !shouldShow) && hasMarker) {
                // Remove marker for club outside buffered viewport or doesn't match filter
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

// Add map event listeners for dynamic loading (only if Leaflet is available)
if (typeof L !== 'undefined') {
    map.on('moveend', debouncedLoadVisibleMarkers);
    map.on('zoomend', debouncedLoadVisibleMarkers);
}

// Club list functions for sidebar
function buildClubsList() {
    const clubsList = document.getElementById('clubs-list');
    if (!clubsList) return;
    
    clubsList.innerHTML = '';
    
    // Filter clubs based on current filter and search
    const searchTerm = document.getElementById('club-search')?.value.toLowerCase() || '';
    const filteredClubs = allClubs.filter(club => {
        // Apply competition filter
        const matchesFilter = shouldShowClub(club);
        
        // Apply search filter
        const matchesSearch = !searchTerm || 
            club.club.toLowerCase().includes(searchTerm) ||
            (club.stadium && club.stadium.toLowerCase().includes(searchTerm));
        
        return matchesFilter && matchesSearch;
    });
    
    // Sort clubs alphabetically
    filteredClubs.sort((a, b) => a.club.localeCompare(b.club));
    
    filteredClubs.forEach(club => {
        const clubItem = document.createElement('div');
        clubItem.className = 'club-item';
        clubItem.onclick = () => navigateToClub(club);
        
        const logoUrl = club.logo || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%23f0f0f0" stroke="%23ccc"/><text x="16" y="20" text-anchor="middle" font-size="16">⚽</text></svg>';
        
        clubItem.innerHTML = `
            <img src="${logoUrl}" alt="${club.club}" class="club-logo" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"32\\" height=\\"32\\" viewBox=\\"0 0 32 32\\"><circle cx=\\"16\\" cy=\\"16\\" r=\\"14\\" fill=\\"%23f0f0f0\\" stroke=\\"%23ccc\\"/><text x=\\"16\\" y=\\"20\\" text-anchor=\\"middle\\" font-size=\\"16\\">⚽</text></svg>'">
            <div class="club-info">
                <div class="club-name">${club.club}</div>
                ${club.stadium ? `<div class="club-stadium">${club.stadium}</div>` : ''}
            </div>
        `;
        
        clubsList.appendChild(clubItem);
    });
}

function navigateToClub(club) {
    if (club.latitude && club.longitude && typeof L !== 'undefined') {
        // Pan to club location and zoom in
        map.setView([club.latitude, club.longitude], 15);
        
        // If marker exists, open its popup
        const clubKey = club.id;
        const marker = activeMarkers.get(clubKey);
        if (marker) {
            marker.openPopup();
        }
    } else {
        console.log('Navigate to club:', club.club, club.latitude, club.longitude);
    }
}

function setupSearch() {
    const searchInput = document.getElementById('club-search');
    if (!searchInput) return;
    
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            buildClubsList();
        }, 300); // Debounce search
    });
}

function toggleSubmissionForm() {
    const form = document.getElementById('submission-form');
    form.classList.toggle('hidden');
    
    // Reset form when closing
    if (form.classList.contains('hidden')) {
        document.getElementById('club-form').reset();
    }
}

function toggleEditForm() {
    const form = document.getElementById('edit-form');
    form.classList.toggle('hidden');
    
    // Reset form when closing
    if (form.classList.contains('hidden')) {
        document.getElementById('club-edit-form').reset();
    }
}

function openEditForm(clubId) {
    // Find the club data
    const club = allClubs.find(c => c.id === clubId);
    if (!club) {
        alert('Clube não encontrado');
        return;
    }
    
    // Populate the form with current club data
    document.getElementById('edit-club-name').value = club.club || '';
    document.getElementById('edit-club-stadium').value = club.stadium || '';
    document.getElementById('edit-club-logo').value = club.logo || '';
    document.getElementById('edit-club-url').value = club.url || '';
    document.getElementById('edit-club-latitude').value = club.latitude || '';
    document.getElementById('edit-club-longitude').value = club.longitude || '';
    document.getElementById('edit-club-address').value = club.address || '';
    document.getElementById('edit-club-filtro').value = club.filtro ? club.filtro.join(', ') : '';
    
    // Store the original club ID for reference
    document.getElementById('club-edit-form').setAttribute('data-club-id', clubId);
    
    // Show the form
    document.getElementById('edit-form').classList.remove('hidden');
}

// Handle form submission
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('club-form');
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Extract club ID from ZeroZero URL
        const url = document.getElementById('club-url').value;
        const clubId = extractClubId(url);
        
        // Process filtro field
        const filtroInput = document.getElementById('club-filtro').value;
        let filtro = null;
        if (filtroInput.trim()) {
            filtro = filtroInput.split(',').map(f => f.trim()).filter(f => f.length > 0);
        }
        
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
        
        // Add filtro if provided
        if (filtro && filtro.length > 0) {
            clubData.filtro = filtro;
        }
        
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
    
    // Handle edit form submission
    const editForm = document.getElementById('club-edit-form');
    editForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get the club ID being edited
        const clubId = editForm.getAttribute('data-club-id');
        
        // Extract club ID from ZeroZero URL
        const url = document.getElementById('edit-club-url').value;
        const newClubId = extractClubId(url);
        
        // Process filtro field
        const filtroInput = document.getElementById('edit-club-filtro').value;
        let filtro = null;
        if (filtroInput.trim()) {
            filtro = filtroInput.split(',').map(f => f.trim()).filter(f => f.length > 0);
        }
        
        const clubData = {
            id: newClubId,
            club: document.getElementById('edit-club-name').value,
            stadium: document.getElementById('edit-club-stadium').value || null,
            logo: document.getElementById('edit-club-logo').value,
            equipamentos: [], // Keep empty for now, can be filled manually
            address: document.getElementById('edit-club-address').value || null,
            latitude: parseFloat(document.getElementById('edit-club-latitude').value),
            longitude: parseFloat(document.getElementById('edit-club-longitude').value),
            url: url,
            originalId: clubId, // Add reference to original club for identification
            action: 'edit' // Mark this as an edit action
        };
        
        // Add filtro if provided
        if (filtro && filtro.length > 0) {
            clubData.filtro = filtro;
        }
        
        // Load existing submissions or create new array
        loadExistingSubmissions()
            .then(submissions => {
                submissions.push(clubData);
                downloadSubmissions(submissions);
                toggleEditForm();
                alert('Alteração submetida! O ficheiro submissions.json foi descarregado. Por favor, envie-o num Pull Request para o repositório.');
            })
            .catch(err => {
                console.error('Erro ao carregar submissões existentes:', err);
                // If no existing file, create new one
                downloadSubmissions([clubData]);
                toggleEditForm();
                alert('Alteração submetida! O ficheiro submissions.json foi descarregado. Por favor, envie-o num Pull Request para o repositório.');
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
        
        // Build competition filter list
        buildCompetitionList();
        
        // Build clubs list in sidebar
        buildClubsList();
        
        // Setup search functionality
        setupSearch();
        
        // Initial load of visible markers
        loadVisibleMarkers();
        
        // Log performance info
        const clubsWithLogos = allClubs.filter(club => club.logo).length;
        console.log(`${clubsWithLogos} clubs have logos. Only loading logos for clubs in viewport.`);
    })
    .catch(err => console.error('Erro ao carregar clubes.json:', err));
