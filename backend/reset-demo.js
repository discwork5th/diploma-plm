// Сбросить базу к демо-состоянию: удаляет файл БД, при следующем запуске
// сервер создаст его заново со свежим демо-каталогом и эталонными правилами.
// Запуск: npm run reset-demo (при остановленном сервере).
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'database.db');
for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
console.log(`База ${DB_FILE} удалена. Запусти сервер — демо-данные зальются заново.`);
