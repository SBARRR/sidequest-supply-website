const VISIBILITY_SCROLL_Y = 260;

function initializeBackToTopButton() {
    if (document.querySelector('.back-to-top-button')) {
        return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'back-to-top-button';
    button.setAttribute('aria-label', 'Back to top');
    button.title = 'Back to top';
    button.textContent = '↑';

    function syncVisibility() {
        button.classList.toggle('is-visible', window.scrollY > VISIBILITY_SCROLL_Y);
    }

    function scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    button.addEventListener('click', scrollToTop);
    button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            scrollToTop();
        }
    });

    document.body.appendChild(button);
    window.addEventListener('scroll', syncVisibility, { passive: true });
    syncVisibility();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBackToTopButton, { once: true });
} else {
    initializeBackToTopButton();
}
