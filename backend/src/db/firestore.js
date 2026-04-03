const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

let serviceAccount = null;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  };
}

if (!serviceAccount) {
  const keyPath = path.resolve(__dirname, '../../firebase-key.json');
  if (fs.existsSync(keyPath)) {
    serviceAccount = require(keyPath);
  }
}

if (!serviceAccount || !serviceAccount.project_id) {
  throw new Error('Firebase service account inválido: defina variáveis FIREBASE_PROJECT_ID/FIREBASE_PRIVATE_KEY/FIREBASE_CLIENT_EMAIL no .env ou crie backend/serviceAccountKey.json.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
module.exports = { db };