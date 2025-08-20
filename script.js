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
let currentFilter = { region: 'all', league: 'all', year: 'all' };
let availableCompetitions = new Set();
let competitionStructure = {
    europa: {},
    portugal: {}
};

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
            html: '<div class="placeholder-club-icon"></div>',
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
        sidebar.classList.toggle('hidden');
        
        // Update zoom controls position
        updateZoomControlsPosition();
    }
}

// Update zoom controls position based on sidebar state
function updateZoomControlsPosition() {
    const sidebar = document.getElementById('clubs-sidebar');
    const mapElement = document.getElementById('map');
    const zoomControls = mapElement.querySelector('.leaflet-top.leaflet-left');
    
    if (zoomControls) {
        if (sidebar.classList.contains('hidden') || window.innerWidth <= 768) {
            zoomControls.style.left = '20px';
        } else {
            zoomControls.style.left = '440px';
        }
    }
}

// Initialize mobile state on page load
function initializeMobileState() {
    const sidebar = document.getElementById('clubs-sidebar');
    
    // Start with sidebar hidden on mobile
    if (window.innerWidth <= 768) {
        sidebar.classList.add('hidden');
    }
    
    // Update zoom controls position
    setTimeout(() => {
        updateZoomControlsPosition();
    }, 100);
}

// Handle window resize
window.addEventListener('resize', function() {
    const sidebar = document.getElementById('clubs-sidebar');
    
    // If switching to mobile, hide sidebar
    if (window.innerWidth <= 768) {
        sidebar.classList.add('hidden');
    }
    
    updateZoomControlsPosition();
});

function buildCompetitionList() {
    // Collect all unique competitions from clubs and organize them
    availableCompetitions.clear();
    competitionStructure = { europa: {}, portugal: {} };
    
    allClubs.forEach(club => {
        if (club.filtro && Array.isArray(club.filtro)) {
            club.filtro.forEach(competition => {
                availableCompetitions.add(competition);
                
                // Parse competition string: e.g., "europa-champions-2025" or "portugal-1liga-2025"
                const parts = competition.split('-');
                if (parts.length >= 3) {
                    const region = parts[0]; // europa, portugal
                    const league = parts[1]; // champions, 1liga, etc.
                    const year = parts[2]; // 2025
                    
                    if (!competitionStructure[region]) {
                        competitionStructure[region] = {};
                    }
                    if (!competitionStructure[region][league]) {
                        competitionStructure[region][league] = new Set();
                    }
                    competitionStructure[region][league].add(year);
                }
            });
        }
    });
    
    // Initialize dropdown event handlers
    initializeDropdowns();
}

function initializeDropdowns() {
    // Region dropdown
    const regionDropdown = document.getElementById('region-dropdown');
    const regionMenu = document.getElementById('region-menu');
    
    // League dropdown
    const leagueDropdown = document.getElementById('league-dropdown');
    const leagueMenu = document.getElementById('league-menu');
    
    // Year dropdown
    const yearDropdown = document.getElementById('year-dropdown');
    const yearMenu = document.getElementById('year-menu');
    
    // Event handlers for dropdowns
    regionDropdown.addEventListener('click', () => toggleDropdown('region'));
    leagueDropdown.addEventListener('click', () => toggleDropdown('league'));
    yearDropdown.addEventListener('click', () => toggleDropdown('year'));
    
    // Event handlers for dropdown options
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('dropdown-option')) {
            handleDropdownSelection(e.target);
        }
        
        // Close dropdowns when clicking outside
        if (!e.target.closest('.dropdown-container')) {
            closeAllDropdowns();
        }
    });
    
    // Populate league options based on current region
    updateLeagueOptions();
}

function toggleDropdown(type) {
    const menu = document.getElementById(`${type}-menu`);
    const dropdown = document.getElementById(`${type}-dropdown`);
    
    // Close other dropdowns
    ['region', 'league', 'year'].forEach(dropdownType => {
        if (dropdownType !== type) {
            document.getElementById(`${dropdownType}-menu`).classList.remove('show');
            document.getElementById(`${dropdownType}-dropdown`).classList.remove('open');
        }
    });
    
    // Toggle current dropdown
    menu.classList.toggle('show');
    dropdown.classList.toggle('open');
}

function closeAllDropdowns() {
    ['region', 'league', 'year'].forEach(type => {
        document.getElementById(`${type}-menu`).classList.remove('show');
        document.getElementById(`${type}-dropdown`).classList.remove('open');
    });
}

function handleDropdownSelection(option) {
    const dropdown = option.closest('.dropdown-container');
    const type = dropdown.querySelector('.dropdown').id.replace('-dropdown', '');
    const value = option.dataset.value;
    
    // Update selection
    currentFilter[type] = value;
    
    // Update UI
    document.getElementById(`${type}-selected`).textContent = option.textContent;
    
    // Update selected state
    dropdown.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');
    
    // Close dropdown
    document.getElementById(`${type}-menu`).classList.remove('show');
    document.getElementById(`${type}-dropdown`).classList.remove('open');
    
    // Update dependent dropdowns
    if (type === 'region') {
        updateLeagueOptions();
        updateYearOptions();
    } else if (type === 'league') {
        updateYearOptions();
    }
    
    // Apply filter
    applyFilters();
}

function getLeagueOrder(league) {
    // Define logical order for leagues (lower number = higher priority)
    const orderMap = {
        'champions': 1,     // Champions League - highest priority
        '1liga': 2,         // 1ª Liga (First Division)
        '2liga': 3,         // 2ª Liga (Second Division)
        '3liga': 4,         // 3ª Liga (Third Division)
        'taca': 5,          // Taça (Cup competitions)
        'campeonato': 6,    // Campeonato
        'aflisboa': 10,     // Regional associations start at 10
        'afsetubal': 11,
        'afbraga': 12,
        'afporto': 13,
        'afmadeira': 14,
        'afviseu': 15,
        'afbraganca': 16,
        'afcoimbra': 17,
        'afleiria': 18,
        'afguarda': 19,
        'afsantarém': 20
    };
    
    return orderMap[league] || 999; // Unknown leagues go to the end
}

function updateLeagueOptions() {
    const leagueMenu = document.getElementById('league-menu');
    const region = currentFilter.region;
    
    leagueMenu.innerHTML = '<div class="dropdown-option selected" data-value="all">Todas as Ligas</div>';
    
    if (region === 'all') {
        // Show all leagues from all regions
        const allLeagues = new Set();
        Object.keys(competitionStructure).forEach(regionKey => {
            Object.keys(competitionStructure[regionKey]).forEach(league => {
                allLeagues.add(league);
            });
        });
        
        // Sort leagues by logical order
        const sortedLeagues = Array.from(allLeagues).sort((a, b) => {
            return getLeagueOrder(a) - getLeagueOrder(b);
        });
        
        sortedLeagues.forEach(league => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.value = league;
            
            const logo = getLeagueLogo(league);
            if (logo) {
                const logoImg = document.createElement('img');
                logoImg.className = 'option-logo';
                logoImg.src = logo;
                logoImg.alt = formatLeagueName(league);
                logoImg.onerror = function() { this.style.display = 'none'; };
                option.appendChild(logoImg);
            }
            
            const textSpan = document.createElement('span');
            textSpan.className = 'option-text';
            textSpan.textContent = formatLeagueName(league);
            option.appendChild(textSpan);
            
            leagueMenu.appendChild(option);
        });
    } else if (competitionStructure[region]) {
        // Show only leagues from selected region, sorted by logical order
        const leagues = Object.keys(competitionStructure[region]).sort((a, b) => {
            return getLeagueOrder(a) - getLeagueOrder(b);
        });
        
        leagues.forEach(league => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.dataset.value = league;
            
            const logo = getLeagueLogo(league);
            if (logo) {
                const logoImg = document.createElement('img');
                logoImg.className = 'option-logo';
                logoImg.src = logo;
                logoImg.alt = formatLeagueName(league);
                logoImg.onerror = function() { this.style.display = 'none'; };
                option.appendChild(logoImg);
            }
            
            const textSpan = document.createElement('span');
            textSpan.className = 'option-text';
            textSpan.textContent = formatLeagueName(league);
            option.appendChild(textSpan);
            
            leagueMenu.appendChild(option);
        });
    }
    
    // Reset league selection
    currentFilter.league = 'all';
    document.getElementById('league-selected').textContent = 'Todas as Ligas';
}

function updateYearOptions() {
    const yearMenu = document.getElementById('year-menu');
    const region = currentFilter.region;
    const league = currentFilter.league;
    
    yearMenu.innerHTML = '<div class="dropdown-option selected" data-value="all">Todos os Anos</div>';
    
    const years = new Set();
    
    if (region === 'all' && league === 'all') {
        // Show all years
        Object.keys(competitionStructure).forEach(regionKey => {
            Object.keys(competitionStructure[regionKey]).forEach(leagueKey => {
                competitionStructure[regionKey][leagueKey].forEach(year => years.add(year));
            });
        });
    } else if (region === 'all' && league !== 'all') {
        // Show years for specific league across all regions
        Object.keys(competitionStructure).forEach(regionKey => {
            if (competitionStructure[regionKey][league]) {
                competitionStructure[regionKey][league].forEach(year => years.add(year));
            }
        });
    } else if (region !== 'all' && league === 'all') {
        // Show years for all leagues in specific region
        if (competitionStructure[region]) {
            Object.keys(competitionStructure[region]).forEach(leagueKey => {
                competitionStructure[region][leagueKey].forEach(year => years.add(year));
            });
        }
    } else if (region !== 'all' && league !== 'all') {
        // Show years for specific league in specific region
        if (competitionStructure[region] && competitionStructure[region][league]) {
            competitionStructure[region][league].forEach(year => years.add(year));
        }
    }
    
    // Add year options sorted
    Array.from(years).sort((a, b) => b.localeCompare(a)).forEach(year => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.dataset.value = year;
        option.textContent = year;
        yearMenu.appendChild(option);
    });
    
    // Reset year selection
    currentFilter.year = 'all';
    document.getElementById('year-selected').textContent = 'Todos os Anos';
}

function formatLeagueName(league) {
    return league.replace('1liga', '1ª Liga')
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
}

function getLeagueLogo(league) {
    const logoMap = {
        'champions': 'https://cdn-img.zerozero.pt/img/logos/competicoes/27_imgbank_lc_20250314102703.png',
        '1liga': 'https://cdn-img.zerozero.pt/img/logos/edicoes/175797_imgbank_.png',
        '2liga': 'https://cdn-img.zerozero.pt/img/logos/edicoes/187796_imgbank_.png',
        '3liga': 'https://cdn-img.zerozero.pt/img/logos/competicoes/5683_imgbank_l3_20250227173534.png',
        'taca': 'https://cdn-img.zerozero.pt/img/logos/edicoes/188527_imgbank_.png',
        'campeonato': 'https://cdn-img.zerozero.pt/img/logos/competicoes/2380_imgbank_cp_20250307185627.png',
        'aflisboa': 'https://cdn-img.zerozero.pt/img/logos/associacoes/2_af_lisboa_imgbank.png',
        'afsetubal': 'https://cdn-img.zerozero.pt/img/logos/associacoes/15_af_setubal_imgbank.png'
    };
    
    return logoMap[league] || null;
}

function applyFilters() {
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
    // Check search filter first
    const searchTerm = document.getElementById('club-search').value.toLowerCase();
    if (searchTerm) {
        const clubName = club.club.toLowerCase();
        const stadiumName = club.stadium ? club.stadium.toLowerCase() : '';
        if (!clubName.includes(searchTerm) && !stadiumName.includes(searchTerm)) {
            return false;
        }
    }
    
    // Check competition filters
    if (currentFilter.region === 'all' && currentFilter.league === 'all' && currentFilter.year === 'all') {
        return true;
    }
    
    if (!club.filtro || !Array.isArray(club.filtro)) {
        return false;
    }
    
    // Check if club matches any of the selected filter combinations
    return club.filtro.some(competition => {
        const parts = competition.split('-');
        if (parts.length < 3) return false;
        
        const region = parts[0];
        const league = parts[1];
        const year = parts[2];
        
        const regionMatch = currentFilter.region === 'all' || currentFilter.region === region;
        const leagueMatch = currentFilter.league === 'all' || currentFilter.league === league;
        const yearMatch = currentFilter.year === 'all' || currentFilter.year === year;
        
        return regionMatch && leagueMatch && yearMatch;
    });
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
    const filteredClubs = allClubs.filter(club => shouldShowClub(club));
    
    // Sort clubs alphabetically
    filteredClubs.sort((a, b) => a.club.localeCompare(b.club));
    
    filteredClubs.forEach(club => {
        const clubItem = document.createElement('div');
        clubItem.className = 'club-item';
        clubItem.onclick = () => navigateToClub(club);
        
        const logoUrl = club.logo || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="6" fill="%23f0f0f0" stroke="%23ccc"/></svg>';
        
        clubItem.innerHTML = `
            <img src="${logoUrl}" alt="${club.club}" class="club-logo" onerror="this.src='data:image/svg+xml;charset=utf-8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22 viewBox=%220 0 32 32%22><rect x=%222%22 y=%222%22 width=%2228%22 height=%2228%22 rx=%226%22 fill=%22%23f0f0f0%22 stroke=%22%23ccc%22/></svg>'">
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
        // If club doesn't have coordinates, open edit form and highlight coordinates
        console.log('Club missing coordinates:', club.club, club.latitude, club.longitude);
        openEditForm(club.id, true); // Pass true to highlight missing coordinates
    }
}

function setupSearch() {
    const searchInput = document.getElementById('club-search');
    if (!searchInput) return;
    
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyFilters(); // Use applyFilters instead of just buildClubsList
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

function openEditForm(clubId, highlightCoordinates = false) {
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
    
    // Highlight coordinate fields if requested (club missing coordinates)
    if (highlightCoordinates) {
        setTimeout(() => {
            const latitudeGroup = document.getElementById('edit-club-latitude').closest('.form-group');
            const longitudeGroup = document.getElementById('edit-club-longitude').closest('.form-group');
            
            if (latitudeGroup) {
                latitudeGroup.classList.add('highlight-missing');
                // Remove highlight after animation completes
                setTimeout(() => {
                    latitudeGroup.classList.remove('highlight-missing');
                }, 2000);
            }
            
            if (longitudeGroup) {
                longitudeGroup.classList.add('highlight-missing');
                // Remove highlight after animation completes
                setTimeout(() => {
                    longitudeGroup.classList.remove('highlight-missing');
                }, 2000);
            }
            
            // Focus on latitude field to draw attention
            document.getElementById('edit-club-latitude').focus();
        }, 100); // Small delay to ensure form is fully shown
    }
}

// Handle form submission
document.addEventListener('DOMContentLoaded', function() {
    // Initialize mobile state
    initializeMobileState();
    
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
                alert('Submissão criada com sucesso! Verifique os downloads e siga as instruções do painel tutorial.');
            })
            .catch(err => {
                console.error('Erro ao carregar submissões existentes:', err);
                // If no existing file, create new one
                downloadSubmissions([clubData]);
                toggleSubmissionForm();
                alert('Submissão criada com sucesso! Verifique os downloads e siga as instruções do painel tutorial.');
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
                alert('Alteração submetida com sucesso! Verifique os downloads e siga as instruções do painel tutorial.');
            })
            .catch(err => {
                console.error('Erro ao carregar submissões existentes:', err);
                // If no existing file, create new one
                downloadSubmissions([clubData]);
                toggleEditForm();
                alert('Alteração submetida com sucesso! Verifique os downloads e siga as instruções do painel tutorial.');
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
    
    // Open GitHub issues page after download
    setTimeout(() => {
        window.open('https://github.com/nobrega8/sc-map/issues/new', '_blank');
    }, 500); // Small delay to ensure download starts first
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

// Ko-fi popup integration




// Ko-fi popup integration
function openKofiPopup() {
    if (typeof kofiWidgetOverlay !== 'undefined') {
        kofiWidgetOverlay.draw('nobrega', {
            'type': 'floating-chat',
            'floating-chat.donateButton.text': 'Pagar um café',
            'floating-chat.donateButton.background-color': '#ff5e4d',
            'floating-chat.donateButton.text-color': '#fff'
        });
    } else {
        // Fallback if Ko-fi widget is not loaded
        window.open('https://ko-fi.com/nobrega', '_blank');
    }
}

