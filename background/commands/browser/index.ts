import { bookmarks } from "./bookmarks"
import { clearBrowserData } from "./clearBrowserData"
import { closeCurrentTab } from "./closeCurrentTab"
import { closeCurrentWindow } from "./closeCurrentWindow"
import { closeOtherTabs } from "./closeOtherTabs"
import { closeTabsToLeft } from "./closeTabsToLeft"
import { closeTabsToRight } from "./closeTabsToRight"
import { copyCurrentTabUrl } from "./copyCurrentTabUrl"
import { copyTabUrl } from "./copyTabUrl"
import { downloads } from "./downloads"
import { gotoTab } from "./gotoTab"
import { browsingHistory } from "./history"
import { moveCurrentTabToANewWindow } from "./moveCurrentTabToANewWindow"
import { moveCurrentTabToPopupWindow } from "./moveCurrentTabToPopupWindow"
import { muteCurrentTab } from "./muteCurrentTab"
import { openNewPrivateWindow } from "./openNewPrivateWindow"
import { openNewTab } from "./openNewTab"
import { openNewWindow } from "./openNewWindow"
import { openTabs } from "./openTabs"
import { pinCurrentTab } from "./pinCurrentTab"
import { recentlyClosed } from "./recentlyClosed"
import { reloadCurrentTab } from "./reloadCurrentTab"
import { reopenLastClosedTab } from "./reopenLastClosedTab"
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
  downloads,
  gotoTab,
  browsingHistory,
  moveCurrentTabToANewWindow,
  moveCurrentTabToPopupWindow,
  muteCurrentTab,
  openNewPrivateWindow,
  openNewTab,
  openNewWindow,
  openTabs,
  pinCurrentTab,
  recentlyClosed,
  reloadCurrentTab,
  reopenLastClosedTab,
  unmuteCurrentTab,
  unpinCurrentTab,
]
