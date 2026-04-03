# Migração SQLite → Firebase Firestore

Este guia mostra como migrar completamente do SQLite para o Firebase Firestore.

## 📋 Pré-requisitos

1. **Projeto Firebase**: Crie um projeto no [Firebase Console](https://console.firebase.google.com/)
2. **Firestore**: Ative o Firestore no seu projeto
3. **Service Account**: Baixe a chave JSON da service account
4. **Dependências**: Instale `firebase-admin`

```bash
cd backend
npm install firebase-admin
```

## 🔧 Configuração

1. **Copie as variáveis do Firebase**:
   - Abra o arquivo JSON da service account
   - Copie os valores para `.env`:
     ```
     FIREBASE_PROJECT_ID=your-project-id
     FIREBASE_PRIVATE_KEY_ID=your-private-key-id
     FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
     FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
     FIREBASE_CLIENT_ID=your-client-id
     FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/...
     ```

2. **Aplique as regras de segurança**:
   - No Firebase Console → Firestore → Rules
   - Cole o conteúdo do arquivo `firestore.rules`

## 🚀 Migração

### Passo 1: Teste (Dry Run)
```bash
cd backend
node scripts/migrate-to-firestore.js --dry-run
```

### Passo 2: Migração Real
```bash
node scripts/migrate-to-firestore.js
```

### Passo 3: Verificar
- Acesse o Firebase Console → Firestore
- Verifique se as coleções foram criadas:
  - `users`, `refreshTokens`, `settings`, `collections`, `groups`, `campaigns`, `campaignGroups`, `invites`

## 🔄 Atualização do Código

Após a migração, atualize os arquivos para usar os repositórios Firestore:

### auth.js
```js
// Substitua consultas SQLite por:
const userRepo = require('./repositories/userRepo');
const refreshTokenRepo = require('./repositories/refreshTokenRepo');

// Exemplo:
const user = await userRepo.getUserByEmail(email);
await refreshTokenRepo.createRefreshToken(userId, token, expiresAt);
```

### Outros arquivos
- `groups.js` → use `groupsRepo`
- `campaigns.js` → use `campaignsRepo`
- `admin.js` → use `userRepo` e `invitesRepo`

## 📊 Mapeamento de Dados

| SQLite Table | Firestore Collection | Campos Principais |
|--------------|---------------------|-------------------|
| `users` | `users/{userId}` | email, passwordHash, name, plan, role |
| `refresh_tokens` | `refreshTokens/{token}` | userId, expiresAt |
| `settings` | `settings/{userId}` | delay_between_sends, send_image |
| `collections` | `collections/{id}` | userId, name |
| `groups` | `groups/{id}` | userId, waGroupId, name, active |
| `campaigns` | `campaigns/{id}` | userId, product_name, message, status |
| `campaign_groups` | `campaignGroups/{id}` | campaignId, groupId, status |
| `invites` | `invites/{id}` | token, plan, createdBy |

## 🛡️ Segurança

- **Regras Firestore**: Apenas usuários autenticados acessam seus próprios dados
- **Admins**: Emails específicos têm acesso total
- **Tokens**: Refresh tokens são protegidos por usuário

## 🔄 Rollback

Se precisar voltar ao SQLite:
1. Pare o backend
2. Remova as variáveis Firebase do `.env`
3. Reinicie o backend (voltará a usar SQLite)

## 📈 Benefícios Após Migração

- ✅ **Escalabilidade**: Firestore escala automaticamente
- ✅ **Backup**: Dados sempre seguros na nuvem
- ✅ **Realtime**: Possibilidade de updates em tempo real
- ✅ **Multi-device**: Acesso de qualquer lugar
- ✅ **Analytics**: Métricas integradas do Firebase

## 🐛 Troubleshooting

### Erro: "Invalid credentials"
- Verifique se as variáveis do `.env` estão corretas
- Certifique-se de que a service account tem permissões no Firestore

### Erro: "Permission denied"
- Verifique as regras de segurança no Firebase Console
- Certifique-se de que o usuário está autenticado

### Dados não aparecem
- Execute novamente a migração
- Verifique os logs do console para erros específicos

---

**Próximos passos**: Após testar a migração, você pode remover o SQLite completamente e usar apenas Firestore.