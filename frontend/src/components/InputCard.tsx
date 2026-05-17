import { useRef, useState } from 'react';

type InputMode = 'paste' | 'upload' | 'github' | 'link';

interface Props {
  loading: boolean;
  onAnalyzeText: (content: string) => void;
  onAnalyzeFile: (file: File) => void;
  onAnalyzeGithubRepo: (repo: string, ref?: string, path?: string) => void;
  onAnalyzeFromLink: (url: string) => void;
}

export function InputCard({
  loading,
  onAnalyzeText,
  onAnalyzeFile,
  onAnalyzeGithubRepo,
  onAnalyzeFromLink,
}: Props) {
  const [mode, setMode] = useState<InputMode>('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [repo, setRepo] = useState('');
  const [repoRef, setRepoRef] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'paste') {
      if (text.trim()) onAnalyzeText(text.trim());
    } else if (mode === 'upload') {
      if (file) onAnalyzeFile(file);
    } else if (mode === 'github') {
      if (repo.trim()) onAnalyzeGithubRepo(repo.trim(), repoRef.trim() || undefined, repoPath.trim() || undefined);
    } else {
      if (linkUrl.trim()) onAnalyzeFromLink(linkUrl.trim());
    }
  }

  function handleFile(f: File) {
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      handleFile(dropped);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      handleFile(selected);
    }
  }

  const canSubmit =
    !loading &&
    ((mode === 'paste' && text.trim().length > 0) ||
      (mode === 'upload' && file !== null) ||
      (mode === 'github' && repo.trim().length > 0) ||
      (mode === 'link' && linkUrl.trim().length > 0));

  return (
    <section className="card" aria-label="Input">
      <div className="tab-group" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'paste'}
          className={`tab${mode === 'paste' ? ' tab--active' : ''}`}
          onClick={() => setMode('paste')}
          type="button"
        >
          Paste File
        </button>
        <button
          role="tab"
          aria-selected={mode === 'upload'}
          className={`tab${mode === 'upload' ? ' tab--active' : ''}`}
          onClick={() => setMode('upload')}
          type="button"
        >
          Upload
        </button>
        <button
          role="tab"
          aria-selected={mode === 'github'}
          className={`tab${mode === 'github' ? ' tab--active' : ''}`}
          onClick={() => setMode('github')}
          type="button"
        >
          GitHub
        </button>
        <button
          role="tab"
          aria-selected={mode === 'link'}
          className={`tab${mode === 'link' ? ' tab--active' : ''}`}
          onClick={() => setMode('link')}
          type="button"
        >
          Fetch
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'paste' ? (
          <div className="field">
            <label className="label" htmlFor="json-paste">
              package.json content
            </label>
            <textarea
              id="json-paste"
              className="input input--textarea"
              placeholder={'{\n  "name": "my-app",\n  "dependencies": {}\n}'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={10}
            />
          </div>
        ) : mode === 'upload' ? (
          <div className="field">
            <label className="label">package.json file</label>
            <div
              className={`upload-zone${dragging ? ' upload-zone--drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
              aria-label="Upload package.json file"
            >
              <span className="upload-zone_icon" aria-hidden="true">📂</span>
              <span className="upload-zone_text">
                Drop <code>package.json</code> here or <span className="upload-zone_cta">browse</span>
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={handleChange}
              />
            </div>
            {file && (
              <span className="upload-zone_selected">
                Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>
        ) : mode === 'github' ? (
          <div className="field">
            <label className="label" htmlFor="repo-input">GitHub repository</label>
            <input
              id="repo-input"
              className="input"
              placeholder="owner/repo or https://github.com/owner/repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <div className="dependency-controls">
              <div className="field dependency-controls_field">
                <label className="label" htmlFor="repo-ref">Branch (optional)</label>
                <input
                  id="repo-ref"
                  className="input"
                  placeholder="main"
                  value={repoRef}
                  onChange={(e) => setRepoRef(e.target.value)}
                />
              </div>
              <div className="field dependency-controls_field">
                <label className="label" htmlFor="repo-path">Path (optional)</label>
                <input
                  id="repo-path"
                  className="input"
                  placeholder="/frontend"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="field">
            <label className="label" htmlFor="link-input">Direct package.json link</label>
            <input
              id="link-input"
              className="input"
              placeholder="https://example.com/package.json"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
          </div>
        )}

        <button
          type="submit"
          className="btn btn--primary"
          disabled={!canSubmit}
        >
          {loading ? <><span className="spinner" aria-hidden="true" />Analyzing…</> : 'Analyze'}
        </button>
      </form>
    </section>
  );
}
