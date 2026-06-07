import { bookmarks } from "./bookmarks"
import { clearBrowserData } from "./clearBrowserData"
import { closeCurrentTab } from "./closeCurrentTab"
import { closeCurrentWindow } from "./closeCurrentWindow"
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
import { moveCurrentTabToANewWindow } from "./moveCurrentTabToANewWindow"
import { moveCurrentTabToPopupWindow } from "./moveCurrentTabToPopupWindow"
import { moveTabLeft } from "./moveTabLeft"
import { moveTabRight } from "./moveTabRight"
import { muteCurrentTab } from "./muteCurrentTab"
import { openNewPrivateWindow } from "./openNewPrivateWindow"
import { openNewTab } from "./openNewTab"
import { openNewWindow } from "./openNewWindow"
import { openTabs } from "./openTabs"
import { pinCurrentTab } from "./pinCurrentTab"
import { recentlyClosed } from "./recentlyClosed"
import { reloadCurrentTab } from "./reloadCurrentTab"
import { reopenLastClosedTab } from "./reopenLastClosedTab"
import { scrollToBottom } from "./scrollToBottom"
import { scrollToTop } from "./scrollToTop"
import { unmuteCurrentTab } from "./unmuteCurrentTab"
import { unpinCurrentTab } from "./unpinCurrentTab"

export { firefoxCommands } from "./firefox"

export const browserCommands = [
  bookmarks,
  clearBrowserData,
  closeCurrentTab,
  closeCurrentWindow,
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
  moveCurrentTabToANewWindow,
  moveCurrentTabToPopupWindow,
  moveTabLeft,
  moveTabRight,
  muteCurrentTab,
  openNewPrivateWindow,
  openNewTab,
  openNewWindow,
  openTabs,
  pinCurrentTab,
  recentlyClosed,
  reloadCurrentTab,
  reopenLastClosedTab,
  scrollToBottom,
  scrollToTop,
  unmuteCurrentTab,
  unpinCurrentTab,
]
