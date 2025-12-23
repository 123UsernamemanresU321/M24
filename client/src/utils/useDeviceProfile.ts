import { useState, useEffect } from 'react';

export type DeviceProfile = {
    isSmallScreen: boolean;
    isTouch: boolean;
    isMobileUI: boolean;
    prefersReducedMotion: boolean;
};

function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const mediaQuery = window.matchMedia(query);
        const handler = (event: MediaQueryListEvent) => setMatches(event.matches);

        // Set initial value
        setMatches(mediaQuery.matches);

        // Listen for changes
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, [query]);

    return matches;
}

export function useDeviceProfile(): DeviceProfile {
    const isSmallScreen = useMediaQuery('(max-width: 767px)');
    const isTouch = useMediaQuery('(pointer: coarse)');
    const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

    // isMobileUI is the combination of small screen AND touch
    const isMobileUI = isSmallScreen && isTouch;

    return {
        isSmallScreen,
        isTouch,
        isMobileUI,
        prefersReducedMotion
    };
}

export default useDeviceProfile;
