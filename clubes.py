import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
from urllib.parse import urljoin
import re

# Configurações
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
TIMEOUT = 15
DELAY = 3

# URLs base para competições portuguesas e principais europeias
COMPETICOES = [
    # Portugal
    "https://www.zerozero.pt/edition.php?id=193396",  # Supertaça
    "https://www.zerozero.pt/edition.php?id=193392",  # Liga Portuguesa
    "https://www.zerozero.pt/edition.php?id=193394",  # Taça de Portugal
    "https://www.zerozero.pt/edition.php?id=193393",  # Segunda Liga
    "https://www.zerozero.pt/edition.php?id=193395",  # Liga 3
    "https://www.zerozero.pt/edition.php?tp=31",      # AF Lisboa
    "https://www.zerozero.pt/edition.php?id=189547",  # Liga Inglesa
    # Principais competições europeias
    "https://www.zerozero.pt/edition.php?id=193441",  # Champions League
    "https://www.zerozero.pt/edition.php?id=193442",  # Europa League
    "https://www.zerozero.pt/edition.php?id=193443",  # Conference League
    "https://www.zerozero.pt/edition.php?id=193381",  # La Liga
    "https://www.zerozero.pt/edition.php?id=193384",  # Serie A
    "https://www.zerozero.pt/edition.php?id=193379",  # Bundesliga
    "https://www.zerozero.pt/edition.php?id=193377",  # Ligue 1
]

def fazer_requisicao(url):
    """Faz uma requisição HTTP com tratamento de erros melhorado"""
    try:
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
        return response
    except requests.exceptions.RequestException as e:
        print(f"Erro ao aceder {url}: {str(e)}")
        return None

def extrair_id_clube(url):
    """Extrai o ID do clube da URL para garantir unicidade"""
    match = re.search(r'/(\d+)/?$', url)
    return match.group(1) if match else None

def extrair_clubes_competicao(url):
    """Extrai clubes de uma competição com múltiplas estratégias"""
    response = fazer_requisicao(url)
    if not response:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    clubes_info = []

    # Estratégias melhoradas para encontrar clubes
    estrategias = [
        # Estratégia 1: Links diretos de equipas
        {
            'seletores': ['a[href*="/equipa/"]', 'a[href*="/team/"]'],
            'nome_metodo': 'texto_link'
        },
        # Estratégia 2: Tabelas de classificação
        {
            'seletores': ['table tr td a[href*="/equipa/"]', 'table.stats-table a[href*="/equipa/"]'],
            'nome_metodo': 'texto_link'
        },
        # Estratégia 3: Listas de equipas
        {
            'seletores': ['div.team-list a[href*="/equipa/"]', '.team-name[href*="/equipa/"]'],
            'nome_metodo': 'texto_link'
        },
        # Estratégia 4: Links com classes específicas
        {
            'seletores': ['.team-title[href*="/equipa/"]', '.club-name[href*="/equipa/"]'],
            'nome_metodo': 'texto_link'
        }
    ]

    for estrategia in estrategias:
        for seletor in estrategia['seletores']:
            links = soup.select(seletor)
            if links:
                print(f"  Encontrados {len(links)} links com seletor: {seletor}")
                
                for link in links:
                    href = link.get('href')
                    if href and ('/equipa/' in href or '/team/' in href):
                        # Extrair nome do clube
                        nome = link.text.strip()
                        if not nome:
                            # Tentar extrair nome de elementos filhos
                            nome_elementos = link.find_all(text=True, recursive=True)
                            nome = ' '.join([t.strip() for t in nome_elementos if t.strip()])
                        
                        if nome and len(nome) > 1:
                            url_clube = urljoin("https://www.zerozero.pt", href)
                            clube_id = extrair_id_clube(url_clube)
                            
                            if clube_id:
                                clubes_info.append((nome, url_clube, clube_id))
                
                if clubes_info:
                    break  # Se encontrou clubes com esta estratégia, não tenta as outras
        
        if clubes_info:
            break  # Se encontrou clubes, não tenta outras estratégias

    return clubes_info

def processar_todas_competicoes():
    """Processa todas as competições e retorna conjunto único de clubes"""
    todos_clubes = {}  # Usar dict para evitar duplicados por ID
    
    for i, url in enumerate(COMPETICOES, 1):
        print(f"\n[{i}/{len(COMPETICOES)}] Processando: {url}")
        
        # Tentar várias vezes em caso de falha
        sucesso = False
        for tentativa in range(3):
            try:
                novos_clubes = extrair_clubes_competicao(url)
                if novos_clubes:
                    for nome, url_clube, clube_id in novos_clubes:
                        if clube_id not in todos_clubes:
                            todos_clubes[clube_id] = (nome, url_clube)
                    
                    print(f"  ✓ Encontrados {len(novos_clubes)} clubes únicos")
                    sucesso = True
                    break
                else:
                    print(f"  ⚠ Nenhum clube encontrado")
                    break
            except Exception as e:
                print(f"  ✗ Tentativa {tentativa+1} falhou: {str(e)}")
                if tentativa < 2:
                    time.sleep(DELAY * 2)
        
        if not sucesso:
            print(f"  ✗ Falha completa para {url}")
        
        time.sleep(DELAY)
    
    return list(todos_clubes.values())

def salvar_resultados(clubes, nome_arquivo="clubes_zerozero.csv"):
    """Salva os resultados em CSV com validação"""
    if not clubes:
        print("\n⚠ Aviso: Nenhum clube foi encontrado para salvar.")
        return False
    
    try:
        # Criar DataFrame e remover duplicados
        df = pd.DataFrame(clubes, columns=["nome", "url"])
        df = df.drop_duplicates(subset="url", keep='first')
        df = df.sort_values("nome")
        
        # Salvar CSV
        df.to_csv(nome_arquivo, index=False, encoding="utf-8")
        print(f"\n✓ Sucesso! {len(df)} clubes únicos salvos em '{nome_arquivo}'")
        
        # Mostrar alguns exemplos
        print(f"\nPrimeiros 5 clubes encontrados:")
        for i, (nome, url) in enumerate(df.head().values, 1):
            print(f"  {i}. {nome}")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Erro ao salvar resultados: {str(e)}")
        return False

def main():
    """Função principal melhorada"""
    print("🔍 Iniciando extração de clubes do ZeroZero...")
    print(f"📋 Processando {len(COMPETICOES)} competições...")
    
    try:
        # Processar todas as competições
        clubes = processar_todas_competicoes()
        
        # Salvar resultados
        if salvar_resultados(clubes):
            print(f"\n🎉 Processo concluído com sucesso!")
        else:
            print(f"\n❌ Processo falhou ao salvar resultados.")
            
    except KeyboardInterrupt:
        print(f"\n⏹ Processo interrompido pelo utilizador.")
    except Exception as e:
        print(f"\n💥 Erro inesperado: {str(e)}")

if __name__ == "__main__":
    main()