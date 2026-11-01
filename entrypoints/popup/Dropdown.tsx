import React, { useEffect, useId, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from './Icons';

export interface DropdownOption {
  readonly value: string;
  readonly label: string;
}

export interface DropdownProps {
  readonly ariaLabel: string;
  readonly value: string;
  readonly options: readonly DropdownOption[];
  readonly onChange: (value: string) => void;
  readonly testId?: string;
}

/** Closes a popover on outside pointer down. */
export function useOutsideDismiss(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && ref.current !== null && !ref.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [ref, open, onClose]);
}

function optionTestId(testId: string | undefined, value: string): string | undefined {
  if (testId === undefined) return undefined;
  return `${testId}-option-${value === '' ? 'all' : value}`;
}

/**
 * Custom select-only listbox (WAI-ARIA APG "select-only combobox") styled to the popup's
 * dark design — the native <select> option menu cannot be themed.
 */
export function Dropdown({ ariaLabel, value, options, onChange, testId }: DropdownProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  const close = React.useCallback(() => setOpen(false), []);
  useOutsideDismiss(wrapperRef, open, close);

  const openList = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option !== undefined) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((i) => Math.min(last, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(last);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) commit(activeIndex);
        else openList();
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
      default:
        break;
    }
  };

  const selected = options[selectedIndex];

  return (
    <div ref={wrapperRef} className="chamber-dropdown">
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open ? `${baseId}-opt-${activeIndex}` : undefined}
        data-testid={testId}
        data-value={value}
        className="chamber-dropdown-trigger"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span className="chamber-dropdown-value">{selected?.label ?? ''}</span>
        <span className="chamber-dropdown-caret" aria-hidden="true">
          <IconChevronDown size={13} />
        </span>
      </button>

      {open && (
        <ul id={listboxId} role="listbox" aria-label={ariaLabel} className="chamber-menu">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value === '' ? '__all' : option.value}
                id={`${baseId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                data-active={index === activeIndex ? 'true' : undefined}
                data-testid={optionTestId(testId, option.value)}
                className="chamber-menu-item"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(index)}
              >
                <span className="chamber-menu-item-label">{option.label}</span>
                {isSelected && (
                  <span className="chamber-menu-item-check" aria-hidden="true">
                    <IconCheck size={13} strokeWidth={2.25} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

