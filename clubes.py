import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
from urllib.parse import urljoin
import re
import sys

# Configurações
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
TIMEOUT = 15
DELAY = 3

# URLs base para competições portuguesas e principais europeias
COMPETICOES = [
    # Portugal - Competições principais
    "https://www.zerozero.pt/edition.php?id=193392",  # Liga Portuguesa
    "https://www.zerozero.pt/edition.php?id=193393",  # Segunda Liga
    "https://www.zerozero.pt/edition.php?id=193395",  # Liga 3
    "https://www.zerozero.pt/edition.php?id=193394",  # Taça de Portugal
    "https://www.zerozero.pt/edition.php?id=193396",  # Supertaça
    
    # Portugal - Competições distritais
    "https://www.zerozero.pt/edition.php?tp=31",      # AF Lisboa
    "https://www.zerozero.pt/edition.php?tp=32",      # AF Porto
    "https://www.zerozero.pt/edition.php?tp=35",      # AF Braga
    "https://www.zerozero.pt/edition.php?tp=33",      # AF Aveiro
    "https://www.zerozero.pt/edition.php?tp=34",      # AF Coimbra
    
    # Competições europeias principais
    "https://www.zerozero.pt/edition.php?id=193441",  # Champions League
    "https://www.zerozero.pt/edition.php?id=193442",  # Europa League
    "https://www.zerozero.pt/edition.php?id=193443",  # Conference League
    
    # Principais ligas europeias
    "https://www.zerozero.pt/edition.php?id=193381",  # La Liga (Espanha)
    "https://www.zerozero.pt/edition.php?id=193384",  # Serie A (Itália)
    "https://www.zerozero.pt/edition.php?id=193379",  # Bundesliga (Alemanha)
    "https://www.zerozero.pt/edition.php?id=193377",  # Ligue 1 (França)
    "https://www.zerozero.pt/edition.php?id=189547",  # Premier League (Inglaterra)
]

def fazer_requisicao(url, max_tentativas=3):
    """Faz uma requisição HTTP com tratamento de erros melhorado e retry automático"""
    for tentativa in range(max_tentativas):
        try:
            response = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            if tentativa == max_tentativas - 1:
                print(f"✗ Erro final ao aceder {url}: {str(e)}")
                return None
            else:
                print(f"⚠ Tentativa {tentativa + 1} falhou para {url}, tentando novamente...")
                time.sleep(DELAY)
    return None

def extrair_id_clube(url):
    """Extrai o ID do clube da URL para garantir unicidade"""
    match = re.search(r'/(\d+)/?$', url)
    return match.group(1) if match else None

def limpar_nome_clube(nome):
    """Limpa e normaliza o nome do clube"""
    if not nome:
        return ""
    
    # Remove espaços extras e caracteres especiais
    nome = re.sub(r'\s+', ' ', nome.strip())
    nome = re.sub(r'[^\w\s\-\(\)\.\'\"ãáàâêéèëíìîïóòôõúùûüçñ]', '', nome, flags=re.IGNORECASE)
    
    # Remove sufixos comuns desnecessários
    sufixos_remover = [' FC', ' CF', ' SC', ' CD', ' UD', ' AD', ' SAD']
    for sufixo in sufixos_remover:
        if nome.upper().endswith(sufixo):
            nome = nome[:-len(sufixo)].strip()
    
    return nome

def extrair_clubes_competicao(url):
    """Extrai clubes de uma competição com múltiplas estratégias otimizadas"""
    response = fazer_requisicao(url)
    if not response:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    clubes_encontrados = {}  # Usar dict para evitar duplicados

    # Estratégias otimizadas em ordem de prioridade
    estrategias = [
        # Estratégia 1: Links diretos de equipas (mais confiável)
        {
            'nome': 'Links diretos',
            'seletores': [
                'a[href*="/equipa/"]',
                'a[href*="/team/"]',
                'a[href*="/club/"]'
            ]
        },
        # Estratégia 2: Tabelas de classificação e estatísticas
        {
            'nome': 'Tabelas',
            'seletores': [
                'table tr td a[href*="/equipa/"]',
                'table.stats-table a[href*="/equipa/"]',
                'table.classification a[href*="/equipa/"]',
                '.table-responsive a[href*="/equipa/"]'
            ]
        },
        # Estratégia 3: Listas e containers específicos
        {
            'nome': 'Listas',
            'seletores': [
                'div.team-list a[href*="/equipa/"]',
                '.team-name[href*="/equipa/"]',
                '.club-list a[href*="/equipa/"]',
                'ul.teams a[href*="/equipa/"]'
            ]
        },
        # Estratégia 4: Classes específicas do ZeroZero
        {
            'nome': 'Classes específicas',
            'seletores': [
                '.team-title[href*="/equipa/"]',
                '.club-name[href*="/equipa/"]',
                '.team-link[href*="/equipa/"]',
                'a.team[href*="/equipa/"]'
            ]
        }
    ]

    for estrategia in estrategias:
        for seletor in estrategia['seletores']:
            try:
                links = soup.select(seletor)
                if links:
                    print(f"    → {estrategia['nome']}: {len(links)} links encontrados com '{seletor}'")
                    
                    for link in links:
                        href = link.get('href')
                        if not href or not ('/equipa/' in href or '/team/' in href or '/club/' in href):
                            continue
                        
                        # Extrair nome do clube
                        nome = link.text.strip()
                        if not nome:
                            # Tentar extrair de elementos filhos
                            texto_elementos = link.find_all(text=True, recursive=True)
                            nome = ' '.join([t.strip() for t in texto_elementos if t.strip()])
                        
                        nome = limpar_nome_clube(nome)
                        if not nome or len(nome) < 2:
                            continue
                        
                        # Construir URL completa
                        url_clube = urljoin("https://www.zerozero.pt", href)
                        clube_id = extrair_id_clube(url_clube)
                        
                        if clube_id and clube_id not in clubes_encontrados:
                            clubes_encontrados[clube_id] = (nome, url_clube)
                    
                    if clubes_encontrados:
                        break  # Se encontrou clubes com este seletor, não tenta os outros
            
            except Exception as e:
                print(f"    ✗ Erro com seletor '{seletor}': {e}")
                continue
        
        if clubes_encontrados:
            break  # Se encontrou clubes com esta estratégia, não tenta as outras

    clubes_lista = list(clubes_encontrados.values())
    if clubes_lista:
        print(f"    ✓ Total de clubes únicos extraídos: {len(clubes_lista)}")
    
    return clubes_lista

def processar_todas_competicoes():
    """Processa todas as competições e retorna conjunto único de clubes"""
    todos_clubes = {}  # Usar dict com URL como chave para evitar duplicados
    total_competicoes = len(COMPETICOES)
    
    print(f"🔍 Processando {total_competicoes} competições...")
    
    for i, url in enumerate(COMPETICOES, 1):
        print(f"\n[{i}/{total_competicoes}] {url}")
        
        try:
            novos_clubes = extrair_clubes_competicao(url)
            
            if novos_clubes:
                for nome, url_clube in novos_clubes:
                    if url_clube not in todos_clubes:
                        todos_clubes[url_clube] = (nome, url_clube)
                
                print(f"    ✓ {len(novos_clubes)} clubes únicos adicionados")
            else:
                print(f"    ⚠ Nenhum clube encontrado")
                
        except Exception as e:
            print(f"    ✗ Erro inesperado: {str(e)}")
        
        # Delay entre requisições para ser respeitoso
        if i < total_competicoes:
            time.sleep(DELAY)
    
    return list(todos_clubes.values())

def salvar_resultados(clubes, nome_arquivo="clubes_zerozero.csv"):
    """Salva os resultados em CSV com validação e relatório detalhado"""
    if not clubes:
        print("\n⚠ Aviso: Nenhum clube foi encontrado para salvar.")
        return False
    
    try:
        # Criar DataFrame e processar dados
        df = pd.DataFrame(clubes, columns=["nome", "url"])
        
        # Remover duplicados por URL (mais confiável que por nome)
        df_original_size = len(df)
        df = df.drop_duplicates(subset="url", keep='first')
        df_deduplicated_size = len(df)
        
        # Ordenar por nome para facilitar consulta
        df = df.sort_values("nome")
        
        # Salvar CSV
        df.to_csv(nome_arquivo, index=False, encoding="utf-8")
        
        # Relatório de resultados
        print(f"\n✓ Sucesso! {df_deduplicated_size} clubes únicos salvos em '{nome_arquivo}'")
        if df_original_size != df_deduplicated_size:
            print(f"  📊 {df_original_size - df_deduplicated_size} duplicados removidos")
        
        # Mostrar amostra dos resultados
        print(f"\n📋 Primeiros 10 clubes encontrados:")
        for i, (nome, url) in enumerate(df.head(10).values, 1):
            print(f"  {i:2d}. {nome}")
        
        if len(df) > 10:
            print(f"  ... e mais {len(df) - 10} clubes")
        
        return True
        
    except Exception as e:
        print(f"\n✗ Erro ao salvar resultados: {str(e)}")
        return False

def criar_dados_teste():
    """Cria dados de teste quando não é possível aceder à internet"""
    clubes_teste = [
        ("Benfica", "https://www.zerozero.pt/equipa/benfica/22"),
        ("Porto", "https://www.zerozero.pt/equipa/porto/236"),
        ("Sporting", "https://www.zerozero.pt/equipa/sporting/23"),
        ("Braga", "https://www.zerozero.pt/equipa/braga/2460"),
        ("Vitória SC", "https://www.zerozero.pt/equipa/vitoria_guimaraes/2469"),
        ("Torreense", "https://www.zerozero.pt/equipa/torreense/2178"),
        ("Casa Pia", "https://www.zerozero.pt/equipa/casa_pia/2543"),
        ("Chaves", "https://www.zerozero.pt/equipa/chaves/2470"),
    ]
    return clubes_teste

def main():
    """Função principal com modo de teste integrado"""
    print("🔍 SC-Map - Extrator de Clubes ZeroZero")
    print("=" * 50)
    
    # Verificar argumentos da linha de comando
    modo_teste = "--test" in sys.argv
    
    try:
        if modo_teste:
            print("🧪 Modo de teste ativado - usando dados de exemplo")
            clubes = criar_dados_teste()
        else:
            clubes = processar_todas_competicoes()
        
        # Salvar resultados
        if salvar_resultados(clubes):
            print(f"\n🎉 Processo concluído com sucesso!")
            if modo_teste:
                print("💡 Para executar com dados reais, execute: python clubes.py")
        else:
            print(f"\n❌ Processo falhou ao salvar resultados.")
            
    except KeyboardInterrupt:
        print(f"\n⏹ Processo interrompido pelo utilizador.")
    except Exception as e:
        print(f"\n💥 Erro inesperado: {str(e)}")
        print("💡 Tente executar em modo de teste: python clubes.py --test")

if __name__ == "__main__":
    main()