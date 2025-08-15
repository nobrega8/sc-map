import requests
from bs4 import BeautifulSoup
import pandas as pd
import time

# URL base para clubes de futebol
BASE_URL = "https://www.zerozero.pt/competicao/liga-portuguesa"

# Função para extrair clubes de uma página
def extrair_clubes(url):
    response = requests.get(url)
    if response.status_code != 200:
        print(f"Erro ao aceder à página: {url}")
        return []

    soup = BeautifulSoup(response.text, "html.parser")

    # Encontrar todos os elementos que contêm o nome do clube
    clubes_page = soup.select("table.table-striped a")
    clubes_info = []
    for clube in clubes_page:
        nome = clube.text.strip()
        link = "https://www.zerozero.pt" + clube.get("href")
        clubes_info.append((nome, link))

    return clubes_info

def main():
    # Lista para armazenar os clubes
    clubes = []

    # Número de páginas a percorrer
    num_paginas = 5  # Ajusta conforme necessário

    # Extrair clubes de cada página
    for pagina in range(1, num_paginas + 1):
        print(f"Extraindo página {pagina}...")
        url = f"{BASE_URL}?pagina={pagina}"
        clubes.extend(extrair_clubes(url))
        time.sleep(1)  # Pausa para evitar sobrecarga no servidor

    # Criar DataFrame e salvar em CSV
    df = pd.DataFrame(clubes, columns=["nome", "url"])
    df.to_csv("clubes_zerozero.csv", index=False, encoding="utf-8")

    print(f"Scraping concluído! {len(clubes)} clubes guardados em 'clubes_zerozero.csv'")

if __name__ == "__main__":
    main()
