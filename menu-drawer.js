(function initializeMenuDrawer(globalScope) {
    const menuButtons = Array.from(document.querySelectorAll('.header-menu-button'));
    if (menuButtons.length === 0) {
        return;
    }
    const PRODUCTS_JSON_PATH = 'product%20json/products.json';
    const NEW_BADGE_MAX_AGE_DAYS = 30;

    const overlay = document.createElement('div');
    overlay.className = 'menu-drawer-overlay';
    overlay.hidden = true;

    const drawer = document.createElement('aside');
    drawer.className = 'menu-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', 'Site menu');

    drawer.innerHTML = `
        <div class="menu-drawer-header">
            <h2>Menu</h2>
            <button class="menu-drawer-close" type="button" aria-label="Close menu drawer">&times;</button>
        </div>
        <div class="menu-drawer-body">
            <nav class="menu-links" aria-label="Main menu">
                <a class="menu-link" href="index.html">Home</a>
                <a class="menu-link" href="catalogue.html">Shop All</a>
                <div class="menu-expandable">
                    <button
                        class="menu-expand-trigger"
                        type="button"
                        aria-expanded="false"
                        aria-controls="menu-categories"
                    >
                        <span>Shop By Category</span>
                        <span class="menu-expand-indicator" aria-hidden="true">+</span>
                    </button>
                    <div id="menu-categories" class="menu-submenu" hidden>
                        <a class="menu-submenu-link menu-submenu-link-new" href="catalogue.html?filter=new">New Arrivals</a>
                        <a class="menu-submenu-link menu-submenu-link-sale" href="catalogue.html?filter=sale">On Sale</a>
                        <a class="menu-submenu-link menu-submenu-link-trending" href="catalogue.html?filter=popular">Trending</a>
                        <a class="menu-submenu-link" href="catalogue.html?browse=keychains">Keychains</a>
                        <a class="menu-submenu-link" href="catalogue.html?browse=lighter-sleeves">Lighter Sleeves</a>
                        <a class="menu-submenu-link" href="catalogue.html?browse=custom-orders">Custom Orders</a>
                    </div>
                </div>
            </nav>
            <p class="menu-contact">Contact: <a href="mailto:sidequestsupply@yahoo.com">sidequestsupply@yahoo.com</a></p>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    const closeButton = drawer.querySelector('.menu-drawer-close');
    const expandTrigger = drawer.querySelector('.menu-expand-trigger');
    const expandIndicator = drawer.querySelector('.menu-expand-indicator');
    const submenu = drawer.querySelector('#menu-categories');
    const newArrivalsLink = drawer.querySelector('.menu-submenu-link-new');
    const onSaleLink = drawer.querySelector('.menu-submenu-link-sale');
    const trendingLink = drawer.querySelector('.menu-submenu-link-trending');
    let menuProducts = [];
    if (trendingLink) {
        trendingLink.hidden = true;
    }

    function toValidNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string' && value.trim() !== '') {
            const cleaned = value.replace(/[$,\s]/g, '');
            const parsed = Number.parseFloat(cleaned);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        return null;
    }

    function parseCreatedAtDate(createdAtValue) {
        if (typeof createdAtValue !== 'string' || createdAtValue.trim() === '') {
            return null;
        }

        const trimmed = createdAtValue.trim();
        const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
            ? `${trimmed}T00:00:00`
            : trimmed;
        const parsedDate = new Date(normalized);
        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
    }

    function isNewProduct(product) {
        const createdAtDate = parseCreatedAtDate(product?.created_at_yyyy_mm_dd);
        if (!createdAtDate) {
            return false;
        }

        const ageMs = Date.now() - createdAtDate.getTime();
        if (ageMs < 0) {
            return false;
        }

        const ageDays = ageMs / (24 * 60 * 60 * 1000);
        return ageDays <= NEW_BADGE_MAX_AGE_DAYS;
    }

    function isSaleProduct(product) {
        const price = toValidNumber(product?.price);
        const compareAt = toValidNumber(product?.compare_at);
        return (
            typeof price === 'number' &&
            typeof compareAt === 'number' &&
            compareAt > price
        );
    }

    function getPopularProductIds(products) {
        const analytics = globalScope.SidequestAnalytics;
        if (!analytics || typeof analytics.getTopProductIdsByScore !== 'function') {
            return [];
        }

        const knownProductIds = new Set(
            products
                .map((product) => (typeof product?.id === 'string' ? product.id.trim() : ''))
                .filter(Boolean)
        );

        return analytics.getTopProductIdsByScore(3)
            .map((productId) => (typeof productId === 'string' ? productId.trim() : ''))
            .filter((productId) => productId !== '' && knownProductIds.has(productId));
    }

    function isManuallyPopularProduct(product) {
        return product?.popular === true;
    }

    function setLinkVisibility(link, isVisible) {
        if (!link) {
            return;
        }
        link.hidden = !isVisible;
    }

    function updateBadgeLinkVisibility() {
        if (!Array.isArray(menuProducts)) {
            return;
        }

        if (menuProducts.length === 0) {
            setLinkVisibility(newArrivalsLink, false);
            setLinkVisibility(onSaleLink, false);
            setLinkVisibility(trendingLink, false);
            return;
        }

        const hasNewProducts = menuProducts.some((product) => isNewProduct(product));
        const hasSaleProducts = menuProducts.some((product) => isSaleProduct(product));
        const hasPopularProducts = menuProducts.some((product) => isManuallyPopularProduct(product))
            || getPopularProductIds(menuProducts).length > 0;

        setLinkVisibility(newArrivalsLink, hasNewProducts);
        setLinkVisibility(onSaleLink, hasSaleProducts);
        setLinkVisibility(trendingLink, hasPopularProducts);
    }

    async function loadProductsForMenu() {
        try {
            const response = await fetch(PRODUCTS_JSON_PATH);
            if (!response.ok) {
                setLinkVisibility(trendingLink, false);
                return;
            }

            const payload = await response.json();
            if (!Array.isArray(payload)) {
                setLinkVisibility(trendingLink, false);
                return;
            }

            menuProducts = payload;
            updateBadgeLinkVisibility();
        } catch (error) {
            setLinkVisibility(trendingLink, false);
        }
    }

    if (submenu) {
        submenu.hidden = true;
    }
    loadProductsForMenu();

    globalScope.addEventListener('sidequest:scores-updated', () => {
        updateBadgeLinkVisibility();
    });

    function openMenuDrawer() {
        document.body.classList.add('menu-drawer-open');
        drawer.setAttribute('aria-hidden', 'false');
        overlay.hidden = false;
    }

    function closeMenuDrawer() {
        document.body.classList.remove('menu-drawer-open');
        drawer.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;
    }

    function toggleSubmenu() {
        const isExpanded = expandTrigger.getAttribute('aria-expanded') === 'true';
        const nextExpanded = !isExpanded;
        expandTrigger.setAttribute('aria-expanded', String(nextExpanded));
        if (submenu) {
            submenu.hidden = !nextExpanded;
        }
        if (expandIndicator) {
            expandIndicator.textContent = nextExpanded ? '-' : '+';
        }
    }

    menuButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            openMenuDrawer();
        });
    });

    if (closeButton) {
        closeButton.addEventListener('click', closeMenuDrawer);
    }

    overlay.addEventListener('click', closeMenuDrawer);

    drawer.addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (link) {
            closeMenuDrawer();
        }
    });

    if (expandTrigger) {
        expandTrigger.addEventListener('click', toggleSubmenu);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('menu-drawer-open')) {
            closeMenuDrawer();
        }
    });
})(window);
