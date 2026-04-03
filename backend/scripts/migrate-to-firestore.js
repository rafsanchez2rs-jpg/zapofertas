const dbFirestore = require('../src/db/firestore');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/zapoferta.db');
const sqlite = new Database(dbPath);

async function migrate() {
  console.log("🚀 Iniciando migração...");

  try {
    const users = sqlite.prepare("SELECT * FROM users").all();

    console.log(`📦 ${users.length} usuários encontrados`);

    for (const user of users) {
      await dbFirestore.collection('usuarios').add({
        id_antigo: user.id,
        nome: user.nome || user.name || null,
        email: user.email || null,
        criadoEm: new Date()
      });

      console.log(`✅ Migrado: ${user.email}`);
    }

    console.log("🎉 Migração finalizada!");
  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

migrate();