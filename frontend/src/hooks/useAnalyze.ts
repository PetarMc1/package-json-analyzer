import { useState } from 'react';
import type { AnalysisResult } from '../types';

interface AnalyzeState {
  result: AnalysisResult | null;
  error: string | null;
  loading: boolean;
}

interface UseAnalyze extends AnalyzeState {
  analyzeText: (content: string) => Promise<void>;
  analyzeFile: (file: File) => Promise<void>;
  analyzeGithubRepo: (repo: string, ref?: string, path?: string) => Promise<void>;
  analyzeFromLink: (url: string) => Promise<void>;
  reset: () => void;
}

const IDLE: AnalyzeState = { result: null, error: null, loading: false };

async function parseResponseBody(response: Response): Promise<AnalysisResult | { error?: string } | null> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json() as Promise<AnalysisResult | { error?: string }>;
  }

  const text = await response.text();
  return text ? { error: text } : null;
}

export function useAnalyze(): UseAnalyze {
  const [state, setState] = useState<AnalyzeState>(IDLE);

  async function fetchRemoteContent(payload: Record<string, unknown>): Promise<string> {
    const res = await fetch('/api/fetch-package-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await parseResponseBody(res);
    if (!res.ok) {
      throw new Error(body && 'error' in body ? body.error ?? 'Could not fetch package.json.' : 'Could not fetch package.json.');
    }

    if (!body || !('content' in body) || typeof body.content !== 'string') {
      throw new Error('Remote source did not return package.json content.');
    }

    return body.content;
  }

  async function runFetch(init: RequestInit): Promise<void> {
    setState({ result: null, error: null, loading: true });
    try {
      const res = await fetch('/api/analyze', init);
      const body = await parseResponseBody(res);
      if (!res.ok) {
        setState({ result: null, error: body && 'error' in body ? body.error ?? 'Analysis failed.' : 'Analysis failed.', loading: false });
      } else {
        setState({ result: body as AnalysisResult, error: null, loading: false });
      }
    } catch {
      setState({ result: null, error: 'Network error — could not reach the server.', loading: false });
    }
  }

  function analyzeText(content: string) {
    return runFetch({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  function analyzeFile(file: File) {
    const form = new FormData();
    form.append('file', file);
    return runFetch({ method: 'POST', body: form });
  }

  async function analyzeGithubRepo(repo: string, ref?: string, path?: string): Promise<void> {
    setState({ result: null, error: null, loading: true });
    try {
      const content = await fetchRemoteContent({ source: 'github', repo, ref, path });
      await runFetch({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      setState({ result: null, error: err instanceof Error ? err.message : 'Could not fetch package.json.', loading: false });
    }
  }

  async function analyzeFromLink(url: string): Promise<void> {
    setState({ result: null, error: null, loading: true });
    try {
      const content = await fetchRemoteContent({ source: 'link', url });
      await runFetch({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      setState({ result: null, error: err instanceof Error ? err.message : 'Could not fetch package.json.', loading: false });
    }
  }

  function reset() {
    setState(IDLE);
  }

  return { ...state, analyzeText, analyzeFile, analyzeGithubRepo, analyzeFromLink, reset };
}
