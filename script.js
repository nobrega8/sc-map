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
