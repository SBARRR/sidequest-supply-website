const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HEADERS_DIR = path.join(PROJECT_ROOT, 'headers');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'headers-manifest.json');
const SUPPORTED_EXTENSIONS = ['.mp4', '.webm', '.ogg'];

function buildManifest() {
    let files = [];

    try {
        files = fs.readdirSync(HEADERS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => SUPPORTED_EXTENSIONS.includes(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    } catch (error) {
        files = [];
    }

    const manifest = {
        videos: files
    };

    fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`Generated headers-manifest.json with ${files.length} video(s).`);
}

buildManifest();
