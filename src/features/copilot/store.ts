import { create } from 'zustand';

// Which conversation is open — and only that.
//
// It lives outside the screen because on mobile a Copilot action chip
// *navigates away* ("Open Invoices"), which unmounts the screen. Holding the
// pointer here plus the transcript in React Query is what makes coming back
// resume the thread instead of showing a blank chat. This is a deliberate
// difference from web, where the page always mounts fresh into a new chat —
// correct for a persistent sidebar, wrong for a navigation stack.
//
// The transcript itself is NOT here. React Query owns server data everywhere
// else in this app and it owns it here too.

interface CopilotState {
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  /** Start a fresh thread. Local only — the row appears once a message is sent. */
  newChat: () => void;
}

export const useCopilotStore = create<CopilotState>((set) => ({
  conversationId: null,
  setConversationId: (conversationId) => set({ conversationId }),
  newChat: () => set({ conversationId: null }),
}));
