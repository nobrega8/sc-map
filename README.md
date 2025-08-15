# Soccer Club Map - Mapa de Clubes de Futebol

Um mapa interativo dos clubes de futebol portugueses, mostrando a localização, emblemas, estádios e equipamentos dos clubes.

## 🗺️ Ver o Mapa

Acesse o mapa em: [https://nobrega8.github.io/sc-map/](https://nobrega8.github.io/sc-map/)

## ⚽ Funcionalidades

- **Mapa interativo** com localização dos clubes
- **Emblemas originais** dos clubes (sem recorte)
- **Informações detalhadas** sobre estádios e equipamentos
- **Links diretos** para as páginas dos clubes no ZeroZero
- **Formulário de submissão** para novos clubes

## 🔄 Como Contribuir

### Correções e Adições de Clubes

Para corrigir informações existentes ou adicionar novos clubes:

1. **Fork** este repositório
2. **Edite** o arquivo `clubes.json` com as correções/adições necessárias
3. **Submeta** um Pull Request com as suas alterações

### Formato dos Dados

Cada clube no `clubes.json` deve seguir esta estrutura:

```json
{
    "id": "123",
    "club": "Nome do Clube",
    "stadium": "Nome do Estádio",
    "logo": "https://url-do-logo.png",
    "equipamentos": [
        {
            "type": "casa",
            "url": "https://url-do-equipamento.png",
            "alt_text": "texto-alternativo"
        }
    ],
    "address": "Morada do clube",
    "latitude": 40.123456,
    "longitude": -8.123456,
    "url": "https://www.zerozero.pt/equipa/clube/id"
}
```

### Usar o Formulário de Submissão

1. Clique no botão **+** no canto superior direito do mapa
2. Preencha todos os campos obrigatórios
3. Clique em **Submeter**
4. Um arquivo `submissions.json` será descarregado
5. Submeta este arquivo num Pull Request para o repositório

## 📋 Campos Obrigatórios

- **Nome do Clube**: Nome oficial do clube
- **URL do Logo**: Link direto para o emblema do clube
- **URL ZeroZero**: Link para a página do clube no ZeroZero.pt
- **Latitude/Longitude**: Coordenadas GPS da localização do clube

## 📋 Campos Opcionais

- **Estádio**: Nome do estádio principal
- **Morada**: Endereço do clube
- **Equipamentos**: Adicionados automaticamente pelos scripts

## 🛠️ Desenvolvimento

### Estrutura do Projeto

```
sc-map/
├── index.html          # Página principal
├── style.css           # Estilos CSS
├── script.js           # JavaScript do mapa
├── clubes.json         # Dados dos clubes
├── submissions.json    # Submissões pendentes
├── scraper.py          # Script para extrair dados
├── clubes.py           # Script auxiliar
└── README.md           # Este arquivo
```

### Scripts Python

- **scraper.py**: Extrai dados dos clubes do ZeroZero.pt
- **clubes.py**: Processa e organiza os dados dos clubes

### Tecnologias Utilizadas

- **Leaflet.js**: Biblioteca de mapas interativos
- **HTML5/CSS3/JavaScript**: Interface web
- **Python**: Scripts de processamento de dados

## 📝 Licença

Este projeto é open source. Contribuições são bem-vindas!

## 🤝 Contribuidores

Agradecemos a todos que contribuem para manter este mapa atualizado e preciso.

---

Para questões ou sugestões, abra uma **Issue** no repositório.