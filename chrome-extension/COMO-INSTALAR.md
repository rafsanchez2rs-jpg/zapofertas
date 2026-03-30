# ZapOfertas Capturar — Como Instalar

## Pré-requisitos
- Google Chrome (versão 111 ou superior)
- ZapOfertas backend rodando (`npm run dev` na pasta `backend`)
- ZapOfertas frontend rodando (`npm run dev` na pasta `frontend`)

## Instalação da extensão

1. Abra o Chrome e acesse: `chrome://extensions`

2. Ative o **Modo desenvolvedor** (canto superior direito)

3. Clique em **"Carregar sem compactação"**

4. Selecione a pasta:
   ```
   zapOfertas/chrome-extension
   ```

5. A extensão **ZapOfertas Capturar** aparecerá na lista com o ícone de raio verde

6. Fixe o ícone na barra de ferramentas:
   - Clique no ícone de quebra-cabeça (🧩) na barra do Chrome
   - Clique no alfinete ao lado de "ZapOfertas Capturar"

## Como usar

1. Abra o **ZapOfertas** no navegador: `http://localhost:5173`
2. Vá para **Novo Anúncio**
3. Em outra aba, acesse qualquer **página de produto da Shopee**
4. Clique no ícone ⚡ do ZapOfertas na barra do Chrome
5. Confira os dados extraídos (nome, preço, desconto)
6. Clique **"Enviar para ZapOfertas →"**
7. Volte para a aba do ZapOfertas — os campos serão preenchidos automaticamente
8. Complete o link de afiliado, selecione os grupos e dispare!

## Solução de problemas

| Problema | Solução |
|----------|---------|
| "ZapOfertas não está rodando" | Execute `npm run dev` na pasta `backend` |
| "Acesse uma página de produto" | Navegue até a página de um produto específico na Shopee |
| Dados incorretos | Corrija manualmente nos campos — a extração é automática mas pode falhar em layouts diferentes |
| Extensão não aparece | Confirme que carregou a pasta correta em `chrome://extensions` |

## Segurança

A extensão só acessa:
- Páginas da Shopee (para extrair dados)
- `localhost:3001` (backend local do ZapOfertas)

Nenhum dado é enviado para servidores externos.
