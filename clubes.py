import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
from urllib.parse import urljoin

# URLs base para competições
COMPETICOES = [
    "https://www.zerozero.pt/competicao/supertaca-candido-de-oliveira",
    "https://www.zerozero.pt/competicao/liga-portuguesa",
    "https://www.zerozero.pt/competicao/taca-de-portugal",
    "https://www.zerozero.pt/competicao/segunda-liga-portuguesa",
    "https://www.zerozero.pt/competicao/liga-3",
    "https://www.zerozero.pt/associacao/af-lisboa",
    "https://www.zerozero.pt/competicao/liga-inglesa"
]

# Função para extrair clubes de uma página de competição
def extrair_clubes_competicao(url):
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Erro ao aceder à página: {url}")
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    clubes_info = []

    # Encontrar links para clubes - pode variar conforme a página
    links_clubes = soup.select("a.team-name, table.table-striped a, a.team-title, a.team")
    
    for link in links_clubes:
        href = link.get('href')
        if href and ('equipa' in href or 'team' in href):
            nome = link.text.strip()
            url_clube = urljoin("https://www.zerozero.pt", href)
            clubes_info.append((nome, url_clube))
    
    return clubes_info

# Função para extrair clubes de uma página de associação
def extrair_clubes_associacao(url):
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Erro ao aceder à página: {url}")
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    clubes_info = []

    # Tentar encontrar divisões primeiro
    divisoes = soup.select("div.competition-list a")
    for divisao in divisoes:
        url_divisao = urljoin("https://www.zerozero.pt", divisao.get('href'))
        clubes_info.extend(extrair_clubes_competicao(url_divisao))
        time.sleep(1)
    
    return clubes_info

def main():
    # Lista para armazenar os clubes (usamos set para evitar duplicados)
    clubes = set()

    # Extrair clubes de cada competição
    for url in COMPETICOES:
        print(f"Extraindo clubes de: {url}")
        
        if 'associacao' in url:
            clubes.update(extrair_clubes_associacao(url))
        else:
            # Tentar extrair de várias páginas da competição
            for pagina in range(1, 6):  # Tenta 5 páginas
                url_pagina = f"{url}?pagina={pagina}" if pagina > 1 else url
                novos_clubes = extrair_clubes_competicao(url_pagina)
                if not novos_clubes:
                    break
                clubes.update(novos_clubes)
                time.sleep(1)
        
        time.sleep(2)  # Pausa maior entre competições

    # Converter para DataFrame e salvar
    df = pd.DataFrame(sorted(clubes), columns=["nome", "url"])
    
    # Remover duplicados por URL (pode haver clubes com nomes ligeiramente diferentes mas mesma URL)
    df = df.drop_duplicates(subset="url")
    
    df.to_csv("clubes_zerozero_completo.csv", index=False, encoding="utf-8")
    print(f"Scraping concluído! {len(df)} clubes únicos guardados em 'clubes_zerozero_completo.csv'")

if __name__ == "__main__":
    main()