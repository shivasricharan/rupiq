// No bundling needed: Rupiq is plain static files. This copies the deployable files to dist/.
import fs from 'node:fs'; import path from 'node:path';
const out = 'dist'; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'styles.css', 'theme-init.js', 'sw.js', 'manifest.webmanifest', 'icons', 'src']) fs.cpSync(f, path.join(out, f), { recursive: true });
console.log('Built to dist/');
