/** @type {import('tailwindcss').Config} */
function withOpacity(cssVariable) {
    return ({ opacityValue }) => {
        if (opacityValue !== undefined) {
            return `rgb(var(${cssVariable}) / ${opacityValue})`;
        }
        return `rgb(var(${cssVariable}))`;
    };
}

export default {
    darkMode: "class",
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Primary
                "primary": withOpacity('--primary'),
                "on-primary": withOpacity('--on-primary'),
                "primary-container": withOpacity('--primary-container'),
                "on-primary-container": withOpacity('--on-primary-container'),
                "primary-dim": withOpacity('--primary-dim'),
                "primary-fixed": withOpacity('--primary-fixed'),
                "primary-fixed-dim": withOpacity('--primary-fixed-dim'),
                "on-primary-fixed": withOpacity('--on-primary-fixed'),
                "on-primary-fixed-variant": withOpacity('--on-primary-fixed-variant'),

                // Secondary
                "secondary": withOpacity('--secondary'),
                "on-secondary": withOpacity('--on-secondary'),
                "secondary-container": withOpacity('--secondary-container'),
                "on-secondary-container": withOpacity('--on-secondary-container'),
                "secondary-dim": withOpacity('--secondary-dim'),
                "secondary-fixed": withOpacity('--secondary-fixed'),
                "secondary-fixed-dim": withOpacity('--secondary-fixed-dim'),
                "on-secondary-fixed": withOpacity('--on-secondary-fixed'),
                "on-secondary-fixed-variant": withOpacity('--on-secondary-fixed-variant'),

                // Tertiary
                "tertiary": withOpacity('--tertiary'),
                "on-tertiary": withOpacity('--on-tertiary'),
                "tertiary-container": withOpacity('--tertiary-container'),
                "on-tertiary-container": withOpacity('--on-tertiary-container'),
                "tertiary-dim": withOpacity('--tertiary-dim'),
                "tertiary-fixed": withOpacity('--tertiary-fixed'),
                "tertiary-fixed-dim": withOpacity('--tertiary-fixed-dim'),
                "on-tertiary-fixed": withOpacity('--on-tertiary-fixed'),
                "on-tertiary-fixed-variant": withOpacity('--on-tertiary-fixed-variant'),

                // Surface & Background
                "surface": withOpacity('--surface'),
                "on-surface": withOpacity('--on-surface'),
                "surface-variant": withOpacity('--surface-variant'),
                "on-surface-variant": withOpacity('--on-surface-variant'),
                "surface-dim": withOpacity('--surface-dim'),
                "surface-bright": withOpacity('--surface-bright'),
                "surface-tint": withOpacity('--surface-tint'),

                "surface-container-lowest": withOpacity('--surface-container-lowest'),
                "surface-container-low": withOpacity('--surface-container-low'),
                "surface-container": withOpacity('--surface-container'),
                "surface-container-high": withOpacity('--surface-container-high'),
                "surface-container-highest": withOpacity('--surface-container-highest'),

                "background": withOpacity('--background'),
                "on-background": withOpacity('--on-background'),

                "inverse-surface": withOpacity('--inverse-surface'),
                "inverse-on-surface": withOpacity('--inverse-on-surface'),
                "inverse-primary": withOpacity('--inverse-primary'),

                // Outline
                "outline": withOpacity('--outline'),
                "outline-variant": withOpacity('--outline-variant'),

                // Error
                "error": withOpacity('--error'),
                "on-error": withOpacity('--on-error'),
                "error-container": withOpacity('--error-container'),
                "on-error-container": withOpacity('--on-error-container'),
                "error-dim": withOpacity('--error-dim'),

                // Legacy & Utilities
                "success": withOpacity('--success'),
                "warning": withOpacity('--warning'),
                "danger": withOpacity('--danger'),
            },
            fontFamily: {
                "headline": ["Manrope", "sans-serif"],
                "body": ["Inter", "sans-serif"],
                "label": ["Inter", "sans-serif"]
            },
            borderRadius: { "DEFAULT": "0.25rem", "lg": "1rem", "xl": "1.5rem", "full": "9999px" },
        },
    },
    plugins: [
        require('@tailwindcss/container-queries'),
        require('@tailwindcss/forms'),
    ],
};
