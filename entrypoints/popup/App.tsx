import React, { useEffect, useState } from 'react';
import { getMessages, type Locale } from '../../src/core/i18n';
import { RuleValidationError, type CompiledRules } from '../../src/core/matcher';
import { validateListObject } from '../../src/core/validate-list';
import {
  getActiveRules,
  setActiveRules,
  type StorageAreaLike,
} from '../../src/storage/rules';

export interface AppProps {
  readonly locale?: Locale;
  readonly storage?: StorageAreaLike;
}

function getRuleCounts(rules: CompiledRules) {
  const accounts = rules.accounts.size;
  const keywords = rules.keywords.length;
  const exclude = rules.exclude.length;
  const scoped = rules.scoped.length;
  return {
    total: accounts + keywords + exclude + scoped,
    accounts,
    keywords,
    exclude,
    scoped,
  };
}

export default function App({ locale = 'tr', storage }: AppProps) {
  const messages = getMessages(locale);

  const [jsonInput, setJsonInput] = useState('');
  const [counts, setCounts] = useState({
    total: 0,
    accounts: 0,
    keywords: 0,
    exclude: 0,
    scoped: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getActiveRules(storage)
      .then(({ rules }) => {
        if (active) {
          setCounts(getRuleCounts(rules));
        }
      })
      .catch(() => {
        // Storage unavailable outside extension context unless injected in tests.
      });
    return () => {
      active = false;
    };
  }, [storage]);

  const handleLoadList = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      setErrorMessage(messages.invalidJsonError);
      return;
    }

    const validation = validateListObject(parsed);
    if (!validation.ok) {
      setErrorMessage(`${messages.schemaErrorPrefix} ${validation.error}`);
      return;
    }

    try {
      const { list } = validation;
      const { rules } = await setActiveRules(
        [list.rules],
        list.mode ?? 'collapse',
        storage,
      );
      setCounts(getRuleCounts(rules));
      setStatusMessage(messages.listLoadedSuccess(list.name));
    } catch (err) {
      if (err instanceof RuleValidationError) {
        setErrorMessage(`${messages.schemaErrorPrefix} ${err.message}`);
        return;
      }
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main style={{ minWidth: 300, padding: 12, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>{messages.appTitle}</h1>

      <p data-testid="active-rules-count" style={{ margin: '0 0 12px', fontSize: 13 }}>
        {messages.activeRulesSummary(counts)}
      </p>

      <form onSubmit={handleLoadList}>
        <label
          htmlFor="chamber-list-json"
          style={{ display: 'block', fontSize: 13, marginBottom: 4 }}
        >
          {messages.pasteListLabel}
        </label>
        <textarea
          id="chamber-list-json"
          data-testid="list-json-input"
          rows={7}
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder={messages.pasteListPlaceholder}
          style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12 }}
        />
        <button
          type="submit"
          data-testid="load-list-button"
          style={{ marginTop: 8, padding: '6px 12px', cursor: 'pointer' }}
        >
          {messages.loadListButton}
        </button>
      </form>

      {errorMessage !== null && (
        <p
          role="alert"
          data-testid="list-error"
          style={{ color: '#b91c1c', fontSize: 12, marginTop: 8 }}
        >
          {errorMessage}
        </p>
      )}

      {statusMessage !== null && (
        <p
          role="status"
          data-testid="list-status"
          style={{ color: '#15803d', fontSize: 12, marginTop: 8 }}
        >
          {statusMessage}
        </p>
      )}
    </main>
  );
}
