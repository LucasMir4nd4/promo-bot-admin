# PromoBot Admin Panel 🤖

Painel de administração Angular para o **promo-bot** (Spring Boot).

## Pré-requisitos

- Node.js 18+
- npm 9+
- Angular CLI: `npm install -g @angular/cli`

## Como rodar

```bash
# 1. Instale as dependências
npm install

# 2. Suba o painel
npm start
# → Abre em http://localhost:4200
```

## Configurando a URL do bot

Ao abrir o painel, clique em **⚙️ Config** no canto superior direito e informe a URL base do bot:

- **Local:** `http://localhost:8081`
- **VPS:** `http://SEU-IP:8081`

A URL é salva no `localStorage` do navegador.

## Funcionalidades

| Feature | Endpoint | Descrição |
|---|---|---|
| ⚡ Status | `GET /api/health` | Status do bot + total de produtos enviados. Atualiza a cada 30s. |
| 🚀 Executar | `POST /api/executar` | Dispara o ciclo manualmente. Exibe log em tempo real. |
| 📦 Produtos | `GET /api/enviados?horas=N` | Tabela de produtos enviados com filtro de 6h / 12h / 24h / 48h / 72h. |

## Estrutura

```
src/app/
├── services/
│   └── bot-api.service.ts       ← Todas as chamadas HTTP centralizadas
├── components/
│   ├── health-card/             ← Card de status com auto-refresh
│   ├── executar-btn/            ← Botão de disparo com terminal de log
│   ├── produtos-table/          ← Tabela com filtro de horas
│   └── config-modal/            ← Modal de configuração da URL
└── pages/
    └── dashboard/               ← Página principal
```

## CORS (necessário no backend)

Se o painel estiver em domínio diferente do bot, adicione no `BotController.java`:

```java
@CrossOrigin(origins = "*")
```

Ou configure globalmente no `application.yml`:

```yaml
spring:
  mvc:
    cors:
      allowed-origins: "*"
```
