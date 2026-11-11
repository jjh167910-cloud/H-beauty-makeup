import { useState, type ButtonHTMLAttributes, type ImgHTMLAttributes } from "react";
import { Icon, type IconName } from "./icons";

/** Light haptic tick on devices that support it. */
export function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* unsupported */
  }
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "secondary" | "tonal" | "ghost" | "light";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  icon?: IconName;
};

export function Button({ variant = "primary", size = "md", block, icon, className, type = "button", children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={className ? `btn ${className}` : "btn"}
      data-variant={variant === "primary" ? undefined : variant}
      data-size={size === "md" ? undefined : size}
      data-block={block ? "" : undefined}
      {...props}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} weight="regular" /> : null}
      {children}
    </button>
  );
}

/** Photos never shimmer forever: a real fallback appears if an image cannot load.
 * The state is keyed by the current src so a reused image cannot show a stale picture.
 */
export function Media({ className, alt = "", onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [result, setResult] = useState<{ src: string | undefined; status: "loading" | "loaded" | "error" }>({
    src: props.src, status: "loading",
  });
  const status = result.src === props.src ? result.status : "loading";
  return (
    <span className={className ? `media block ${className}` : "media block"} data-loaded={status === "loaded" ? "" : undefined}
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
      />
      {status === "error" ? <span className="media__error" aria-hidden="true">تصویر در دسترس نیست</span> : null}
    </span>
  );
}
