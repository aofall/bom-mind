import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const KEY = 'bom-mind:details-expanded:v1';
const SMALL_SCREEN = '(max-width: 1024px)';
function subscribe(listener: () => void) {
  const media = window.matchMedia(SMALL_SCREEN);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function readExpanded() {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}
function rememberExpanded(expanded: boolean) {
  try {
    localStorage.setItem(KEY, String(expanded));
  } catch {
    // The panel remains usable when local preference storage is unavailable.
  }
}

export function useNodeDetails() {
  const isDesktop = useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(SMALL_SCREEN).matches,
    () => true,
  );
  const [desktopExpanded, setDesktopExpanded] = useState(readExpanded);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [isDesktop]);
  const open = useCallback(() => {
    if (isDesktop) {
      setDesktopExpanded(true);
    } else {
      setDrawerOpen(true);
    }
  }, [isDesktop]);
  const close = useCallback(() => {
    if (isDesktop) {
      setDesktopExpanded(false);
      rememberExpanded(false);
    } else {
      setDrawerOpen(false);
    }
  }, [isDesktop]);
  const toggle = useCallback(() => {
    if (isDesktop) {
      const expanded = !desktopExpanded;
      setDesktopExpanded(expanded);
      rememberExpanded(expanded);
    } else {
      setDrawerOpen((previous) => !previous);
    }
  }, [isDesktop, desktopExpanded]);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  return {
    isDesktop,
    expanded: isDesktop ? desktopExpanded : drawerOpen,
    collapsed: isDesktop && !desktopExpanded,
    open,
    close,
    toggle,
    closeDrawer,
  };
}
