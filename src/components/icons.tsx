import {
  Aperture,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowUUpLeft,
  ArrowUUpRight,
  BezierCurve,
  Camera,
  Check,
  Copy,
  DownloadSimple,
  Eye,
  Faders,
  FloppyDisk,
  ImageSquare,
  MagnifyingGlassMinus,
  PaintBrush,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Sparkle,
  SquareSplitHorizontal,
  Sun,
  Swatches,
  Trash,
  VideoCamera,
  X,
  type IconProps,
} from "@phosphor-icons/react";

/** «رزرو»: a calendar with a plus, drawn with round caps and a single ink stroke. */
function BookGlyph({ size = 22, weight = "regular", color = "currentColor", className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke={color} strokeWidth={weight === "fill" ? 2 : 1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
      {...props}>
      <rect x="3.6" y="5.1" width="16.8" height="15.5" rx="3" />
      <path d="M7.9 3v4.2M16.1 3v4.2M3.6 9.5h16.8" />
      <path d="M12 12.2v5.3M9.35 14.85h5.3" />
    </svg>
  );
}

/** The try-on's icons (Phosphor), addressed by what they do. */
const ICONS = {
  book: BookGlyph,
  close: X,
  /** Forward in RTL points left. */
  forward: ArrowLeft,
  back: ArrowRight,
  compare: SquareSplitHorizontal,
  play: Play,
  pause: Pause,
  light: Sun,
  privacy: ShieldCheck,
  trash: Trash,
  rebook: ArrowCounterClockwise,
  copy: Copy,
  check: Check,
  plus: Plus,
  palette: Swatches,
  camera: Camera,
  gallery: ImageSquare,
  magic: Sparkle,
  download: DownloadSimple,
  live: VideoCamera,
  capture: Aperture,
  outline: BezierCurve,
  undo: ArrowUUpLeft,
  redo: ArrowUUpRight,
  zoomOut: MagnifyingGlassMinus,
  /** Her photo without the makeup, while held. */
  peek: Eye,
  /** Fine-tune each part of the face. */
  tune: Faders,
  brush: PaintBrush,
  save: FloppyDisk,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: { name: IconName } & IconProps) {
  const Component = ICONS[name];
  return <Component aria-hidden="true" {...props} />;
}
