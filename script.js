const map = L.map('map').setView([39.5, -8.0], 7);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

function criarIcon(logoUrl) {
    return L.icon({
        iconUrl: logoUrl,
        iconSize: [40, 40],
        className: 'club-icon'
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

fetch('clubes.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(clube => {
            if(clube.latitude && clube.longitude){
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
            }
        });
    })
    .catch(err => console.error('Erro ao carregar clubes.json:', err));
