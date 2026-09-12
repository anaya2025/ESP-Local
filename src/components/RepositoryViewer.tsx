import React, { useState } from 'react';
import { GeneratedFile, ProjectConfig } from '../types';
import { 
  Folder, 
  FileCode, 
  Copy, 
  Check, 
  Download, 
  GitBranch, 
  GitCommit, 
  Github, 
  FileText,
  Eye,
  Code2,
  Zap
} from 'lucide-react';

interface RepositoryViewerProps {
  files: GeneratedFile[];
  config: ProjectConfig;
  onOpenMergedBinModal?: () => void;
}

export const RepositoryViewer: React.FC<RepositoryViewerProps> = ({ 
  files, 
  config,
  onOpenMergedBinModal
}) => {
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    files.find(f => f.path === 'src/main.cpp')?.path || files[0].path
  );
  const [copied, setCopied] = useState(false);
  const [showCloneDropdown, setShowCloneDropdown] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);

  const activeFile = files.find(f => f.path === selectedFilePath) || files[0];

  const handleCopyContent = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingleFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.path.split('/').pop() || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lines = activeFile ? activeFile.content.split('\n') : [];
  const repoName = config.projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'esp32s3-n16r8-starter';
  const authorName = config.author.trim() || 'your-username';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* GitHub Repository Top Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Github className="w-5 h-5 text-slate-300" />
          <span className="text-slate-400 text-sm font-mono">{authorName}</span>
          <span className="text-slate-600">/</span>
          <span className="text-white text-sm font-bold font-mono">{repoName}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            Public
          </span>
        </div>

        {/* Branch and Clone Button */}
        <div className="flex items-center gap-2">
          {onOpenMergedBinModal && (
            <button
              onClick={onOpenMergedBinModal}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition shadow-sm"
              title="Download single-file factory binary (merged.bin @ 0x0)"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
              <span>merged.bin</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs text-slate-300 font-mono">
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>main</span>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowCloneDropdown(!showCloneDropdown)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition shadow-sm"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Clone URL</span>
            </button>

            {showCloneDropdown && (
              <div className="absolute right-0 mt-1.5 w-80 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-2xl z-20 text-xs">
                <span className="font-semibold text-slate-200 block mb-1">Clone with HTTPS</span>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded p-1.5 font-mono text-[11px] text-slate-300">
                  <input
                    readOnly
                    value={`https://github.com/${authorName}/${repoName}.git`}
                    className="bg-transparent flex-1 focus:outline-none text-slate-300"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://github.com/${authorName}/${repoName}.git`);
                      setShowCloneDropdown(false);
                    }}
                    className="p-1 hover:text-white text-slate-400"
                    title="Copy URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Use this URL in VSCode or terminal with <code className="text-emerald-400 font-mono">git clone</code>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Two-Pane View: File Tree + Content Pane */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
        {/* Left File Tree Sidebar */}
        <div className="md:col-span-4 border-r border-slate-800 bg-slate-950/50 p-2.5 overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1.5 text-slate-400 text-xs font-semibold tracking-wider uppercase border-b border-slate-800/80 mb-2">
            <span>Repository Files</span>
            <span className="text-[10px] font-mono text-slate-500">{files.length} items</span>
          </div>

          <div className="space-y-0.5">
            {files.map((file) => {
              const isSelected = file.path === selectedFilePath;
              const isWorkflow = file.path.includes('.github');
              const isHeader = file.path.endsWith('.h');
              const isSource = file.path.endsWith('.cpp') || file.path.endsWith('.c');
              const isConfig = file.path.endsWith('.ini') || file.path.endsWith('.csv');
              const isMd = file.path.endsWith('.md');

              let fileIcon = <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
              if (isWorkflow) fileIcon = <GitCommit className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
              else if (isHeader) fileIcon = <FileCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
              else if (isConfig) fileIcon = <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
              else if (isMd) fileIcon = <FileText className="w-3.5 h-3.5 text-slate-300 shrink-0" />;

              return (
                <button
                  key={file.path}
                  onClick={() => {
                    setSelectedFilePath(file.path);
                    if (!file.path.endsWith('.md')) {
                      setShowMarkdownPreview(false);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition ${
                    isSelected
                      ? 'bg-slate-800 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {fileIcon}
                    <span className="truncate">{file.path}</span>
                  </div>
                  {isWorkflow && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800 shrink-0">
                      CI
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Info Box */}
          <div className="mt-4 p-3 bg-slate-900/80 border border-slate-800 rounded-lg text-[11px] text-slate-400">
            <span className="font-semibold text-slate-300 block mb-1">GitHub CI Ready</span>
            Includes <code className="text-emerald-400">.github/workflows/ci.yml</code> configured to compile with PlatformIO on every push.
          </div>
        </div>

        {/* Right Code Content Viewer */}
        <div className="md:col-span-8 flex flex-col bg-slate-900">
          {/* File Header Bar */}
          <div className="bg-slate-950/70 border-b border-slate-800 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white">{activeFile.path}</span>
              {activeFile.description && (
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  — {activeFile.description}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeFile.path.endsWith('.md') && (
                <button
                  onClick={() => setShowMarkdownPreview(!showMarkdownPreview)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  {showMarkdownPreview ? <Code2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showMarkdownPreview ? 'Raw Code' : 'Preview'}</span>
                </button>
              )}

              <button
                onClick={handleCopyContent}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Copy contents to clipboard"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>

              <button
                onClick={handleDownloadSingleFile}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                title="Download this single file"
              >
                <Download className="w-3 h-3" />
                <span>Save</span>
              </button>
            </div>
          </div>

          {/* Code Body / Preview */}
          <div className="p-4 overflow-x-auto flex-1 font-mono text-xs text-slate-300 bg-slate-950/40">
            {showMarkdownPreview && activeFile.path.endsWith('.md') ? (
              <div className="prose prose-invert prose-xs max-w-none text-slate-200 font-sans space-y-3 leading-relaxed">
                <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/60 whitespace-pre-wrap font-sans text-xs">
                  {activeFile.content}
                </div>
              </div>
            ) : (
              <div className="flex font-mono text-xs leading-5">
                {/* Line Numbers */}
                <div className="select-none text-right pr-4 text-slate-600 border-r border-slate-800/80 mr-4 font-mono text-[11px] shrink-0">
                  {lines.map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                {/* Raw Code Content */}
                <pre className="text-slate-200 flex-1 overflow-x-auto font-mono text-[11px] whitespace-pre">
                  {activeFile.content}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
