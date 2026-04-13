const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const STATIC_TARGETS = [
    'fonts',
    'gifs',
    'icons',
    'product json',
    'product photos',
    'gifs-manifest.json'
];

function pathExists(targetPath) {
    try {
        fs.accessSync(targetPath);
        return true;
    } catch (error) {
        return false;
    }
}

function copyRecursive(sourcePath, destinationPath) {
    const sourceStats = fs.statSync(sourcePath);

    if (sourceStats.isDirectory()) {
        fs.mkdirSync(destinationPath, { recursive: true });
        const children = fs.readdirSync(sourcePath);
        children.forEach((childName) => {
            copyRecursive(
                path.join(sourcePath, childName),
                path.join(destinationPath, childName)
            );
        });
        return;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
}

if (!pathExists(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
}

STATIC_TARGETS.forEach((targetName) => {
    const sourcePath = path.join(PROJECT_ROOT, targetName);
    if (!pathExists(sourcePath)) {
        return;
    }

    const destinationPath = path.join(DIST_DIR, targetName);
    copyRecursive(sourcePath, destinationPath);
    console.log(`Copied: ${targetName}`);
});
