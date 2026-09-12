import React, { useState } from 'react';
import { GeneratedFile, ProjectConfig } from '../types';
import { publishToGitHub, PublishResult } from '../utils/githubPublisher';
import { 
  Github, 
  X, 
  Check, 
  Copy, 
  ExternalLink, 
  Terminal, 
  Key, 
  Loader2, 
  AlertCircle,
  FolderGit2,
  Sparkles
} from 'lucide-react';

interface GitHubPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: GeneratedFile[];
  config: ProjectConfig;
}

export const GitHubPublishModal: React.FC<GitHubPublishModalProps> = ({
  isOpen,
  onClose,
  files,
  config
}) => {
  const [activeTab, setActiveTab] = useState<'api' | 'cli' | 'git'>('api');
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState(config.projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'esp32s3-n16r8-starter');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedGit, setCopiedGit] = useState(false);

  if (!isOpen) return null;

  const handlePublish = async () => {
    if (!token.trim()) return;
    setIsPublishing(true);
    setProgressMsg('Initiating connection to GitHub API...');
    setResult(null);

    const res = await publishToGitHub(files, {
      token: token.trim(),
      repoName: repoName.trim(),
      description: config.description || 'ESP32-S3 N16R8 Firmware Repository with 16MB Flash & 8MB Octal PSRAM',
      isPrivate,
      onProgress: (msg) => setProgressMsg(msg)
    });

    setIsPublishing(false);
    setResult(res);
  };

  const cliCommand = `gh repo create ${repoName} --${isPrivate ? 'private' : 'public'} --source=. --remote=origin --push`;

  const gitCommands = `# 1. Extract the downloaded project ZIP into a folder
unzip ${repoName}.zip && cd ${repoName}

# 2. Initialize Git repository
git init -b main
git add .
git commit -m "feat: initial ESP32-S3 N16R8 firmware with 16MB partition and 8MB PSRAM"

# 3. Create repository on GitHub (or use your existing repo URL)
git remote add origin https://github.com/${config.author || 'your-username'}/${repoName}.git
git push -u origin main`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Create & Publish ESP32-S3 N16R8 Project to GitHub
              </h3>
              <p className="text-xs text-slate-400">
                Direct GitHub API creation, GitHub CLI, or standard Git push.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'api'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Direct GitHub API (Automatic)</span>
          </button>
          <button
            onClick={() => setActiveTab('cli')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'cli'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>GitHub CLI (gh)</span>
          </button>
          <button
            onClick={() => setActiveTab('git')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'git'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Standard Git</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  GitHub Personal Access Token (PAT)
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  Requires <code className="text-emerald-400">repo</code> scope.{' '}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=ESP32-S3-N16R8-Studio"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 underline hover:text-blue-300 inline-flex items-center gap-0.5"
                  >
                    Generate token on GitHub <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Repository Name
                  </label>
                  <input
                    type="text"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-950"
                    />
                    <span>Make repository private</span>
                  </label>
                </div>
              </div>

              {/* Progress & Result feedback */}
              {isPublishing && (
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                  <span className="text-xs text-slate-300 font-mono">{progressMsg}</span>
                </div>
              )}

              {result?.success && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl flex items-start gap-3">
                  <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-300">
                      Successfully Created and Pushed to GitHub!
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">
                      All {files.length} project files, partitions, and GitHub CI workflows have been committed. GitHub Actions has automatically started compiling your firmware in the cloud!
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={`${result.url}/actions`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Go to GitHub Actions & Download merged.bin</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
                      >
                        <Github className="w-4 h-4" />
                        <span>Open Repository</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      ⏱️ <em>Wait ~90s for the green checkmark in the Actions tab, then click the latest run to download the <strong>{config.projectName}-factory-merged-bin</strong> zip artifact!</em>
                    </p>
                  </div>
                </div>
              )}

              {result?.error && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-3.5 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-rose-300">{result.error}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={!token.trim() || isPublishing}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow transition flex items-center gap-1.5"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Pushing to GitHub...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Create & Push Repository</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'cli' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                If you have the official GitHub CLI (<code className="text-emerald-400">gh</code>) installed on your system, you can extract the project ZIP and create the remote repository in one command:
              </p>

              <div className="relative">
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-emerald-400 overflow-x-auto">
                  {cliCommand}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(cliCommand);
                    setCopiedCli(true);
                    setTimeout(() => setCopiedCli(false), 2000);
                  }}
                  className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition"
                >
                  {copiedCli ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCli ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-[11px] text-slate-400">
                This command automatically initializes git, creates the remote GitHub repository, adds the origin remote, and pushes the main branch!
              </div>
            </div>
          )}

          {activeTab === 'git' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Execute these commands in your local terminal to push the generated project into your existing or new GitHub repository:
              </p>

              <div className="relative">
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs font-mono text-slate-300 overflow-x-auto leading-5">
                  {gitCommands}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(gitCommands);
                    setCopiedGit(true);
                    setTimeout(() => setCopiedGit(false), 2000);
                  }}
                  className="absolute right-2.5 top-2.5 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition"
                >
                  {copiedGit ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedGit ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
