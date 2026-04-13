const GIFS_DIRECTORY = 'gifs/';
const GIF_MANIFEST_PATH = 'gifs-manifest.json';

function setHeaderGifBackground(header, gifPath) {
    header.style.backgroundImage =
        `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url("${gifPath}")`;
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
    header.style.backgroundRepeat = 'no-repeat';
}

function clearHeaderGifBackground(header) {
    header.style.backgroundImage = 'none';
}

function shuffleArray(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function canLoadImage(path) {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = path;
    });
}

async function loadGifManifest() {
    try {
        const response = await fetch(GIF_MANIFEST_PATH);
        if (!response.ok) {
            return [];
        }

        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.gifs)) {
            return [];
        }

        return manifest.gifs
            .filter((name) => typeof name === 'string')
            .map((name) => name.trim())
            .filter((name) => /\.gif$/i.test(name));
    } catch (error) {
        return [];
    }
}

async function applyRandomHeaderGif() {
    const header = document.querySelector('header');
    if (!header) {
        return;
    }

    const gifNames = await loadGifManifest();
    if (gifNames.length === 0) {
        clearHeaderGifBackground(header);
        return;
    }

    const candidates = shuffleArray(gifNames);
    for (const gifName of candidates) {
        const gifPath = `${GIFS_DIRECTORY}${gifName}`;
        // Skip missing/corrupt files so a bad file never leaves the header black.
        const isLoadable = await canLoadImage(gifPath);
        if (isLoadable) {
            setHeaderGifBackground(header, gifPath);
            return;
        }
    }

    clearHeaderGifBackground(header);
}

applyRandomHeaderGif();
