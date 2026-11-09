import { createContext, useContext, useId, useState, type ButtonHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/cn";
import { photoObjectPosition } from "@/data/photo-focal";
import type { Tab } from "@/lib/salon-store";
import { Icon, type IconName } from "./icons";

export type SheetState =
  | { kind: "look"; id: number }
  | { kind: "discover"; id: number }
  | { kind: "service"; id: string }
  | { kind: "makeup"; id: string }
  | { kind: "nail"; id: string }
  | { kind: "booking" }
  | { kind: "compare" }
  | { kind: "consult" }
  | { kind: "finder" }
  | null;

/** `services` replaces the cart (rebooking); `service` adds one service to it. */
export type BookingIntent = { service?: string; services?: string[]; stylist?: string; lookId?: number; makeupId?: string; nailStyleId?: string; note?: string };

export type SalonActions = {
  go: (tab: Tab) => void;
  openSheet: (sheet: Exclude<SheetState, null>) => void;
  openBooking: (intent?: BookingIntent) => void;
  /** Opens the immersive feed; pass the tapped image to morph it into place. */
  openDiscover: (id: number, from?: HTMLElement | null) => void;
  closeSheet: () => void;
};

const SalonContext = createContext<SalonActions | null>(null);

export function SalonProvider({ value, children }: { value: SalonActions; children: ReactNode }) {
  return <SalonContext.Provider value={value}>{children}</SalonContext.Provider>;
}

export function useSalonActions() {
  const value = useContext(SalonContext);
  if (!value) throw new Error("Salon actions missing");
  return value;
}

/** Light haptic tick on devices that support it. */
export function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* unsupported */
  }
}

/* ---------- Buttons ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "secondary" | "tonal" | "ghost" | "glass" | "light";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: IconName;
  /** Trailing circular arrow — the signature CTA. */
  orb?: boolean;
};

export function Button({ variant = "primary", size = "md", block, icon, orb, className, type = "button", children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn("btn", className)}
      data-variant={variant === "primary" ? undefined : variant}
      data-size={size === "md" ? undefined : size}
      data-block={block ? "" : undefined}
      {...props}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} weight="regular" /> : null}
      {children}
      {orb ? (
        <span className="btn__orb">
          <Icon name="forward" size={16} weight="regular" />
        </span>
      ) : null}
    </button>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  label: string;
  variant?: "outline" | "tonal" | "solid" | "glass" | "glass-dark";
  size?: "sm" | "md" | "lg";
  pressed?: boolean;
  /** Pressed state uses the rose "love" colour. */
  love?: boolean;
};

export function IconButton({ icon, label, variant = "outline", size = "md", pressed, love, className, type = "button", ...props }: IconButtonProps) {
  const px = size === "sm" ? 17 : size === "lg" ? 24 : 20;
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      data-variant={variant === "outline" ? undefined : variant}
      data-size={size === "md" ? undefined : size}
      data-love={love ? "" : undefined}
      className={cn("icon-btn", className)}
      {...props}
    >
      <Icon name={icon} size={px} weight={pressed ? "fill" : "light"} />
    </button>
  );
}

export function Chip({ active, className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button type={type} aria-pressed={active} className={cn("chip", className)} {...props} />;
}

export function TextLink({ className, type = "button", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cn("link", className)} {...props}>
      {children}
      <Icon name="chevron" size={14} weight="regular" />
    </button>
  );
}

/* ---------- Typography blocks ---------- */

/** Screen header: eyebrow, light display title with an optional calligraphic accent line. */
export function PageHead({ eyebrow, title, accent, lead, action }: { eyebrow?: string; title: string; accent?: string; lead?: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      {eyebrow ? <p className="t-eyebrow enter">{eyebrow}</p> : null}
      <div className="flex items-end justify-between gap-4">
        <h1 className="t-display enter mt-1" style={{ animationDelay: "60ms" }}>
          {title}
          {accent ? (
            <>
              <br />
              <span className="t-calligraphy text-[0.92em] text-gold-ink">{accent}</span>
            </>
          ) : null}
        </h1>
        {action}
      </div>
      {lead ? <p className="t-callout enter mt-2 max-w-[22rem] text-ink-2" style={{ animationDelay: "120ms" }}>{lead}</p> : null}
    </header>
  );
}

export function SectionHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow ? <p className="t-eyebrow">{eyebrow}</p> : null}
        <h2 className="t-title-2 mt-0.5">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cn("ornament", className)} aria-hidden="true">
      <i />
    </div>
  );
}

/** Circular engraved seal with rotating Latin text. */
export function Seal({ text, className, children }: { text: string; className?: string; children?: ReactNode }) {
  const id = `seal${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span className={cn("seal", className)} aria-hidden="true">
      <svg viewBox="0 0 100 100" direction="ltr">
        <defs>
          <path id={id} d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
        </defs>
        <text>
          <textPath href={`#${id}`}>{text}</textPath>
        </text>
      </svg>
      <span className="seal__core">{children}</span>
    </span>
  );
}

/* ---------- Media & identity ---------- */

/** Photos never shimmer forever: a real fallback appears if an image cannot load.
 * The state is keyed by the current src so recycled cards cannot show stale imagery.
 */
export function Media({ className, alt = "", onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [result, setResult] = useState<{ src: string | undefined; status: "loading" | "loaded" | "error" }>({
    src: props.src, status: "loading",
  });
  const status = result.src === props.src ? result.status : "loading";
  return (
    <span className={cn("media block", className)} data-loaded={status === "loaded" ? "" : undefined}
      data-error={status === "error" ? "" : undefined}>
      <img
        alt={alt}
        decoding="async"
        onLoad={(event) => {
          setResult({ src: props.src, status: "loaded" });
          onLoad?.(event);
        }}
        onError={(event) => {
          setResult({ src: props.src, status: "error" });
          onError?.(event);
        }}
        {...props}
        style={{ objectPosition: photoObjectPosition(props.src), ...props.style }}
      />
      {status === "error" ? <span className="media__error" aria-hidden="true">تصویر در دسترس نیست</span> : null}
    </span>
  );
}

export function Avatar({ name, tone, className, arch }: { name: string; tone: string; className?: string; arch?: boolean }) {
  return (
    <span className={cn("avatar bg-gradient-to-b", tone, className)} data-shape={arch ? "arch" : undefined}>
      <span className="relative">{name.slice(0, 1)}</span>
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={26} />
      </span>
      <p className="t-title-3">{title}</p>
      <p className="t-callout max-w-xs text-ink-2">{text}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ---------- Sheet ---------- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  full,
  leading,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  leading?: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content className="sheet" data-full={full ? "" : undefined} aria-describedby={undefined}>
          <div className="sheet__handle" aria-hidden="true" />
          <div className="sheet__head">
            <div className="flex min-w-0 items-center gap-2">
              {leading}
              <Drawer.Title className="t-headline truncate">{title}</Drawer.Title>
            </div>
            <Drawer.Close asChild>
              <IconButton icon="close" label="بستن" size="sm" />
            </Drawer.Close>
          </div>
          <div className="sheet__body">{children}</div>
          {footer ? <div className="sheet__foot">{footer}</div> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
