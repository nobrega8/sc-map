import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
from urllib.parse import urljoin

# Configurações
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
TIMEOUT = 10
DELAY = 2

# URLs base para competições
COMPETICOES = [
    "https://www.zerozero.pt/edition.php?id=193396",  # Supertaça
    "https://www.zerozero.pt/edition.php?id=193392",  # Liga Portuguesa
    "https://www.zerozero.pt/edition.php?id=193394",  # Taça de Portugal
    "https://www.zerozero.pt/edition.php?id=193393",  # Segunda Liga
    "https://www.zerozero.pt/edition.php?id=193395",  # Liga 3
    "https://www.zerozero.pt/edition.php?tp=31",      # AF Lisboa
    "https://www.zerozero.pt/edition.php?id=189547"   # Liga Inglesa
]

def fazer_requisicao(url):
    try:
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
        return response
    except requests.exceptions.RequestException as e:
        print(f"Erro ao aceder {url}: {str(e)}")
        return None

def extrair_clubes_competicao(url):
    response = fazer_requisicao(url)
    if not response:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    clubes_info = []

    # Tentar diferentes seletores para encontrar clubes
    seletores = [
        "a.team-name", "table.stats-table a.team", 
        "div.team-list a", "a.team-title"
    ]

    for seletor in seletores:
        for link in soup.select(seletor):
            href = link.get('href')
            if href and ('equipa' in href or 'team' in href):
                nome = link.text.strip()
                url_clube = urljoin("https://www.zerozero.pt", href)
                clubes_info.append((nome, url_clube))
                break  # Se encontrar com um seletor, passa para o próximo

    return clubes_info

def main():
    clubes = set()

    for url in COMPETICOES:
        print(f"\nProcessando: {url}")
        
        # Tentar várias vezes em caso de falha
        for tentativa in range(3):
            novos_clubes = extrair_clubes_competicao(url)
            if novos_clubes:
                clubes.update(novos_clubes)
                print(f"Encontrados {len(novos_clubes)} clubes")
                break
            else:
                print(f"Tentativa {tentativa+1} falhou, aguardando...")
                time.sleep(DELAY * 2)
        
        time.sleep(DELAY)

    # Salvar resultados
    if clubes:
        df = pd.DataFrame(sorted(clubes), columns=["nome", "url"])
        df.drop_duplicates(subset="url", inplace=True)
        df.to_csv("clubes_zerozero.csv", index=False, encoding="utf-8")
        print(f"\nSucesso! {len(df)} clubes salvos.")
    else:
        print("\nAviso: Nenhum clube foi encontrado.")

if __name__ == "__main__":
    main()