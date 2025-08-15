// Criar o mapa centrado em Portugal
const map = L.map('map').setView([39.5, -8.0], 7);

// Adicionar tiles do OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

// Função para criar ícone a partir do logo
function criarIcon(logoUrl) {
    return L.icon({
        iconUrl: logoUrl,
        iconSize: [40, 40],
        className: 'club-icon'
    });
}

// Carregar JSON com fetch
fetch('clubes.json')
    .then(response => response.json())
    .then(data => {
        data.forEach(clube => {
            if(clube.latitude && clube.longitude){
                const marker = L.marker(
                    [clube.latitude, clube.longitude],
                    { icon: criarIcon(clube.logo) }
                ).addTo(map);

                const popupHTML = `
                    <b>${clube.club}</b><br>
                    Estádio: ${clube.stadium}<br>
                    <a href="${clube.url}" target="_blank">Ver no ZeroZero</a>
                `;
                marker.bindPopup(popupHTML);
            }
        });
    })
    .catch(err => console.error('Erro ao carregar clubes.json:', err));
