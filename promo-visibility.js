const CATALOGUE_SETTINGS_PATH = 'product%20json/catalogue-settings.json';

function normalizeRuleIds(value) {
    if (!Array.isArray(value)) {
        return null;
    }

    return new Set(
        value
            .filter((ruleId) => typeof ruleId === 'string' && ruleId.trim() !== '')
            .map((ruleId) => ruleId.trim())
    );
}

async function loadPromoSettings() {
    try {
        const response = await fetch(CATALOGUE_SETTINGS_PATH);
        if (!response.ok) {
            throw new Error(`Failed to load catalogue settings (${response.status})`);
        }

        const settings = await response.json();
        return {
            promosEnabled: settings?.promos_enabled === true,
            enabledPromoRuleIds: normalizeRuleIds(settings?.enabled_promo_rules)
        };
    } catch (error) {
        return {
            promosEnabled: false,
            enabledPromoRuleIds: new Set()
        };
    }
}

function isPromoRuleVisible(ruleId, settings) {
    if (!settings.promosEnabled) {
        return false;
    }

    if (settings.enabledPromoRuleIds === null) {
        return true;
    }

    return settings.enabledPromoRuleIds.has(ruleId);
}

function hasVisiblePromoRules(settings) {
    return settings.promosEnabled
        && (settings.enabledPromoRuleIds === null || settings.enabledPromoRuleIds.size > 0);
}

function applyPromoVisibility(settings) {
    const hasVisiblePromos = hasVisiblePromoRules(settings);

    document.querySelectorAll('[data-promo-ticker-on]').forEach((element) => {
        element.hidden = !hasVisiblePromos;
    });

    document.querySelectorAll('[data-promo-ticker-off]').forEach((element) => {
        element.hidden = hasVisiblePromos;
    });

    document.querySelectorAll('[data-promo-section]').forEach((element) => {
        const promoRule = typeof element.dataset.promoRule === 'string'
            ? element.dataset.promoRule.trim()
            : '';
        element.hidden = promoRule
            ? !isPromoRuleVisible(promoRule, settings)
            : !hasVisiblePromos;
    });

    document.querySelectorAll('.deals-grid').forEach((element) => {
        const hasVisiblePromoSection = Boolean(element.querySelector('[data-promo-section]:not([hidden])'));
        element.classList.toggle('promos-hidden', !hasVisiblePromoSection);
    });
}

loadPromoSettings().then((settings) => {
    applyPromoVisibility(settings);
});
