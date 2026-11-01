import React from 'react';
import { IconAlert, IconCheck } from './Icons';

export type NoticeTone = 'success' | 'error' | 'loading';

export interface NoticeProps {
  readonly tone: NoticeTone;
  readonly message: string;
  readonly testId?: string;
  readonly role?: 'alert';
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

function IconClose({ size = 12 }: { readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path vectorEffect="non-scaling-stroke" d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * Neutral charcoal notice with a tinted status chip and an optional dismiss button.
 * Message text is rendered as a React text node (never innerHTML).
 */
export function Notice({ tone, message, testId, role, dismissLabel, onDismiss }: NoticeProps) {
  return (
    <div role={role} className={`chamber-notice chamber-notice-${tone}`}>
      <span className="chamber-notice-chip" aria-hidden="true">
        {tone === 'loading' ? (
          <span className="chamber-notice-spinner" />
        ) : tone === 'error' ? (
          <IconAlert size={13} strokeWidth={2} />
        ) : (
          <IconCheck size={12} strokeWidth={2.25} />
        )}
      </span>
      <span data-testid={testId} className="chamber-notice-text">
        {message}
      </span>
      {onDismiss !== undefined && dismissLabel !== undefined && (
        <button
          type="button"
          className="chamber-notice-close"
          aria-label={dismissLabel}
          onClick={onDismiss}
          data-testid={testId !== undefined ? `${testId}-dismiss` : undefined}
        >
          <IconClose />
        </button>
      )}
    </div>
  );
}

