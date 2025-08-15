import requests
from bs4 import BeautifulSoup
import json
import time
from geopy.geocoders import Nominatim
import logging
import re
from urllib.parse import urljoin, urlparse, parse_qs
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def extrair_id_clube(url):
    """
    Extrai o ID do clube da URL do ZeroZero
    """
    # Padrão 1: /equipa/nome/ID
    match = re.search(r'/equipa/[^/]+/(\d+)', url)
    if match:
        return match.group(1)
    
    # Padrão 2: team.php?id=ID
    match = re.search(r'team\.php\?id=(\d+)', url)
    if match:
        return match.group(1)
    
    # Padrão 3: ID no final da URL
    match = re.search(r'/(\d+)/?$', url)
    if match:
        return match.group(1)
    
    return None

def descobrir_clubes_competicao(url_competicao, max_clubes=50):
    """
    Descobre clubes a partir de uma página de competição
    """
    clubes_descobertos = {}
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        logger.info(f"🔍 Descobrindo clubes em: {url_competicao}")
        r = requests.get(url_competicao, headers=headers, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Procura por links de clubes
        links_clubes = []
        
        # Padrão 1: Links diretos para equipas
        equipa_links = soup.find_all('a', href=re.compile(r'/equipa/[^/]+/\d+'))
        links_clubes.extend([link['href'] for link in equipa_links])
        
        # Padrão 2: Links team.php
        team_links = soup.find_all('a', href=re.compile(r'team\.php\?id=\d+'))
        links_clubes.extend([link['href'] for link in team_links])
        
        # Remove duplicados e converte para URLs completas
        links_unicos = list(set(links_clubes))
        
        for link in links_unicos[:max_clubes]:
            if not link.startswith('http'):
                link = urljoin('https://www.zerozero.pt', link)
            
            clube_id = extrair_id_clube(link)
            if clube_id and clube_id not in clubes_descobertos:
                clubes_descobertos[clube_id] = link
                logger.info(f"  📌 Clube descoberto: ID {clube_id} - {link}")
        
        logger.info(f"✅ {len(clubes_descobertos)} clubes únicos descobertos")
        
    except Exception as e:
        logger.error(f"Erro ao descobrir clubes em {url_competicao}: {e}")
    
    return clubes_descobertos

def descobrir_clubes_multiplas_competicoes():
    """
    Descobre clubes de múltiplas competições portuguesas
    """
    competicoes = [
        "https://www.zerozero.pt/edicao.php?id_edicao=175650",  # Liga Portugal 2024-25
        "https://www.zerozero.pt/edicao.php?id_edicao=175651",  # Liga Portugal 2 2024-25
        "https://www.zerozero.pt/edicao.php?id_edicao=175652",  # Campeonato de Portugal 2024-25
        "https://www.zerozero.pt/edicao.php?id_edicao=175653",  # Liga 3 2024-25
    ]
    
    todos_clubes = {}
    
    for competicao in competicoes:
        clubes_comp = descobrir_clubes_competicao(competicao, max_clubes=30)
        todos_clubes.update(clubes_comp)
        time.sleep(2)  # Pausa entre competições
    
    logger.info(f"🎯 Total de clubes únicos descobertos: {len(todos_clubes)}")
    return todos_clubes

def clube_ja_existe(clube_id, arquivo_json="clubes.json"):
    """
    Verifica se um clube já existe no arquivo JSON
    """
    if not os.path.exists(arquivo_json):
        return False
    
    try:
        with open(arquivo_json, "r", encoding="utf-8") as f:
            dados_existentes = json.load(f)
        
        for clube in dados_existentes:
            if clube.get('id') == clube_id:
                return True
        
        return False
    except:
        return False

def obter_dados_clube(url):
    """
    Extrai dados de um clube a partir da sua página no zerozero.pt
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        r = requests.get(url, headers=headers, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # ID do clube
        clube_id = extrair_id_clube(url)
        
        # Nome do clube - múltiplas tentativas
        nome = None
        h1_tag = soup.find("h1")
        if h1_tag:
            nome = h1_tag.get_text(strip=True)
        
        if not nome:
            team_name = soup.find("div", class_="team-name") or soup.find("span", class_="team-name")
            if team_name:
                nome = team_name.get_text(strip=True)
        
        # Logo do clube - procura pelo emblema no CDN
        logo_url = None
        
        # Primeira prioridade: emblemas no CDN do ZeroZero
        all_images = soup.find_all("img")
        for img in all_images:
            src = img.get("src", "")
            if not src:
                continue
            
            # Procura especificamente por emblemas no CDN
            if "cdn-img.zerozero.pt/img/logos/equipas/" in src:
                logo_url = src
                logger.info(f"Emblema encontrado no CDN: {src}")
                break
            
            if any(pattern in src.lower() for pattern in [
                "/img/logos/equipas/",
                "/logos/equipas/",
                "/emblemas/equipas/"
            ]):
                logo_url = src
                logger.info(f"Emblema encontrado: {src}")
                break
        
        # Segunda prioridade: procura por seletores específicos
        if not logo_url:
            logo_selectors = [
                "img[src*='logos/equipas']",
                "img[src*='emblemas']",
                "img[alt*='emblema']",
                ".team-logo img",
                ".club-logo img"
            ]
            
            for selector in logo_selectors:
                logo_candidates = soup.select(selector)
                for logo_tag in logo_candidates:
                    src = logo_tag.get("src", "")
                    alt = logo_tag.get("alt", "").lower()
                    
                    if any(avoid in src.lower() for avoid in ['equipamento', 'kit', 'jersey', 'shirt']):
                        continue
                    if any(avoid in alt for avoid in ['equipamento', 'kit', 'jersey', 'shirt']):
                        continue
                    
                    if any(keyword in src.lower() for keyword in ['emblema', 'logo', 'shield', 'badge']):
                        logo_url = src
                        break
                
                if logo_url:
                    break
        
        # Tornar URL absoluta se necessário
        if logo_url:
            if logo_url.startswith("//"):
                logo_url = "https:" + logo_url
            elif logo_url.startswith("/"):
                logo_url = "https://www.zerozero.pt" + logo_url
        
        # Procurar equipamentos/kits
        equipamentos = []
        
        # Procura por imagens de equipamentos
        for img in all_images:
            src = img.get("src", "")
            alt = img.get("alt", "").lower()
            title = img.get("title", "").lower()
            
            if not src:
                continue
            
            # Identifica equipamentos por palavras-chave
            is_kit = False
            kit_keywords = ['equipamento', 'kit', 'jersey', 'shirt', 'camisola', 'uniform']
            
            # Verifica no URL da imagem
            if any(keyword in src.lower() for keyword in kit_keywords):
                is_kit = True
            # Verifica no alt text
            elif any(keyword in alt for keyword in kit_keywords):
                is_kit = True
            # Verifica no title
            elif any(keyword in title for keyword in kit_keywords):
                is_kit = True
            # Verifica se está numa pasta de equipamentos
            elif any(path in src.lower() for path in ['/equipamentos/', '/kits/', '/uniforms/']):
                is_kit = True
            
            if is_kit:
                # Tornar URL absoluta
                kit_url = src
                if kit_url.startswith("//"):
                    kit_url = "https:" + kit_url
                elif kit_url.startswith("/"):
                    kit_url = "https://www.zerozero.pt" + kit_url
                
                # Determinar tipo de equipamento (casa, fora, alternativo)
                kit_type = "desconhecido"
                if any(home in alt for home in ['casa', 'home', 'principal']):
                    kit_type = "casa"
                elif any(away in alt for away in ['fora', 'away', 'visitante']):
                    kit_type = "fora"
                elif any(alt_kit in alt for alt_kit in ['alternativo', 'alternate', 'third', '3º']):
                    kit_type = "alternativo"
                elif any(home in title for home in ['casa', 'home', 'principal']):
                    kit_type = "casa"
                elif any(away in title for away in ['fora', 'away', 'visitante']):
                    kit_type = "fora"
                elif any(alt_kit in title for alt_kit in ['alternativo', 'alternate', 'third', '3º']):
                    kit_type = "alternativo"
                elif any(home in src.lower() for home in ['casa', 'home']):
                    kit_type = "casa"
                elif any(away in src.lower() for away in ['fora', 'away']):
                    kit_type = "fora"
                
                equipamento = {
                    "type": kit_type,
                    "url": kit_url,
                    "alt_text": alt if alt else None
                }
                
                # Evita duplicados
                if equipamento not in equipamentos:
                    equipamentos.append(equipamento)
                    logger.info(f"Equipamento encontrado ({kit_type}): {kit_url}")
        
        # Limita a 5 equipamentos para evitar spam
        equipamentos = equipamentos[:5]
        
        # Nome do estádio
        estadio_nome = None
        estadio_link = soup.find("a", href=lambda href: href and "estadio" in href.lower())
        if estadio_link:
            estadio_nome = estadio_link.get_text(strip=True)
        
        if not estadio_nome:
            rows = soup.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) >= 2:
                    header = cells[0].get_text(strip=True).lower()
                    if "estádio" in header or "stadium" in header:
                        estadio_nome = cells[1].get_text(strip=True)
                        break
        
        # Localização/Morada
        morada = None
        cidade = None
        
        rows = soup.find_all("tr")
        for row in rows:
            cells = row.find_all(["td", "th"])
            if len(cells) >= 2:
                header = cells[0].get_text(strip=True).lower()
                if any(word in header for word in ["local", "cidade", "morada", "address"]):
                    morada = cells[1].get_text(strip=True)
                    cidade = morada
                    break
        
        # Obter coordenadas via Nominatim
        lat, lon = None, None
        if estadio_nome or morada or cidade:
            try:
                geolocator = Nominatim(user_agent="clubes-portugal-discovery")
                
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
                    except:
                        continue
                
                time.sleep(1)  # Rate limit do Nominatim
                
            except Exception as geo_error:
                logger.error(f"Erro na geocodificação: {geo_error}")
        
        resultado = {
            "id": clube_id,
            "club": nome,
            "stadium": estadio_nome,
            "logo": logo_url,
            "address": morada,
            "latitude": lat,
            "longitude": lon,
            "url": url
        }
        
        logger.info(f"✅ Dados extraídos para {nome} (ID: {clube_id})")
        return resultado
        
    except Exception as e:
        logger.error(f"Erro ao processar {url}: {e}")
        return {"id": extrair_id_clube(url), "club": None, "stadium": None, 
                "logo": None, "address": None, "latitude": None, 
                "longitude": None, "url": url, "error": str(e)}

def carregar_dados_existentes(arquivo_json="clubes.json"):
    """
    Carrega dados existentes do arquivo JSON
    """
    if os.path.exists(arquivo_json):
        try:
            with open(arquivo_json, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            return []
    return []

def salvar_dados(dados_clubes, arquivo_json="clubes.json"):
    """
    Salva os dados no arquivo JSON
    """
    try:
        with open(arquivo_json, "w", encoding="utf-8") as f:
            json.dump(dados_clubes, f, ensure_ascii=False, indent=4)
        logger.info(f"✅ Dados salvos em {arquivo_json}")
        return True
    except Exception as e:
        logger.error(f"Erro ao salvar: {e}")
        return False

def main():
    """Função principal - descoberta automática de clubes"""
    logger.info("🚀 Iniciando descoberta automática de clubes portugueses...")
    
    # Carrega dados existentes
    dados_existentes = carregar_dados_existentes()
    ids_existentes = {clube.get('id') for clube in dados_existentes if clube.get('id')}
    logger.info(f"📋 {len(dados_existentes)} clubes já existem no arquivo")
    
    # Descobre novos clubes
    clubes_descobertos = descobrir_clubes_multiplas_competicoes()
    
    # Filtra clubes novos
    clubes_novos = {id_clube: url for id_clube, url in clubes_descobertos.items() 
                   if id_clube not in ids_existentes}
    
    logger.info(f"🆕 {len(clubes_novos)} clubes novos para processar")
    
    if not clubes_novos:
        logger.info("✅ Nenhum clube novo encontrado!")
        return
    
    # Processa clubes novos
    dados_novos = []
    total = len(clubes_novos)
    
    for i, (clube_id, url) in enumerate(clubes_novos.items(), 1):
        logger.info(f"📌 Processando clube {i}/{total}: ID {clube_id}")
        
        dados = obter_dados_clube(url)
        dados_novos.append(dados)
        
        # Pausa entre requests
        if i < total:
            time.sleep(3)
    
    # Combina dados existentes com novos
    todos_dados = dados_existentes + dados_novos
    
    # Remove duplicados baseado no ID
    dados_unicos = {}
    for clube in todos_dados:
        clube_id = clube.get('id')
        if clube_id and clube_id not in dados_unicos:
            dados_unicos[clube_id] = clube
        elif not clube_id:  # Dados sem ID (erros)
            dados_unicos[f"erro_{len(dados_unicos)}"] = clube
    
    dados_finais = list(dados_unicos.values())
    
    # Salva resultado
    if salvar_dados(dados_finais):
        sucessos = sum(1 for clube in dados_finais if clube.get('club'))
        logger.info(f"🎯 Resultado final: {sucessos}/{len(dados_finais)} clubes processados")
        logger.info(f"📊 {len(dados_novos)} clubes novos adicionados")
        
        # Mostra alguns exemplos
        for clube in dados_finais[-5:]:  # Últimos 5
            if clube.get('club'):
                coords = f"({clube['latitude']}, {clube['longitude']})" if clube['latitude'] else "sem coords"
                logger.info(f"  ✓ {clube['club']} (ID: {clube['id']}) - {coords}")

if __name__ == "__main__":
    main()