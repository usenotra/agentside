import type { HTMLAttributes } from "astro/types";

export type CtaButtonVariant = "primary" | "flat" | "light";
export type CtaButtonSize = "sm" | "lg";

export type CtaButtonProps = Omit<HTMLAttributes<"button">, "type"> & {
  variant?: CtaButtonVariant;
  size?: CtaButtonSize;
  /** Renders an anchor instead of a button. */
  href?: string;
};

export interface CopyButtonProps {
  /** The text that lands on the clipboard. */
  text: string;
  /** Accessible name before copying, e.g. "Copy install command". */
  label: string;
}

export interface SectionProps {
  id?: string;
  /** Narrows the content column, for text-heavy sections. */
  narrow?: boolean;
  /** Skips the padded content column, for full-bleed children. */
  bleed?: boolean;
}

export interface SectionHeadProps {
  title: string;
}

export interface TextLinkProps {
  href: string;
}

export interface FrameProps {
  class?: string;
}

export interface MockFrameProps {
  title: string;
  subtitle: string;
}
