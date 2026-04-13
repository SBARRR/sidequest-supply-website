const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const GIFS_DIR = path.join(PROJECT_ROOT, 'gifs');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'gifs-manifest.json');

function buildManifest() {
    let files = [];

    try {
        files = fs.readdirSync(GIFS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => /\.gif$/i.test(name))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    } catch (error) {
        files = [];
    }

    const manifest = {
        gifs: files
    };

    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Generated gifs-manifest.json with ${files.length} GIF(s).`);
}

buildManifest();
