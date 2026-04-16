(function initializeCartFeedback(globalScope) {
    const cart = globalScope.SidequestCart;
    if (!cart) {
        return;
    }

    const headerCartButtons = Array.from(document.querySelectorAll('.header-cart-button'));
    const ICON_BUTTON_SELECTORS = '.catalogue-cart-button, .featured-cart-button';
    let toastHideTimer = null;

    function ensureHeaderCountBadges() {
        headerCartButtons.forEach((button) => {
            if (!button.querySelector('.header-cart-count')) {
                const count = document.createElement('span');
                count.className = 'header-cart-count';
                count.hidden = true;
                count.textContent = '0';
                button.appendChild(count);
            }
        });
    }

    function updateHeaderCountBadges() {
        const totalCount = cart.getTotalCount();
        headerCartButtons.forEach((button) => {
            const count = button.querySelector('.header-cart-count');
            if (!count) {
                return;
            }
            count.hidden = totalCount <= 0;
            if (totalCount > 0) {
                count.textContent = String(totalCount);
            }
        });
    }

    function ensureToastElement() {
        let toast = document.querySelector('.cart-toast');
        if (toast) {
            return toast;
        }

        toast = document.createElement('div');
        toast.className = 'cart-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.textContent = 'Added to cart';
        document.body.appendChild(toast);
        return toast;
    }

    function showToast(message = 'Added to cart') {
        const toast = ensureToastElement();
        toast.textContent = message;
        toast.classList.add('show');

        if (toastHideTimer) {
            clearTimeout(toastHideTimer);
        }

        toastHideTimer = setTimeout(() => {
            toast.classList.remove('show');
            toastHideTimer = null;
        }, 2200);
    }

    function showAddedToast() {
        showToast('Added to cart');
    }

    function flashIconButton(button) {
        if (!button) {
            return;
        }

        const existingCheck = button.querySelector('.cart-added-check');
        if (existingCheck) {
            existingCheck.remove();
        }

        button.classList.remove('is-added-feedback');
        void button.offsetWidth;
        button.classList.add('is-added-feedback');

        const check = document.createElement('span');
        check.className = 'cart-added-check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        button.appendChild(check);

        setTimeout(() => {
            check.remove();
            button.classList.remove('is-added-feedback');
        }, 850);
    }

    function flashTextButton(button) {
        if (!button) {
            return;
        }

        const originalText = button.textContent || '';
        button.classList.remove('is-added-feedback');
        void button.offsetWidth;
        button.classList.add('is-added-feedback');
        button.textContent = 'Added ✓';

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('is-added-feedback');
        }, 900);
    }

    function announceAdded(button) {
        if (button && button.matches(ICON_BUTTON_SELECTORS)) {
            flashIconButton(button);
        } else {
            flashTextButton(button);
        }
        showAddedToast();
    }

    ensureHeaderCountBadges();
    updateHeaderCountBadges();

    globalScope.addEventListener('sidequest:cart-updated', () => {
        updateHeaderCountBadges();
    });

    globalScope.addEventListener('sidequest:cart-add-rejected', (event) => {
        const message = typeof event?.detail?.message === 'string' && event.detail.message.trim() !== ''
            ? event.detail.message.trim()
            : 'This item is not available for your cart yet.';
        showToast(message);
    });

    globalScope.SidequestCartFeedback = {
        announceAdded,
        showAddedToast,
        showToast,
        refreshHeaderCount: updateHeaderCountBadges
    };
})(window);
