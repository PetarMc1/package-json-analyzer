import { useEffect, useMemo, useState } from 'react';
import { InputCard } from './components/InputCard';
import { Dashboard } from './components/dashboard/Dashboard';
import { useAnalyze } from './hooks/useAnalyze';
import { apiUrl } from './api';

type Route = '/' | '/about';
type HealthStatus = 'checking' | 'ok' | 'unreachable';

const statusLabel: Record<HealthStatus, string> = {
  checking: 'Backend: checking…',
  ok: 'Backend: online',
  unreachable: 'Backend: offline',
};

export default function App() {
  const [route, setRoute] = useState<Route>('/');
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const {
    result,
    error,
    loading,
    analyzeText,
    analyzeFile,
    analyzeGithubRepo,
    analyzeFromLink,
    reset,
  } = useAnalyze();

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      setHealthStatus('checking');
      try {
        const response = await fetch(apiUrl('health'));
        if (!cancelled) {
          setHealthStatus(response.ok ? 'ok' : 'unreachable');
        }
      } catch {
        if (!cancelled) {
          setHealthStatus('unreachable');
        }
      }
    }

    void checkHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1 className="app-title">package.json analyzer</h1>
          <span className={`status-badge status-badge--${healthStatus}`}>
            {statusLabel[healthStatus]}
          </span>
        </div>
        <p className="app-subtitle">Inspect scripts, dependencies, and package structure.</p>
        <nav className="top-nav" aria-label="Primary navigation">
          <a
            className={`top-nav_link${route === '/' ? ' top-nav_link-active' : ''}`}
            href="/"
          >
            Analyzer
          </a>
          <a
            className={`top-nav_link${route === '/about' ? ' top-nav_link-active' : ''}`}
            href="/about"
          >
            About
          </a>
          <a
            className="top-nav_link"
            href="/terms/package-json-analyzer"
          >
            Terms
          </a>
          <a
            className="top-nav_link"
            href="/api-docs"
          >
            API Docs
          </a>
        </nav>
      </header>

      <main className="app-main">
        {route === '/about' ? (
          <section className="card static-page">
            <h2 className="static-page_title">About</h2>
            <p>
              package.json analyzer inspects your project's <code>package.json</code> and gives a 
              summary of scripts, dependencies, and potential issues. 
              It runs entirely in your browser, so no data is sent to any server. 
              You can analyze a <code>package.json</code> by pasting its content, uploading a file, fetching from a URL, 
              or connecting to a GitHub repository.
            </p>
          </section>
        ) : result ? (
          <Dashboard result={result} onReset={reset} />
        ) : (
          <>
            <InputCard
              loading={loading}
              onAnalyzeText={analyzeText}
              onAnalyzeFile={analyzeFile}
              onAnalyzeGithubRepo={analyzeGithubRepo}
              onAnalyzeFromLink={analyzeFromLink}
            />
            {error ? (
              <section className="card static-page" aria-label="Analysis error">
                <h2 className="static-page_title">Could not analyze package.json</h2>
                <p className="error-msg" role="alert">{error}</p>
              </section>
            ) : (
              <section className="card static-page" aria-label="Getting started">
                <h2 className="static-page_title">Start With A package.json</h2>
                <p>Use GitHub, Paste File, Upload, or Fetch to inspect scripts, dependencies, size impact, and update risk.</p>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <div className="app-footer_links">
          <a href="https://github.com/PetarMc1/package-json-analyzer/issues" target="_blank" rel="noreferrer">Report Issues</a>
          <span aria-hidden="true">•</span>
          <a
            href="/about"
            onClick={(e) => {
              e.preventDefault();
              setRoute('/about');
            }}
          >
            About
          </a>
        </div>
        <p className="app-footer_legal">Copyright © {currentYear} {" "}
        <a href="https://github.com/PetarMc1" target="_blank" rel="noreferrer">PetarMc1</a>. Licensed under  {" "}
        <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">Apache License 2.0</a>. <br />
        Not affiliated with
        <a href="https://www.npmjs.com/" target="_blank" rel="noreferrer"> npmjs</a> or
        <a href="https://github.com" target="_blank" rel="noreferrer"> GitHub</a>.
        </p>
      </footer>
    </div>
  );
}
