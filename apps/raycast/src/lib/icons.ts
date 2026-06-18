import { Icon, type Image } from "@raycast/api";

// Starter map of the Lucide icon names Monocle emits → Raycast Icon. Raycast's
// Icon enum has 600+ members; rather than map them all, seed the names that
// actually appear and fall back to Icon.Circle. Extend on observed misses.
const lucideToRaycast: Record<string, Icon> = {
  copy: Icon.CopyClipboard,
  clipboard: Icon.Clipboard,
  bookmark: Icon.Bookmark,
  history: Icon.Clock,
  clock: Icon.Clock,
  search: Icon.MagnifyingGlass,
  x: Icon.Xmark,
  trash: Icon.Trash,
  settings: Icon.Gear,
  star: Icon.Star,
  globe: Icon.Globe,
  link: Icon.Link,
  "external-link": Icon.ArrowNe,
  download: Icon.Download,
  "refresh-cw": Icon.ArrowClockwise,
  folder: Icon.Folder,
  window: Icon.Window,
  layers: Icon.AppWindowGrid3x3,
  calculator: Icon.Calculator,
  plus: Icon.Plus,
  pencil: Icon.Pencil,
  eye: Icon.Eye,
  "eye-off": Icon.EyeDisabled,
  pin: Icon.Pin,
  volume: Icon.SpeakerOn,
  "volume-x": Icon.SpeakerOff,
  tag: Icon.Tag,
  code: Icon.Code,
  terminal: Icon.Terminal,
  image: Icon.Image,
  type: Icon.Text,
};

const URL_RE = /^https?:\/\//;

// `icon` is either a Lucide NAME or an http(s) URL (SVGs are dropped on the
// extension side). Unknown name → a neutral dot, never an error.
export function iconFor(icon?: string): Image.ImageLike {
  if (!icon) return Icon.Circle;
  if (URL_RE.test(icon)) return { source: icon };
  return lucideToRaycast[icon] ?? Icon.Circle;
}
