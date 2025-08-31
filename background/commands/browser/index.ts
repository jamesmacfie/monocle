import { testChildren } from "../testChildren"
import { bookmarks } from "./bookmarks"
import { closeCurrentTab } from "./closeCurrentTab"
import { closeCurrentWindow } from "./closeCurrentWindow"
import { closeOtherTabs } from "./closeOtherTabs"
import { closeTabsToLeft } from "./closeTabsToLeft"
import { closeTabsToRight } from "./closeTabsToRight"
import { copyCurrentTabUrl } from "./copyCurrentTabUrl"
import { copyTabUrl } from "./copyTabUrl"
import { gotoTab } from "./gotoTab"
import { moveCurrentTabToANewWindow } from "./moveCurrentTabToANewWindow"
import { moveCurrentTabToPopupWindow } from "./moveCurrentTabToPopupWindow"
import { muteCurrentTab } from "./muteCurrentTab"
import { openNewPrivateWindow } from "./openNewPrivateWindow"
import { openNewTab } from "./openNewTab"
import { openNewWindow } from "./openNewWindow"
import { openTabs } from "./openTabs"
import { pinCurrentTab } from "./pinCurrentTab"
import { reloadCurrentTab } from "./reloadCurrentTab"
import { unmuteCurrentTab } from "./unmuteCurrentTab"
import { unpinCurrentTab } from "./unpinCurrentTab"

export { firefoxCommands } from "./firefox"

export const browserCommands = [
  bookmarks,
  closeCurrentTab,
  closeCurrentWindow,
  closeOtherTabs,
  closeTabsToLeft,
  closeTabsToRight,
  copyCurrentTabUrl,
  copyTabUrl,
  gotoTab,
  moveCurrentTabToANewWindow,
  moveCurrentTabToPopupWindow,
  muteCurrentTab,
  openNewPrivateWindow,
  openNewTab,
  openNewWindow,
  openTabs,
  pinCurrentTab,
  reloadCurrentTab,
  unmuteCurrentTab,
  unpinCurrentTab,
  testChildren,
]
