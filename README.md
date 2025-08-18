# Soccer Club Map - Mapa de Clubes de Futebol

Mapa interativo dos clubes de futebol portugueses, que mostra a localização, emblemas, estádios e equipamentos dos clubes.

## 🗺️ Ver o Mapa

Acede ao mapa em: [scmap.nobrega.uk](https:\\scmap.nobrega.uk)

## 🔄 Como Contribuir

### Correções e Adições de Clubes

Para corrigir informações existentes ou adicionar novos clubes:

1. **Fork** deste repositório
2. **Edita** o ficheiro `clubes.json` com as correções/adições necessárias
3. **Submete** um Pull Request com as tuas alterações

### Formato dos Dados

Cada clube no `clubes.json` deve seguir esta estrutura:

```json
{
    "id": "123", --se nao souberes mete o nome do clube
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
    "address": "Morada do clube", --se nao souberes mete null
    "latitude": 40.123456,
    "longitude": -8.123456,
    "url": "https://www.zerozero.pt/equipa/clube/id"
}
```

### Usar o Formulário de Submissão

1. Clica no botão **+** no canto superior direito do mapa
2. Preenche todos os campos obrigatórios
3. Clica em **Submeter**
4. Um ficheiro `submissions.json` vai ser descarregado
5. Submete esse ficheiro num Pull Request para o repositório


## 🛠️ Desenvolvimento

### Estrutura do Projeto

```
sc-map/
├── index.html          # Página principal
├── style.css           # Estilos CSS
├── script.js           # JavaScript do mapa
├── clubes.json         # Dados dos clubes
├── scraper.py          # Scraper para dados dos clubes
└── clubes.py           # Scraper para lista de clubes
```


## 📝 Licença

Este projeto é open source. Contribuições são bem-vindas!

## 🤝 Contribuidores

Agradecemos a todos que contribuem para manter este mapa atualizado e preciso.

---

Para questões ou sugestões, abre um **Issue** no repositório.