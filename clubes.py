import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
from urllib.parse import urljoin
import re
import sys
import hashlib

# Configurações
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
TIMEOUT = 15
DELAY = 3

# URLs base para competições portuguesas e principais europeias
COMPETICOES = [
    "https://www.zerozero.pt/competicao/liga-inglesa",
    "https://www.zerozero.pt/competicao/liga-espanhola",
    "https://www.zerozero.pt/competicao/liga-italiana",
    "https://www.zerozero.pt/competicao/brasileirao-serie-a",
    "https://www.zerozero.pt/competicao/liga-francesa",
    "https://www.zerozero.pt/competicao/liga-alema",
    "https://www.zerozero.pt/competicao/major-league-soccer",
    "https://www.zerozero.pt/competicao/liga-neerlandesa",
    "https://www.zerozero.pt/competicao/liga-turca"
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
    """Limpa e normaliza o nome do clube de forma menos restritiva"""
    if not nome:
        return ""
    
    # Remove espaços extras
    nome = re.sub(r'\s+', ' ', nome.strip())
    
    # Remove apenas caracteres claramente problemáticos
    nome = re.sub(r'[<>{}[\]|\\`~]', '', nome)
    
    # Remove números isolados no final
    nome = re.sub(r'\s+\d+\s*$', '', nome)
    
    # Remove sufixos muito comuns apenas se resultar em nome não vazio
    sufixos_remover = [' FC', ' CF', ' SC', ' CD', ' UD', ' AD', ' SAD', ' AC', ' EC']
    for sufixo in sufixos_remover:
        if nome.upper().endswith(sufixo):
            nome_sem_sufixo = nome[:-len(sufixo)].strip()
            if len(nome_sem_sufixo) >= 3:  # Só remover se ainda sobrar nome decente
                nome = nome_sem_sufixo
            break
    
    return nome.strip()

def extrair_clubes_competicao(url):
    """Extrai clubes de uma competição com múltiplas estratégias otimizadas"""
    response = fazer_requisicao(url)
    if not response:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    clubes_encontrados = {}  # Usar dict para evitar duplicados
    
    # Contadores para debug
    total_links_processados = 0
    links_rejeitados = 0

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
                        total_links_processados += 1
                        href = link.get('href')
                        if not href or not ('/equipa/' in href or '/team/' in href or '/club/' in href):
                            links_rejeitados += 1
                            continue
                        
                        # Construir URL completa primeiro
                        url_clube = urljoin("https://www.zerozero.pt", href)
                        clube_id = extrair_id_clube(url_clube)
                        
                        # Se não tem ID, criar um identificador único baseado na URL
                        if not clube_id:
                            # Usar hash da URL como ID alternativo
                            url_hash = hashlib.md5(url_clube.encode()).hexdigest()[:8]
                            clube_id = f"url_{url_hash}"
                        
                        # Só processar se não está duplicado
                        if clube_id in clubes_encontrados:
                            continue
                        
                        # Extrair nome do clube com múltiplas estratégias
                        nome = ""
                        
                        # Estratégia 1: Texto direto do link
                        texto_link = link.get_text(strip=True)
                        if texto_link:
                            nome = texto_link
                        
                        # Estratégia 2: Atributo title ou alt
                        if not nome:
                            nome = link.get('title', '').strip() or link.get('alt', '').strip()
                        
                        # Estratégia 3: Tentar extrair do href se ainda não temos nome
                        if not nome:
                            # Extrair nome do URL, ex: /equipa/benfica/22 -> benfica
                            url_parts = href.split('/')
                            for part in url_parts:
                                if part and part != 'equipa' and part != 'team' and part != 'club' and not part.isdigit():
                                    nome = part.replace('_', ' ').replace('-', ' ').title()
                                    break
                        
                        # Limpar nome de forma menos restritiva
                        if nome:
                            nome_limpo = limpar_nome_clube(nome)
                            
                            # Aceitar praticamente qualquer nome não vazio
                            if nome_limpo and len(nome_limpo.strip()) >= 1:
                                clubes_encontrados[clube_id] = (nome_limpo, url_clube)
                            else:
                                links_rejeitados += 1
            
            except Exception as e:
                print(f"    ✗ Erro com seletor '{seletor}': {e}")
                continue

    clubes_lista = list(clubes_encontrados.values())
    if clubes_lista:
        print(f"    ✓ Total de clubes únicos extraídos: {len(clubes_lista)}")
        print(f"    📊 Links processados: {total_links_processados}, rejeitados: {links_rejeitados}")
    
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
    """Salva os resultados em CSV com validação e relatório detalhado, preservando dados existentes"""
    if not clubes:
        print("\n⚠ Aviso: Nenhum clube foi encontrado para salvar.")
        return False
    
    try:
        # Criar DataFrame com novos clubes
        df_novos = pd.DataFrame(clubes, columns=["nome", "url"])
        
        # Tentar carregar dados existentes
        df_existentes = pd.DataFrame(columns=["nome", "url"])
        try:
            if pd.io.common.file_exists(nome_arquivo):
                df_existentes = pd.read_csv(nome_arquivo, encoding="utf-8")
                print(f"📄 Carregados {len(df_existentes)} clubes existentes de '{nome_arquivo}'")
        except Exception as e:
            print(f"⚠ Aviso: Não foi possível carregar dados existentes: {e}")
        
        # Combinar dados existentes com novos
        df_combinado = pd.concat([df_existentes, df_novos], ignore_index=True)
        df_antes_dedup = len(df_combinado)
        
        # Remover duplicados por URL (mais confiável que por nome)
        df_combinado = df_combinado.drop_duplicates(subset="url", keep='first')
        df_depois_dedup = len(df_combinado)
        
        # Ordenar por nome para facilitar consulta
        df_combinado = df_combinado.sort_values("nome")
        
        # Salvar CSV
        df_combinado.to_csv(nome_arquivo, index=False, encoding="utf-8")
        
        # Relatório de resultados
        novos_adicionados = df_depois_dedup - len(df_existentes)
        print(f"\n✓ Sucesso! {df_depois_dedup} clubes únicos totais em '{nome_arquivo}'")
        print(f"  📊 {novos_adicionados} clubes novos adicionados")
        if df_antes_dedup != df_depois_dedup:
            print(f"  🔄 {df_antes_dedup - df_depois_dedup} duplicados removidos")
        
        # Mostrar amostra dos novos resultados
        if novos_adicionados > 0:
            print(f"\n📋 Últimos {min(10, novos_adicionados)} clubes adicionados:")
            df_novos_unicos = df_combinado[~df_combinado['url'].isin(df_existentes['url']) if len(df_existentes) > 0 else slice(None)]
            for i, (nome, url) in enumerate(df_novos_unicos.head(10).values, 1):
                print(f"  {i:2d}. {nome}")
            
            if len(df_novos_unicos) > 10:
                print(f"  ... e mais {len(df_novos_unicos) - 10} clubes novos")
        else:
            print(f"\n📋 Nenhum clube novo foi encontrado (todos já existiam)")
        
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