function scrollToHashTarget() {
    const rawHash = window.location.hash;
    if (!rawHash) {
        return;
    }

    const targetId = decodeURIComponent(rawHash.slice(1));
    const target = document.getElementById(targetId);
    if (!target) {
        return;
    }

    target.scrollIntoView({ block: 'start' });
}

window.addEventListener('load', () => {
    scrollToHashTarget();
    setTimeout(scrollToHashTarget, 150);
    setTimeout(scrollToHashTarget, 500);
});
