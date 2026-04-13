(function initializeViewportFix() {
    const root = document.documentElement;
    let lastStableDrawerHeight = window.visualViewport
        ? window.visualViewport.height
        : window.innerHeight;
    let lastStablePageHeight = window.innerHeight;

    function isKeyboardLikelyOpen() {
        if (!window.visualViewport) {
            return false;
        }

        const active = document.activeElement;
        if (!active) {
            return false;
        }

        const tagName = active.tagName;
        const isTextInput = (
            tagName === 'TEXTAREA'
            || (tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'file', 'color', 'image', 'submit', 'reset', 'hidden']
                .includes((active.getAttribute('type') || 'text').toLowerCase()))
            || active.isContentEditable
        );

        if (!isTextInput) {
            return false;
        }

        const visualHeight = window.visualViewport.height;
        const layoutHeight = window.innerHeight;
        return visualHeight < (layoutHeight - 120);
    }

    function setAppHeight() {
        const nextDrawerHeight = window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight;
        const nextPageHeight = window.innerHeight;
        const keyboardOpen = isKeyboardLikelyOpen();

        const drawerViewportHeight = keyboardOpen
            ? lastStableDrawerHeight
            : nextDrawerHeight;
        const pageViewportHeight = keyboardOpen
            ? lastStablePageHeight
            : nextPageHeight;

        root.style.setProperty('--app-height', `${Math.round(drawerViewportHeight)}px`);
        root.style.setProperty('--page-height', `${Math.round(pageViewportHeight)}px`);

        if (!keyboardOpen) {
            lastStableDrawerHeight = nextDrawerHeight;
            lastStablePageHeight = nextPageHeight;
        }
    }

    setAppHeight();

    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    document.addEventListener('focusin', setAppHeight);
    document.addEventListener('focusout', () => {
        setTimeout(setAppHeight, 50);
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setAppHeight);
    }
})();
