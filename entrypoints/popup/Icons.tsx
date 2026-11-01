import React from 'react';

export interface IconProps {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

export interface StatefulIconProps extends IconProps {
  readonly active?: boolean;
}

/**
 * Chamber shield/filter emblem (16x16 grid, currentColor).
 */
export function IconChamberMark({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        vectorEffect="non-scaling-stroke"
        d="M8 1.75L2.75 4v3.75c0 3.45 2.24 5.69 5.25 6.5 3.01-.81 5.25-3.05 5.25-6.5V4L8 1.75Z"
      />
      <path vectorEffect="non-scaling-stroke" d="M5.5 7.25h5M6.5 9.75h3" />
    </svg>
  );
}

/**
 * Installed lists tab icon — outline by default, filled when active (better-ui).
 */
export function IconListTab({
  size = 16,
  strokeWidth = 1.75,
  active = false,
  className,
}: StatefulIconProps) {
  if (active) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <rect x="2" y="2.5" width="12" height="3" rx="1" />
        <rect x="2" y="6.5" width="12" height="3" rx="1" />
        <rect x="2" y="10.5" width="8.5" height="3" rx="1" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <circle cx="2.75" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.75" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.75" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Catalog tab icon — outline by default, filled when active (better-ui).
 */
export function IconCatalogTab({
  size = 16,
  strokeWidth = 1.75,
  active = false,
  className,
}: StatefulIconProps) {
  if (active) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <rect x="2" y="2" width="5.25" height="5.25" rx="1.25" />
        <rect x="8.75" y="2" width="5.25" height="5.25" rx="1.25" />
        <rect x="2" y="8.75" width="5.25" height="5.25" rx="1.25" />
        <rect x="8.75" y="8.75" width="5.25" height="5.25" rx="1.25" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect vectorEffect="non-scaling-stroke" x="2.25" y="2.25" width="4.75" height="4.75" rx="1" />
      <rect vectorEffect="non-scaling-stroke" x="9" y="2.25" width="4.75" height="4.75" rx="1" />
      <rect vectorEffect="non-scaling-stroke" x="2.25" y="9" width="4.75" height="4.75" rx="1" />
      <rect vectorEffect="non-scaling-stroke" x="9" y="9" width="4.75" height="4.75" rx="1" />
    </svg>
  );
}

export function IconPlus({ size = 15, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

export function IconDownload({ size = 14, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M8 2.5v7.25m0 0L5.25 7M8 9.75L10.75 7" />
      <path vectorEffect="non-scaling-stroke" d="M2.75 12.75h10.5" />
    </svg>
  );
}

export function IconCheck({ size = 14, strokeWidth = 2, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M3.25 8.25l3 3 6.5-6.5" />
    </svg>
  );
}

export function IconAlert({ size = 15, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle vectorEffect="non-scaling-stroke" cx="8" cy="8" r="6" />
      <path vectorEffect="non-scaling-stroke" d="M8 5.25v3.25" />
      <circle cx="8" cy="11" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTrash({ size = 14, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M2.75 4.25h10.5" />
      <path
        vectorEffect="non-scaling-stroke"
        d="M6 4.25V3a.75.75 0 0 1 .75-.75h2.5A.75.75 0 0 1 10 3v1.25"
      />
      <path
        vectorEffect="non-scaling-stroke"
        d="M4 4.25l.65 8.5a1 1 0 0 0 1 .92h4.7a1 1 0 0 0 1-.92l.65-8.5"
      />
    </svg>
  );
}

export function IconSearch({ size = 14, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle vectorEffect="non-scaling-stroke" cx="7.25" cy="7.25" r="4.5" />
      <path vectorEffect="non-scaling-stroke" d="M10.5 10.5L13.5 13.5" />
    </svg>
  );
}

export function IconLink({ size = 14, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        vectorEffect="non-scaling-stroke"
        d="M6.75 9.25a2.5 2.5 0 0 0 3.54 0l2.25-2.25a2.5 2.5 0 0 0-3.54-3.54L7.75 4.7"
      />
      <path
        vectorEffect="non-scaling-stroke"
        d="M9.25 6.75a2.5 2.5 0 0 0-3.54 0L3.46 9a2.5 2.5 0 0 0 3.54 3.54l1.25-1.24"
      />
    </svg>
  );
}

export function IconChevronRight({ size = 14, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M6 3.75L10.25 8 6 12.25" />
    </svg>
  );
}

export function IconChevronDown({ size = 14, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M4.25 6.25L8 10l3.75-3.75" />
    </svg>
  );
}

/**
 * 3-line hamburger menu icon (16x16 grid, currentColor).
 */
export function IconHamburgerMenu({ size = 16, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </svg>
  );
}

export function IconChevronLeft({ size = 16, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M10 3.5L5.5 8l4.5 4.5" />
    </svg>
  );
}

export function IconSliders({ size = 16, strokeWidth = 1.65, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M2.25 5h4.25M9.5 5h4.25" />
      <circle vectorEffect="non-scaling-stroke" cx="8" cy="5" r="1.5" />
      <path vectorEffect="non-scaling-stroke" d="M2.25 11h2.25M7.5 11h6.25" />
      <circle vectorEffect="non-scaling-stroke" cx="6" cy="11" r="1.5" />
    </svg>
  );
}

export function IconGlobe({ size = 16, strokeWidth = 1.65, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle vectorEffect="non-scaling-stroke" cx="8" cy="8" r="6" />
      <path vectorEffect="non-scaling-stroke" d="M2.25 8h11.5" />
      <path
        vectorEffect="non-scaling-stroke"
        d="M8 2c1.75 1.65 2.65 3.65 2.65 6S9.75 12.35 8 14c-1.75-1.65-2.65-3.65-2.65-6S6.25 3.65 8 2Z"
      />
    </svg>
  );
}

export function IconClose({ size = 16, strokeWidth = 1.75, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path vectorEffect="non-scaling-stroke" d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

export function IconGitHub({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M8 1.2a6.8 6.8 0 0 0-2.15 13.25c.34.06.46-.15.46-.33v-1.28c-1.89.41-2.29-.8-2.29-.8-.31-.78-.75-.99-.75-.99-.62-.42.05-.41.05-.41.68.05 1.04.7 1.04.7.6 1.04 1.59.74 1.98.57.06-.44.24-.74.43-.91-1.51-.17-3.1-.76-3.1-3.37 0-.75.27-1.36.7-1.84-.07-.17-.3-.86.07-1.8 0 0 .57-.18 1.87.7a6.5 6.5 0 0 1 3.4 0c1.3-.88 1.87-.7 1.87-.7.37.94.14 1.63.07 1.8.44.48.7 1.09.7 1.84 0 2.62-1.59 3.2-3.11 3.37.25.21.46.62.46 1.26v1.87c0 .18.12.39.47.33A6.8 6.8 0 0 0 8 1.2Z" />
    </svg>
  );
}


