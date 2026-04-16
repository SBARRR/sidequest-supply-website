const HEADER_VIDEOS_DIRECTORY = 'headers/';
const HEADER_MANIFEST_PATH = 'headers-manifest.json';
const HEADER_VIDEO_CLASS_NAME = 'header-background-video';

function clearHeaderVideoBackground(header) {
    const existingVideo = header.querySelector(`.${HEADER_VIDEO_CLASS_NAME}`);
    if (existingVideo) {
        existingVideo.remove();
    }
}

function shuffleArray(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

async function loadHeaderManifest() {
    try {
        const response = await fetch(HEADER_MANIFEST_PATH);
        if (!response.ok) {
            return [];
        }

        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.videos)) {
            return [];
        }

        return manifest.videos
            .filter((name) => typeof name === 'string')
            .map((name) => name.trim())
            .filter((name) => /\.(mp4|webm|ogg)$/i.test(name));
    } catch (error) {
        return [];
    }
}

function createHeaderVideoElement(videoPath) {
    const video = document.createElement('video');
    video.className = HEADER_VIDEO_CLASS_NAME;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.preload = 'metadata';
    video.src = videoPath;
    return video;
}

function tryHeaderVideoCandidate(header, candidates, index) {
    if (index >= candidates.length) {
        clearHeaderVideoBackground(header);
        return;
    }

    const videoPath = `${HEADER_VIDEOS_DIRECTORY}${candidates[index]}`;
    const video = createHeaderVideoElement(videoPath);

    video.addEventListener('loadeddata', () => {
        const autoplayPromise = video.play();
        if (autoplayPromise && typeof autoplayPromise.catch === 'function') {
            autoplayPromise.catch(() => {});
        }
    }, { once: true });

    video.addEventListener('error', () => {
        video.remove();
        tryHeaderVideoCandidate(header, candidates, index + 1);
    }, { once: true });

    header.prepend(video);
}

async function applyRandomHeaderGif() {
    const header = document.querySelector('header');
    if (!header) {
        return;
    }

    const videoNames = await loadHeaderManifest();
    if (videoNames.length === 0) {
        clearHeaderVideoBackground(header);
        return;
    }

    clearHeaderVideoBackground(header);

    const candidates = shuffleArray(videoNames);
    tryHeaderVideoCandidate(header, candidates, 0);
}

applyRandomHeaderGif();
