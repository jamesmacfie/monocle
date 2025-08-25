import type { Command } from '../../types';

export const clearRecentsCommand: Command = {
  id: 'clear-recents',
  name: 'Clear recents',
  description: 'Clear all recently selected commands',
  icon: { name: 'Trash2' },
  doNotAddToRecents: true,
  run: async () => {
    try {
      await browser.storage.local.remove('monocle-commandUsage');

      // Send success notification
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, {
          type: 'monocle-alert',
          level: 'success',
          message: 'Recent commands cleared successfully'
        });
      }
    } catch (error) {
      console.error('Failed to clear recent commands:', error);

      // Send error notification
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, {
          type: 'monocle-alert',
          level: 'error',
          message: 'Failed to clear recent commands'
        });
      }
    }
  }
};
