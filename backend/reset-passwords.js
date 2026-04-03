const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(
  path.join(__dirname, 'data', 'zapoferta.db')
);

async function resetPasswords() {
  const novaSenha = 'Admin@123';
  const hash = await bcrypt.hash(novaSenha, 10);

  db.prepare(`
    UPDATE users SET password = ?
    WHERE email IN (
      'pati_martel@hotmail.com',
      'rafsanchez2@hotmail.com'
    )
  `).run(hash);

  console.log('✅ Senhas redefinidas com sucesso!');
  console.log('Email: pati_martel@hotmail.com');
  console.log('Email: rafsanchez2@hotmail.com');
  console.log('Nova senha: Admin@123');

  db.close();
}

resetPasswords();
