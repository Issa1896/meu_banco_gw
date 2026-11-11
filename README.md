# MeuBanco GW - Sistema de Pagamentos da Guiné-Bissau

Sistema completo de pagamentos e transferências monetárias com suporte a Orange Money, Mobile Money, PIX, IBAN e muito mais.

## Funcionalidades

### 💸 Transferências & Pagamentos
- Orange Money e Mobile Money (Guiné-Bissau)
- PIX Internacional
- IBAN/SWIFT
- Transferência bancária local
- Carteira interna MeuBanco

### 🔒 Segurança
- Autenticação de dois fatores (2FA) via TOTP, com segredo cifrado (AES-256-GCM) e etapa de senha vinculada por token de curta duração
- Tokens JWT tipados (acesso 15 min / refresh com rotação e detecção de reuso / MFA 5 min)
- Redefinição de senha por email com token aleatório guardado só como hash
- Rate limiting e bloqueio temporário contra força bruta (login e 2FA)
- 🚧 Autenticação biométrica (WebAuthn) — em desenvolvimento, desativada
- Logs de auditoria completos
- Dispositivos confiáveis

### 📊 Gestão Financeira
- Dashboard em tempo real
- Orçamentos mensais por categoria
- Gráficos de gastos
- Relatórios mensais detalhados
- Exportação de comprovantes em PDF

### 🎧 Suporte
- Chat integrado com IA
- Sistema de tickets 24/7
- Suporte multilingue (PT, EN, FR)

### 📱 Recursos
- Interface responsiva mobile-first
- Tema claro/escuro
- Notificações em tempo real (WebSocket)
- Offline support
- Multi-moeda (XOF, EUR, USD, BRL)

### 🛡️ Painel Administrativo
- Gestão completa de usuários
- Aprovação KYC
- Visualização de transações
- Gerenciamento de tickets
- Analytics e métricas
- Logs de auditoria

## Tecnologias

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Redis (cache/sessões)
- Socket.IO (tempo real)
- JWT + bcryptjs
- PDFKit (comprovantes)
- i18next (internacionalização)
- Winston (logs)
- Helmet + CORS + Rate Limiting

### Frontend
- React 18 + Vite
- TailwindCSS
- React Router v6
- Chart.js
- Socket.IO Client
- Axios
- React Hot Toast

## Setup

### Pré-requisitos
- Node.js 18+
- MongoDB
- Redis (opcional)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env  # Configure as variáveis
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

### Contas de desenvolvimento

Sem MongoDB local, o backend sobe um replica set em memória (só fora de produção) com:

| Email | Senha padrão |
|---|---|
| `admin@meubanco.gw` | `Admin123!` (ou `SEED_ADMIN_PASSWORD`) |
| `teste@meubanco.gw` | `Teste123!` (ou `SEED_USER_PASSWORD`) |

Em produção (`NODE_ENV=production`) o servidor não sobe sem MongoDB e sem os segredos
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_MFA_SECRET`, `ENCRYPTION_KEY` e `FRONTEND_URL`.

### 3. Acessar
- Frontend: http://localhost:5173
- API: http://localhost:3000/api
- Health: http://localhost:3000/api/health

## Estrutura do Projeto

```
meu-banco/
├── backend/
│   ├── src/
│   │   ├── config/       # Configurações (DB, Redis, Socket, i18n)
│   │   ├── controllers/  # Lógica dos endpoints
│   │   ├── locales/      # Traduções (pt, en, fr)
│   │   ├── middleware/    # Auth, Security, Error Handler
│   │   ├── models/       # Mongoose models
│   │   ├── routes/       # Rotas da API
│   │   └── utils/        # Helpers, Validators, Encryption
│   ├── .env
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Layout, AdminLayout
│   │   ├── contexts/     # AuthContext, ThemeContext
│   │   ├── pages/        # Páginas do app + admin
│   │   ├── services/     # API, Socket
│   │   └── App.jsx       # Rotas
│   ├── index.html
│   └── package.json
└── README.md
```

## API Endpoints

### Autenticação
- `POST /api/auth/register` - Criar conta
- `POST /api/auth/login` - Login
- `POST /api/auth/verify-2fa` - Verificar 2FA (`{ mfaToken, token }`)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/profile` - Perfil
- `PUT /api/auth/profile` - Atualizar perfil
- `GET /api/auth/2fa/setup` - Setup 2FA
- `POST /api/auth/2fa/enable` - Ativar 2FA (`{ token }`)
- `POST /api/auth/2fa/disable` - Desativar 2FA (`{ password, token }`)
- `POST /api/auth/refresh-token` - Renovar tokens (rotação)
- `POST /api/auth/forgot-password` - Solicitar redefinição (sempre 200)
- `POST /api/auth/reset-password` - Redefinir senha (`{ token, password }`)

### Transações
- `POST /api/transactions/transfer` - Nova transferência
- `GET /api/transactions` - Listar transações
- `GET /api/transactions/balance` - Saldo
- `GET /api/transactions/stats` - Estatísticas
- `GET /api/transactions/monthly-report` - Relatório mensal
- `GET /api/transactions/:id/receipt` - Download comprovante PDF

### Admin
- `GET /api/admin/dashboard` - Dashboard admin
- `GET /api/admin/users` - Listar usuários
- `PUT /api/admin/users/:id/status` - Alterar status
- `PUT /api/admin/users/:id/kyc/approve` - Aprovar KYC
- `GET /api/admin/transactions` - Todas transações
- `GET /api/admin/tickets` - Tickets de suporte
- `GET /api/admin/analytics` - Analytics
- `GET /api/admin/audit-logs` - Logs de auditoria

## Licença

Proprietária - MeuBanco GW
