import { createContext, useContext, useEffect, type ReactNode } from 'react';

// The accounting screen scrolls, but a tab sometimes needs an action pinned to
// the bottom (Mapping's "Save mapping"). The screen owns the footer; a tab hands
// it a node while it has one to show, and takes it away on the way out.

export const AccountingFooterContext = createContext<(node: ReactNode) => void>(() => undefined);

/** Shows `node` in the screen's footer for as long as it is non-null and the tab is mounted. */
export function useAccountingFooter(node: ReactNode) {
  const setFooter = useContext(AccountingFooterContext);
  useEffect(() => {
    setFooter(node);
    return () => setFooter(null);
  }, [node, setFooter]);
}
