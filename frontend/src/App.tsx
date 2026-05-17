import { useEffect, useMemo, useState } from 'react';
import { InputCard } from './components/InputCard';
import { Dashboard } from './components/dashboard/Dashboard';
import { useAnalyze } from './hooks/useAnalyze';
import { apiUrl } from './api';
import { Helmet } from 'react-helmet-async';

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
    <>
    <Helmet>
      <meta property="og:type" content="website"/>
      <meta name="twitter:card" content="summary"/>
      <title>Package.json Analyzer | Inspect Dependencies, Scripts & Issues Online</title>
      <meta name="pagename" content="Package.json Analyzer - Inspect Dependencies, Scripts & Issues Online"/>
      <meta property="og:title" content="Package.json Analyzer - Inspect Dependencies, Scripts & Issues Online"/>
      <meta name="twitter:title" content="Package.json Analyzer - Inspect Dependencies, Scripts & Issues Online"/>
      <meta name="description" content="Analyze your package.json file instantly in your browser. Package.json Analyzer inspects scripts, dependencies, devDependencies, and potential issues to help you understand and improve your project. No data is sent to any server - everything runs locally for full privacy. You can paste a package.json, upload a file, fetch from a URL, or connect a GitHub repository."/>
      <meta property="og:description" content="Analyze your package.json file instantly in your browser. Package.json Analyzer inspects scripts, dependencies, devDependencies, and potential issues to help you understand and improve your project. No data is sent to any server - everything runs locally for full privacy. You can paste a package.json, upload a file, fetch from a URL, or connect a GitHub repository."/>
      <meta name="twitter:description" content="Analyze your package.json file instantly in your browser. Package.json Analyzer inspects scripts, dependencies, devDependencies, and potential issues to help you understand and improve your project. No data is sent to any server - everything runs locally for full privacy. You can paste a package.json, upload a file, fetch from a URL, or connect a GitHub repository."/>
      <meta name="keywords" content="package.json analyzer, npm dependency checker, node.js tools, package.json inspector, dependency analyzer, npm scripts viewer, dev dependencies checker, node project analyzer, frontend developer tools, backend developer tools, JavaScript tools, Node.js package analyzer, local package.json viewer, GitHub package.json analyzer, browser-based tools, no server processing, privacy tools, npm audit alternative"/>
      <meta name="news_keywords" content="package.json analyzer, npm dependency checker, node.js tools, package.json inspector, dependency analyzer, npm scripts viewer, dev dependencies checker, node project analyzer, frontend developer tools, backend developer tools, JavaScript tools, Node.js package analyzer, local package.json viewer, GitHub package.json analyzer, browser-based tools, no server processing, privacy tools, npm audit alternative"/>
      <meta property="og:site_name" content="Package.json Analyzer - Inspect Dependencies & Scripts"/>
      <meta name="robots" content="index, follow" />
    </Helmet>
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
            onClick={(e) => {
              e.preventDefault();
              setRoute('/');
            }}
          >
            Analyzer
          </a>
          <a
            className={`top-nav_link${route === '/about' ? ' top-nav_link-active' : ''}`}
            href="/about"
            onClick={(e) => {
              e.preventDefault();
              setRoute('/about');
            }}
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
          <>
          <Helmet>
            <title>Package.json Analyzer | About</title>
          </Helmet>

          <section className="card static-page">
            <h2 className="static-page_title">About</h2>
            <p>
              package.json analyzer inspects your project's <code>package.json</code> and gives a 
              summary of scripts, dependencies, and potential issues. 
              It runs entirely in your browser, so no data is sent to any server. 
              You can analyze a <code>package.json</code> by pasting its content, uploading a file, fetching from a URL, 
              or connecting to a GitHub repository.
            </p>
              <Helmet>
                <title>Package.json Analyzer | About</title>
                <meta name="robots" content="noindex, nofollow" />
              </Helmet>
          </section>
          </>
        ) : result ? (
          <Dashboard result={result} onReset={reset} />
        ) : (
          <>
          <Helmet>
            <meta name="robots" content="noindex, nofollow" />
          </Helmet>
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
    </>
  );
}
