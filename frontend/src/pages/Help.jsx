import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, HelpCircle, Download, Puzzle } from 'lucide-react';

const EXT_DOWNLOAD_URL = 'https://github.com/rafsanchez2rs-jpg/zapofertas/archive/refs/heads/main.zip';

const SECTIONS = [
  {
    title: '🚀 Como começar a usar o ZapOfertas',
    content: `1. Instale a extensão ZapOfertas no Chrome
2. Conecte seu WhatsApp em Configurações
3. Sincronize seus grupos em "Grupos"
4. Acesse a página do produto na Shopee ou Mercado Livre
5. Clique na extensão → "Enviar para ZapOfertas"
6. Revise os dados, cole seu link afiliado e dispare!`,
  },
  {
    title: '🧩 Como instalar e usar a extensão',
    content: `INSTALAÇÃO (após baixar o arquivo ZIP):
1. Extraia o ZIP baixado em uma pasta permanente no seu computador
2. Abra o Chrome e acesse: chrome://extensions
3. Ative o "Modo desenvolvedor" (canto superior direito)
4. Clique em "Carregar sem compactação"
5. Selecione a pasta: zapofertas-main/chrome-extension
6. O ícone ⚡ aparecerá na barra do Chrome

COMO USAR:
1. Acesse a página de um produto na Shopee ou Mercado Livre
2. Clique no ícone ⚡ ZapOfertas na barra do Chrome
3. Os dados do produto serão capturados automaticamente
4. Clique em "Enviar para ZapOfertas"
5. O sistema preencherá tudo automaticamente

ATENÇÃO:
- Para Mercado Livre, acesse a página individual do produto
  (não funciona em páginas de lista ou busca)
- Se não capturar, feche e reabra a aba e tente novamente
- Não mova ou delete a pasta após instalar — o Chrome precisa
  dela para manter a extensão funcionando`,
  },
  {
    title: '📣 Como criar e disparar um anúncio',
    content: `PASSO 1 - CAPTURAR:
- Use a extensão Chrome para capturar o produto
- Ou aguarde na tela "Novo Anúncio" — os dados chegam automaticamente

PASSO 2 - REVISAR:
- Confira nome, preços e desconto capturados
- Corrija qualquer informação se necessário
- Cole seu link afiliado do produto
- Se houver cupom, ative o checkbox e escolha:
  • Código do cupom (ex: SAVE10)
  • Link de resgate (seu link afiliado do cupom)

PASSO 3 - GERAR E DISPARAR:
- Clique em "Gerar Anúncio"
- Confira o preview no estilo WhatsApp
- Selecione os grupos destino
- Escolha: disparar agora ou agendar
- Clique em "Disparar Agora" ou "Agendar Anúncio"`,
  },
  {
    title: '📅 Como agendar anúncios',
    content: `- Após gerar o anúncio, escolha a data/hora de envio
- Opções rápidas: 30 min, 1 hora, 2 horas, amanhã 9h
- Ou escolha uma data e hora específicas
- Clique em "Agendar Anúncio" — botão ficará azul
- O anúncio aparece no Histórico com status 🕐 Agendado
- Para cancelar: acesse Histórico → clique em "Cancelar agendamento"
- Você pode agendar quantos anúncios quiser simultaneamente`,
  },
  {
    title: '👥 Como gerenciar grupos do WhatsApp',
    content: `- Primeiro conecte o WhatsApp em Configurações
- Acesse "Grupos" no menu lateral
- Clique em "Sincronizar grupos" para carregar seus grupos
- Ative/desative os grupos que receberão os anúncios
- Crie "Coleções" para organizar grupos por categoria
  (ex: "Grupos Shopee", "Grupos Eletrônicos")
- Configure o delay entre envios para evitar bloqueios

💡 DICA: Nunca envie para muitos grupos ao mesmo tempo.
Comece com 3-5 grupos e aumente gradualmente.`,
  },
  {
    title: '📱 Conectar e manter o WhatsApp ativo',
    content: `COMO CONECTAR:
1. Acesse Configurações no menu lateral
2. Clique em "Conectar WhatsApp"
3. Abra o WhatsApp no celular
4. Vá em: Menu → Aparelhos conectados → Conectar aparelho
5. Escaneie o QR Code exibido na tela
6. Aguarde a confirmação ✅

MANTENDO A CONEXÃO:
- Não feche o terminal enquanto estiver usando
- O sistema reconecta automaticamente se cair
- Se pedir QR Code novamente, basta escanear de novo
- Use um número dedicado para evitar bloqueios

SE DESCONECTAR DURANTE ENVIO:
- O envio atual pode falhar
- Reconecte pelo QR Code
- Use "Reenviar" no Histórico para reenviar`,
  },
  {
    title: '📊 Entendendo o histórico de disparos',
    content: `- Todos os anúncios disparados e agendados ficam aqui
- Status possíveis:
  ✅ Enviado — disparado com sucesso
  🕐 Agendado — aguardando data/hora programada
  ❌ Falhou — erro no envio
- Filtre por: Todos, Enviados, Agendados, Falhos
- Clique em um anúncio para ver detalhes por grupo
- Botão "Reenviar" — envia novamente para grupos que falharam
- Botão "Cancelar" — cancela anúncios agendados`,
  },
  {
    title: '🎟️ Como usar cupons nos anúncios',
    content: `- No passo 2 (Revisar dados), ative "Incluir cupom no anúncio"
- Escolha o tipo:

  CÓDIGO DO CUPOM: o comprador aplica manualmente
  (ex: SAVE10 → aparece "Aplique o cupom 🎟️ SAVE10")

  LINK DE RESGATE: o comprador clica no link
  (ex: seu link afiliado do cupom)

- Você pode salvar seu link de cupom padrão em Configurações
- O link padrão será preenchido automaticamente toda vez`,
  },
  {
    title: '📈 Entendendo o dashboard',
    content: `- Disparos hoje: total de anúncios enviados no dia
- Esta semana: total dos últimos 7 dias
- Grupos ativos: grupos habilitados para receber anúncios
- Taxa de sucesso: % de envios que chegaram com sucesso
- Gráfico: evolução de disparos nos últimos 14 dias
- Top produtos: produtos mais anunciados
- Grupos mais ativos: grupos que mais recebem anúncios`,
  },
  {
    title: '💎 Planos Free e Pro',
    content: `PLANO FREE:
- Máximo 3 grupos por disparo
- Máximo 10 disparos por dia

PLANO PRO:
- Grupos ilimitados
- Disparos ilimitados
- Acesso a todas as funcionalidades

Para fazer upgrade para Pro, entre em contato
pelo suporte via WhatsApp.`,
  },
  {
    title: '⚠️ Dicas importantes para não ser bloqueado',
    content: `- Use um número secundário, não seu número pessoal
- Comece enviando para poucos grupos (3-5)
- Aguarde pelo menos 30 minutos entre rodadas de envio
- Varie as mensagens — não envie a mesma mensagem seguida
- Nunca envie para grupos sem permissão dos admins
- O sistema já aplica delay automático entre grupos
- Se o WhatsApp bloquear: aguarde 24h antes de tentar novamente`,
  },
  {
    title: '❓ Perguntas frequentes',
    content: `P: A extensão não captura os dados. O que fazer?
R: Feche e reabra a aba do produto e tente novamente.
   Se persistir, atualize a extensão em chrome://extensions.

P: O WhatsApp desconecta sozinho. Por que?
R: Pode ser instabilidade de internet ou o WhatsApp detectou
   uso intenso. Reconecte pelo QR Code e reduza a frequência
   de envios.

P: O anúncio foi disparado mas não aparece no histórico.
R: Atualize a página do histórico. Se não aparecer,
   entre em contato com o suporte.

P: Posso usar no celular?
R: A versão mobile está em desenvolvimento. Por enquanto,
   use no computador com Chrome.

P: O preço capturado está errado. O que fazer?
R: Edite manualmente o campo de preço no passo 2
   antes de gerar o anúncio.

P: Como cancelar um agendamento?
R: Acesse Histórico → encontre o anúncio agendado →
   clique em "Cancelar agendamento".`,
  },
];

function AccordionItem({ title, content, isOpen, onToggle }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/3 transition-colors"
      >
        <span className="text-text-primary text-sm font-medium">{title}</span>
        {isOpen
          ? <ChevronUp size={16} className="text-accent flex-shrink-0" />
          : <ChevronDown size={16} className="text-text-secondary flex-shrink-0" />
        }
      </button>
      {isOpen && (
        <div className="px-4 pb-4 border-t border-border bg-bg">
          <pre className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap font-sans pt-3">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function Help() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (i) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className="max-w-3xl animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-accent/10 rounded-lg flex items-center justify-center">
          <HelpCircle size={18} className="text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Central de Ajuda</h1>
          <p className="text-text-secondary text-sm mt-0.5">Tutoriais e perguntas frequentes</p>
        </div>
      </div>

      {/* Extensão Chrome card */}
      <div className="card border-2 border-accent/30 bg-accent/5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/15 rounded-xl flex items-center justify-center">
              <Puzzle size={20} className="text-accent" />
            </div>
            <div>
              <p className="text-text-primary font-semibold text-sm">⚡ Extensão para Chrome</p>
              <p className="text-text-secondary text-xs mt-0.5">
                Capture produtos da Shopee e Mercado Livre com 1 clique
              </p>
            </div>
          </div>
          <a
            href={EXT_DOWNLOAD_URL}
            download
            className="btn-primary text-sm"
          >
            <Download size={15} />
            Baixar extensão
          </a>
        </div>
        <p className="text-text-secondary text-xs mt-3 pt-3 border-t border-border">
          Após baixar, extraia o ZIP e instale via <span className="text-text-primary font-mono">chrome://extensions</span> → "Carregar sem compactação" → selecione a pasta <span className="text-text-primary font-mono">zapofertas-main/chrome-extension</span>. Veja o passo a passo completo no acordeão abaixo.
        </p>
      </div>

      {/* Suporte card */}
      <div className="card bg-accent/5 border-accent/20">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/15 rounded-xl flex items-center justify-center">
              <MessageCircle size={20} className="text-accent" />
            </div>
            <div>
              <p className="text-text-primary font-semibold text-sm">💬 Precisa de ajuda?</p>
              <p className="text-text-secondary text-xs mt-0.5">Fale com o suporte via WhatsApp</p>
            </div>
          </div>
          <a
            href="https://wa.me/5555999964716"
            target="_blank"
            rel="noreferrer"
            className="btn-primary text-sm"
          >
            <MessageCircle size={15} />
            Chamar no WhatsApp
          </a>
        </div>
      </div>

      {/* Accordion */}
      <div className="space-y-2">
        {SECTIONS.map((s, i) => (
          <AccordionItem
            key={i}
            title={s.title}
            content={s.content}
            isOpen={openIndex === i}
            onToggle={() => toggle(i)}
          />
        ))}
      </div>
    </div>
  );
}
