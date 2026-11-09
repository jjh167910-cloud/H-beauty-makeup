import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  CalendarPlus,
  CaretLeft,
  CaretUp,
  ChatCircleDots,
  Check,
  Clock,
  Copy,
  Crown,
  Diamond,
  DownloadSimple,
  FlowerLotus,
  HairDryer,
  HandPalm,
  Heart,
  House,
  IconContext,
  Info,
  MagnifyingGlass,
  MapPin,
  Monitor,
  Moon,
  NavigationArrow,
  PaintBrush,
  Palette,
  PaperPlaneTilt,
  Phone,
  Play,
  Plus,
  Scissors,
  ShareNetwork,
  ShieldCheck,
  Sparkle,
  SquareSplitHorizontal,
  SquaresFour,
  Sun,
  Swatches,
  Trash,
  User,
  UserFocus,
  Wallet,
  WhatsappLogo,
  X,
  type IconProps,
  type IconWeight,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";


type SalonNavIcon = "home" | "services" | "looks" | "bookings" | "book";

/** Coordinated 24px salon navigation pictograms: round caps, single ink stroke, no badges. */
function SalonGlyph({ kind, size = 22, weight = "regular", color = "currentColor", className, ...props }:
  { kind: SalonNavIcon } & IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color} strokeWidth={weight === "fill" ? 2 : 1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
      {...props}>
      {kind === "home" ? <>
        <path d="m3.5 10 8.5-6.6 8.5 6.6v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
        <path d="M9.2 20.8v-7.2h5.6v7.2" />
        <path d="M16.6 4.8v2.3" />
      </> : null}
      {kind === "services" ? <>
        <circle cx="6" cy="18.1" r="2.05" /><circle cx="18" cy="18.1" r="2.05" />
        <path d="M7.5 16.65 18.2 4.5M16.5 16.65 5.8 4.5" />
        <path d="m12 10.9 2.2 2.55" />
      </> : null}
      {kind === "looks" ? <>
        <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4" />
        <path d="M7.7 16.9c.25-2.9 2-4.3 4.3-4.3s4.05 1.4 4.3 4.3" />
        <path d="M9.1 9.75a2.9 2.9 0 0 1 5.8 0c0 1.6-1.3 2.9-2.9 2.9s-2.9-1.3-2.9-2.9Z" />
      </> : null}
      {kind === "bookings" || kind === "book" ? <>
        <rect x="3.6" y="5.1" width="16.8" height="15.5" rx="3" />
        <path d="M7.9 3v4.2M16.1 3v4.2M3.6 9.5h16.8" />
        {kind === "book" ? <path d="M12 12.2v5.3M9.35 14.85h5.3" /> : <path d="m8.9 14.8 2.25 2.2 4.2-4.4" />}
      </> : null}
    </svg>
  );
}

/**
 * Icon system — one curated Phosphor set addressed by semantic name.
 * Default weight is "light" to match the light typographic voice; active and
 * selected states switch to "fill", feature tiles use "duotone".
 */
const ICONS = {
  home: House,
  services: Sparkle,
  looks: SquaresFour,
  bookings: CalendarBlank,
  book: CalendarPlus,
  booked: CalendarCheck,
  profile: User,
  heart: Heart,
  search: MagnifyingGlass,
  close: X,
  /** Forward in RTL points left. */
  forward: ArrowLeft,
  back: ArrowRight,
  chevron: CaretLeft,
  up: CaretUp,
  compare: SquareSplitHorizontal,
  share: ShareNetwork,
  download: DownloadSimple,
  info: Info,
  play: Play,
  clock: Clock,
  pin: MapPin,
  directions: NavigationArrow,
  phone: Phone,
  finder: UserFocus,
  consult: ChatCircleDots,
  light: Sun,
  dark: Moon,
  auto: Monitor,
  privacy: ShieldCheck,
  trash: Trash,
  rebook: ArrowCounterClockwise,
  send: PaperPlaneTilt,
  copy: Copy,
  check: Check,
  plus: Plus,
  price: Wallet,
  diamond: Diamond,
  whatsapp: WhatsappLogo,
  palette: Swatches,
  /* Service categories */
  cut: Scissors,
  color: Palette,
  care: FlowerLotus,
  styling: HairDryer,
  bridal: Crown,
  beauty: PaintBrush,
  nails: HandPalm,
} as const;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export function Icon({ name, ...props }: { name: IconName } & IconProps) {
  if (name === "home" || name === "services" || name === "looks" || name === "bookings" || name === "book") {
    return <SalonGlyph kind={name} {...props} />;
  }
  const Component = ICONS[name];
  return <Component aria-hidden="true" {...props} />;
}

export function IconProvider({ children }: { children: ReactNode }) {
  return <IconContext.Provider value={{ size: 22, weight: "regular", mirrored: false }}>{children}</IconContext.Provider>;
}

export type { IconWeight };
