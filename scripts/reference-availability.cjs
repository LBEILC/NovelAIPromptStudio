const fs = require('node:fs');
const path = require('node:path');

function referenceAvailability(root = process.cwd()) {
  const available = fs.existsSync(path.join(root, 'design', 'preview.html'));
  return {
    available,
    reason: available ? null : '界面稿不在，没有生成对照图',
  };
}
module.exports = { referenceAvailability };
