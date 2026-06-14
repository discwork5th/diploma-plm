const db = require('./database');
const info = db.prepare('DELETE FROM expert_rules').run();
console.log(`Удалено правил: ${info.changes}`);
console.log('Перезапусти сервер — правила зальются заново.');