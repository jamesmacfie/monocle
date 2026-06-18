import { Icon, type Image } from "@raycast/api";
import type { ExternalSuggestion } from "./types";

type SuggestionIconInput = Pick<
  ExternalSuggestion,
  "icon" | "iconType" | "type"
>;
type NormalizedIconInput = {
  icon?: string;
  iconType?: ExternalSuggestion["iconType"];
  type?: ExternalSuggestion["type"];
};

// Monocle emits Lucide names. Raycast shares many names but not all, so exact
// enum matches are resolved dynamically and this table handles the catalog
// names where the two icon sets use different terminology.
const lucideAliases: Record<string, Icon> = {
  Activity: Icon.Gauge,
  Airplay: Icon.Devices,
  AlarmClock: Icon.Alarm,
  AlertCircle: Icon.Warning,
  AlertTriangle: Icon.Warning,
  Archive: Icon.Box,
  ArrowDownAZ: Icon.ArrowDown,
  ArrowDownToLine: Icon.Download,
  ArrowRightSquare: Icon.ArrowRightCircle,
  ArrowUpToLine: Icon.Upload,
  Award: Icon.Trophy,
  BadgeCheck: Icon.CheckRosette,
  BellOff: Icon.BellDisabled,
  BookmarkX: Icon.Bookmark,
  BookOpen: Icon.Book,
  Bot: Icon.ComputerChip,
  Braces: Icon.CodeBlock,
  Brain: Icon.LightBulb,
  Briefcase: Icon.Box,
  Building2: Icon.Building,
  CalendarDays: Icon.Calendar,
  CalendarRange: Icon.Calendar,
  ChartBar: Icon.BarChart,
  ChartColumn: Icon.BarChart,
  ChartLine: Icon.LineChart,
  CircleQuestionMark: Icon.QuestionMarkCircle,
  CircleUser: Icon.PersonCircle,
  ClipboardCheck: Icon.CheckCircle,
  Clock1: Icon.Clock,
  Clock3: Icon.Clock,
  Clock6: Icon.Clock,
  Code2: Icon.Code,
  Command: Icon.CommandSymbol,
  Cookie: Icon.CircleEllipsis,
  Copy: Icon.CopyClipboard,
  CopyPlus: Icon.Duplicate,
  Crosshair: Icon.BullsEye,
  Database: Icon.HardDrive,
  ExternalLink: Icon.ArrowNe,
  EyeOff: Icon.EyeDisabled,
  File: Icon.BlankDocument,
  FileArchive: Icon.Box,
  FileAudio: Icon.Speaker,
  FileCode: Icon.CodeBlock,
  FileImage: Icon.Image,
  FileJson: Icon.CodeBlock,
  FilePlay: Icon.Play,
  FilePlus: Icon.NewDocument,
  FileSearch: Icon.MagnifyingGlass,
  FileText: Icon.BlankDocument,
  FileX: Icon.DeleteDocument,
  FolderOpen: Icon.Folder,
  Fullscreen: Icon.ArrowsExpand,
  Funnel: Icon.Filter,
  Github: Icon.Code,
  Grip: Icon.BulletPoints,
  History: Icon.Clock,
  Inbox: Icon.Tray,
  Infinity: Icon.Repeat,
  Landmark: Icon.Building,
  Laptop: Icon.Desktop,
  LifeBuoy: Icon.Buoy,
  Link2: Icon.Link,
  ListChecks: Icon.CheckList,
  ListTodo: Icon.CheckList,
  LogIn: Icon.ArrowRightCircle,
  LogOut: Icon.Logout,
  Mail: Icon.Envelope,
  MapPin: Icon.Geopin,
  Maximize2: Icon.Maximize,
  Menu: Icon.BulletPoints,
  MessageCircle: Icon.SpeechBubble,
  MessageSquare: Icon.SpeechBubble,
  Mic: Icon.Microphone,
  MoveRight: Icon.ArrowRight,
  Navigation: Icon.Compass,
  Newspaper: Icon.BlankDocument,
  Option: Icon.Switch,
  Package: Icon.Box,
  Palette: Icon.Swatch,
  PanelsTopLeft: Icon.AppWindowSidebarLeft,
  Pen: Icon.Pencil,
  PinOff: Icon.PinDisabled,
  Presentation: Icon.Desktop,
  Printer: Icon.Print,
  Puzzle: Icon.AppWindowGrid2x2,
  QrCode: Icon.BarCode,
  RefreshCw: Icon.ArrowClockwise,
  RotateCcw: Icon.ArrowCounterClockwise,
  RotateCw: Icon.RotateClockwise,
  Save: Icon.SaveDocument,
  Scan: Icon.MagnifyingGlass,
  Search: Icon.MagnifyingGlass,
  Send: Icon.Forward,
  Settings: Icon.Gear,
  Share: Icon.ArrowUp,
  Share2: Icon.Link,
  ShieldAlert: Icon.Warning,
  ShieldX: Icon.Shield,
  ShoppingBag: Icon.Store,
  ShoppingCart: Icon.Cart,
  Sparkles: Icon.Stars,
  SquareArrowOutUpRight: Icon.ArrowNe,
  SquareAsterisk: Icon.Stars,
  SquareX: Icon.Xmark,
  StarOff: Icon.StarDisabled,
  Table: Icon.AppWindowGrid3x3,
  Tags: Icon.Tag,
  TextCursorInput: Icon.TextInput,
  TextSearch: Icon.TextSelection,
  Timer: Icon.Stopwatch,
  Trash2: Icon.Trash,
  User: Icon.Person,
  UserCheck: Icon.PersonCircle,
  UserCog: Icon.Person,
  Users: Icon.TwoPeople,
  Volume2: Icon.SpeakerOn,
  VolumeX: Icon.SpeakerOff,
  WandSparkles: Icon.Wand,
  Workflow: Icon.Repeat,
  Wrench: Icon.WrenchScrewdriver,
  X: Icon.Xmark,
  XCircle: Icon.XMarkCircle,
  XOctagon: Icon.XMarkCircle,
  Zap: Icon.Bolt,
  ZoomIn: Icon.PlusCircle,
  ZoomOut: Icon.MinusCircle,
};

const fallbackByType: Record<ExternalSuggestion["type"], Icon> = {
  action: Icon.Play,
  submit: Icon.CheckCircle,
  group: Icon.Folder,
  search: Icon.MagnifyingGlass,
  display: Icon.Info,
  calculation: Icon.Calculator,
};

const URL_RE = /^https?:\/\//i;
const raycastIcons = Icon as Record<string, Icon | undefined>;

function normalizeLucideName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  if (/^[a-z0-9_-]+$/.test(trimmed)) {
    return trimmed
      .split(/[-_]+/)
      .filter(Boolean)
      .map(
        (segment) =>
          segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
      )
      .join("");
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function raycastIconForLucideName(name: string): Icon | undefined {
  const normalized = normalizeLucideName(name);
  return lucideAliases[normalized] ?? raycastIcons[normalized];
}

// New bridge payloads include `iconType`; legacy payloads are inferred so
// already-installed extension/browser combinations keep rendering sensibly.
export function iconFor(input?: string | SuggestionIconInput): Image.ImageLike {
  const suggestion: NormalizedIconInput | undefined =
    typeof input === "string" ? { icon: input } : input;
  const fallback = suggestion?.type
    ? fallbackByType[suggestion.type]
    : Icon.Circle;

  if (!suggestion?.icon) {
    return fallback;
  }

  const iconType =
    suggestion.iconType ?? (URL_RE.test(suggestion.icon) ? "url" : "lucide");
  if (iconType === "url") {
    return URL_RE.test(suggestion.icon)
      ? { source: suggestion.icon, fallback }
      : fallback;
  }

  return raycastIconForLucideName(suggestion.icon) ?? fallback;
}
