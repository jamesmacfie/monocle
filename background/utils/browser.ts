import type { Event } from "../../types";
type BrowserAPIObject = 'tabs' | 'windows' | 'runtime';

// Cross-browser API helpers to handle Chrome vs Firefox differences
export const isFirefox = chrome.runtime.getURL('').startsWith('moz-extension://');

// Generic wrapper to handle API methods that exist in both browsers but with different signatures
export function callBrowserAPI(apiObject: BrowserAPIObject, method: string, ...args: any[]): Promise<any> {
  if (isFirefox) {
    return (browser[apiObject] as any)[method](...args);
  } else {
    return new Promise((resolve, reject) => {
      (chrome[apiObject] as any)[method](...args, (result: any) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }
}

export async function sendTabMessage(tabId: number, message: Event): Promise<any> {
  if (isFirefox) {
    return browser.tabs.sendMessage(tabId, message);
  } else {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
}

export async function queryTabs(queryInfo: any): Promise<any[]> {
  return callBrowserAPI('tabs', 'query', queryInfo);
}

export async function updateTab(tabId: number, updateProperties: any): Promise<any> {
  return callBrowserAPI('tabs', 'update', tabId, updateProperties);
}

export async function createTab(createProperties: any): Promise<any> {
  return callBrowserAPI('tabs', 'create', createProperties);
}

export async function removeTab(tabId: number): Promise<void> {
  return callBrowserAPI('tabs', 'remove', tabId);
}

export async function getTab(tabId: number): Promise<any> {
  return callBrowserAPI('tabs', 'get', tabId);
}

export async function createWindow(createData: any): Promise<any> {
  return callBrowserAPI('windows', 'create', createData);
}

export async function getCurrentWindow(): Promise<any> {
  return callBrowserAPI('windows', 'getCurrent');
}

export async function updateWindow(windowId: number, updateInfo: any): Promise<any> {
  return callBrowserAPI('windows', 'update', windowId, updateInfo);
}

export async function removeWindow(windowId: number): Promise<void> {
  return callBrowserAPI('windows', 'remove', windowId);
}

export async function focusOrGoToUrl(url: string): Promise<void> {
  const tabs = await queryTabs({});
  const tab = tabs.find((tab) => {
    if (!tab.url || !url) {
      return false;
    }
    try {
      const tabUrl = new URL(tab.url);
      const searchUrl = new URL(url);
      return tabUrl.href === searchUrl.href;
    } catch (e) {
      return tab.url === url;
    }
  });

  if (tab) {
    // If the tab is found, go to it
    await updateTab(tab.id, { active: true });
  } else {
    // Update current tab with URL if it exists
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await updateTab(activeTab.id, { url });
    } else {
      // If the tab is not found, create a new tab
      await createTab({ url });
    }
  }
}

