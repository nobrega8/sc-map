import requests
from bs4 import BeautifulSoup
import json
import time
from geopy.geocoders import Nominatim
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def obter_dados_clube(url):
    """
    Extrai dados de um clube a partir da sua página no zerozero.pt
    """
    try:
        # Headers para evitar bloqueios
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Nome do clube - múltiplas tentativas
        nome = None
        # Primeiro tenta h1
        h1_tag = soup.find("h1")
        if h1_tag:
            nome = h1_tag.get_text(strip=True)
        
        # Se não encontrar, tenta pela classe team-name ou similar
        if not nome:
            team_name = soup.find("div", class_="team-name") or soup.find("span", class_="team-name")
            if team_name:
                nome = team_name.get_text(strip=True)
        
        # Logo - múltiplas tentativas
        logo_url = None
        logo_selectors = [
            "img.logo",
            "img[alt*='logo']",
            ".team-logo img",
            ".club-logo img",
            "img[src*='logo']"
        ]
        
        for selector in logo_selectors:
            logo_tag = soup.select_one(selector)
            if logo_tag and logo_tag.get("src"):
                logo_url = logo_tag["src"]
                # Tornar URL absoluta se necessário
                if logo_url.startswith("//"):
                    logo_url = "https:" + logo_url
                elif logo_url.startswith("/"):
                    logo_url = "https://www.zerozero.pt" + logo_url
                break
        
        # Nome do estádio - múltiplas tentativas
        estadio_nome = None
        # Procura por link para estádio
        estadio_link = soup.find("a", href=lambda href: href and "estadio" in href.lower())
        if estadio_link:
            estadio_nome = estadio_link.get_text(strip=True)
        
        # Procura por texto que contenha "Estádio"
        if not estadio_nome:
            estadio_text = soup.find(text=lambda text: text and "Estádio" in text)
            if estadio_text:
                # Extrai o nome do estádio
                parent = estadio_text.parent
                if parent:
                    estadio_nome = parent.get_text(strip=True)
        
        # Procura na tabela de informações
        if not estadio_nome:
            rows = soup.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    header = cells[0].get_text(strip=True).lower()
                    if "estádio" in header or "stadium" in header:
                        estadio_nome = cells[1].get_text(strip=True)
                        break
        
        # Morada/Localização
        morada = None
        cidade = None
        
        # Procura por informações de localização
        location_selectors = [
            ".morada",
            ".address",
            ".location",
            "[class*='local']",
            "[class*='city']"
        ]
        
        for selector in location_selectors:
            location_tag = soup.select_one(selector)
            if location_tag:
                morada = location_tag.get_text(strip=True)
                break
        
        # Se não encontrar morada, procura na tabela de informações
        if not morada:
            rows = soup.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    header = cells[0].get_text(strip=True).lower()
                    if any(word in header for word in ["local", "cidade", "morada", "address"]):
                        morada = cells[1].get_text(strip=True)
                        cidade = morada  # Para usar na geocodificação
                        break
        
        # Obter coordenadas via Nominatim
        lat, lon = None, None
        if estadio_nome or morada or cidade:
            try:
                geolocator = Nominatim(user_agent="clubes-portugal-scraper")
                
                # Tenta diferentes combinações para geocodificação
                search_terms = []
                if estadio_nome:
                    search_terms.append(f"{estadio_nome}, Portugal")
                if morada:
                    search_terms.append(f"{morada}, Portugal")
                if cidade:
                    search_terms.append(f"{cidade}, Portugal")
                if nome:
                    search_terms.append(f"{nome} FC, Portugal")
                
                for term in search_terms:
                    try:
                        location = geolocator.geocode(term, timeout=10)
                        if location:
                            lat, lon = location.latitude, location.longitude
                            logger.info(f"Coordenadas encontradas para {nome}: {lat}, {lon}")
                            break
                    except Exception as geo_e:
                        logger.warning(f"Erro na geocodificação para {term}: {geo_e}")
                        continue
                
                time.sleep(1)  # Respeitar rate limit do Nominatim
                
            except Exception as geo_error:
                logger.error(f"Erro geral na geocodificação: {geo_error}")
        
        resultado = {
            "club": nome,
            "stadium": estadio_nome,
            "logo": logo_url,
            "address": morada,
            "latitude": lat,
            "longitude": lon,
            "url": url
        }
        
        logger.info(f"Dados extraídos para {nome}: {resultado}")
        return resultado
        
    except requests.RequestException as e:
        logger.error(f"Erro ao acessar {url}: {e}")
        return {"club": None, "stadium": None, "logo": None, "address": None, 
                "latitude": None, "longitude": None, "url": url, "error": str(e)}
    except Exception as e:
        logger.error(f"Erro inesperado ao processar {url}: {e}")
        return {"club": None, "stadium": None, "logo": None, "address": None,
                "latitude": None, "longitude": None, "url": url, "error": str(e)}

def main():
    """Função principal"""
    # Lista de clubes para processar
    clubes_urls = [
        "https://www.zerozero.pt/team.php?id=16",  # FC Porto
        "https://www.zerozero.pt/team.php?id=4",   # Benfica
        "https://www.zerozero.pt/equipa/lourinhanense/3598",
        "https://www.zerozero.pt/equipa/torreense/2178"
    ]
    
    dados_clubes = []
    
    logger.info(f"Iniciando scraping de {len(clubes_urls)} clubes...")
    
    for i, url in enumerate(clubes_urls, 1):
        logger.info(f"📌 Processando clube {i}/{len(clubes_urls)}: {url}")
        
        dados = obter_dados_clube(url)
        dados_clubes.append(dados)
        
        # Pausa entre requests para respeitar o site
        if i < len(clubes_urls):
            time.sleep(3)
    
    # Salvar os dados em JSON
    try:
        with open("clubes.json", "w", encoding="utf-8") as f:
            json.dump(dados_clubes, f, ensure_ascii=False, indent=4)
        
        logger.info("✅ Arquivo clubes.json criado com sucesso!")
        
        # Mostrar resumo
        sucessos = sum(1 for clube in dados_clubes if clube.get('club'))
        logger.info(f"📊 Resumo: {sucessos}/{len(clubes_urls)} clubes processados com sucesso")
        
        # Mostrar clubes processados
        for clube in dados_clubes:
            if clube.get('club'):
                coords = f"({clube['latitude']}, {clube['longitude']})" if clube['latitude'] else "sem coordenadas"
                logger.info(f"  ✓ {clube['club']} - {clube['stadium']} - {coords}")
            else:
                logger.warning(f"  ✗ Erro ao processar: {clube['url']}")
                
    except Exception as e:
        logger.error(f"Erro ao salvar arquivo: {e}")

if __name__ == "__main__":
    main()