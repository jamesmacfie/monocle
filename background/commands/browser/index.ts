import { addBookmark, bookmarks } from "./bookmarks"
import { captureScreenshot } from "./captureScreenshot"
import { clearBrowserData } from "./clearBrowserData"
import { closeCurrentTab } from "./closeCurrentTab"
import { closeCurrentWindow } from "./closeCurrentWindow"
import { closeDuplicateTabs } from "./closeDuplicateTabs"
import { closeOtherTabs } from "./closeOtherTabs"
import { closeTabsToLeft } from "./closeTabsToLeft"
import { closeTabsToRight } from "./closeTabsToRight"
import { copyCurrentTabUrl } from "./copyCurrentTabUrl"
import { copyTabUrl } from "./copyTabUrl"
import { copyTitleAndUrlAsMarkdown } from "./copyTitleAndUrlAsMarkdown"
import { downloads } from "./downloads"
import { duplicateCurrentTab } from "./duplicateCurrentTab"
import { goBackCommand } from "./goBack"
import { goForwardCommand } from "./goForward"
import { gotoTab } from "./gotoTab"
import { browsingHistory } from "./history"
import { internalPages } from "./internalPages"
import { moveCurrentTabToANewWindow } from "./moveCurrentTabToANewWindow"
import { moveCurrentTabToPopupWindow } from "./moveCurrentTabToPopupWindow"
import { moveTabLeft } from "./moveTabLeft"
import { moveTabRight } from "./moveTabRight"
import { openNewPrivateWindow } from "./openNewPrivateWindow"
import { openNewTab } from "./openNewTab"
import { openNewWindow } from "./openNewWindow"
import { openTabs } from "./openTabs"
import { recentlyClosed } from "./recentlyClosed"
import { reloadCurrentTab } from "./reloadCurrentTab"
import { reopenLastClosedTab } from "./reopenLastClosedTab"
import { scrollToBottom } from "./scrollToBottom"
import { scrollToTop } from "./scrollToTop"
import { toggleMuteCurrentTab } from "./toggleMuteCurrentTab"
import { togglePinCurrentTab } from "./togglePinCurrentTab"

export { firefoxCommands } from "./firefox"

export const browserCommands = [
  addBookmark,
  bookmarks,
  captureScreenshot,
  clearBrowserData,
  closeCurrentTab,
  closeCurrentWindow,
  closeDuplicateTabs,
  closeOtherTabs,
  closeTabsToLeft,
  closeTabsToRight,
  copyCurrentTabUrl,
  copyTabUrl,
  copyTitleAndUrlAsMarkdown,
  downloads,
  duplicateCurrentTab,
  goBackCommand,
  goForwardCommand,
  gotoTab,
  browsingHistory,
  internalPages,
  moveCurrentTabToANewWindow,
  moveCurrentTabToPopupWindow,
  moveTabLeft,
  moveTabRight,
  openNewPrivateWindow,
  openNewTab,
  openNewWindow,
  openTabs,
  recentlyClosed,
  reloadCurrentTab,
  reopenLastClosedTab,
  scrollToBottom,
  scrollToTop,
  toggleMuteCurrentTab,
  togglePinCurrentTab,
]
