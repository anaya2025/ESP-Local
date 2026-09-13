import React from 'react';
import { Cpu, HardDrive, Zap, Download, Github, Terminal, ShieldAlert } from 'lucide-react';
import { ProjectConfig } from '../types';

interface HeaderProps {
  config: ProjectConfig;
  onDownloadZip: () => void;
  onOpenMergedBinModal: () => void;
  onOpenGitHubModal: () => void;
  onViewTerminal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  onDownloadZip,
  onOpenMergedBinModal,
  onOpenGitHubModal,
  onViewTerminal
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Title and Hardware Badges */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white font-mono font-bold text-sm tracking-tight shrink-0">
            S3
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-white tracking-tight">
                ESP32-S3 N16R8 Project Studio
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                16MB Flash • 8MB Octal PSRAM
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Dual-Core Xtensa LX7 @ 240MHz</span>
              <span className="text-slate-600">•</span>
              <span>SIMD Vector AI</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400/90 font-mono">GPIO 33-37 OPI Protected</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            id="btn-view-terminal"
            onClick={onViewTerminal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 rounded-lg border border-emerald-500/40 hover:border-emerald-400 transition shadow-sm"
            title="Simulate virtual flash, sector erase, CRC verification, and ESP32-S3 boot monitor"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
            <span>Virtual Flash & Boot</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>

          <button
            id="btn-open-merged-bin"
            onClick={onOpenMergedBinModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/80 rounded-lg border border-emerald-500/40 hover:border-emerald-400 transition shadow-sm"
            title="Download single-file factory flash binary (at offset 0x0)"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
            <span>Get merged.bin</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono">@ 0x0</span>
          </button>

          <button
            id="btn-download-zip"
            onClick={onDownloadZip}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 hover:border-slate-600 transition shadow-sm"
            title="Download full project repository as ZIP"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Download ZIP</span>
          </button>

          <button
            id="btn-open-github-modal"
            onClick={onOpenGitHubModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg shadow-sm shadow-emerald-950 transition"
          >
            <Github className="w-3.5 h-3.5" />
            <span>Push to GitHub</span>
          </button>
        </div>
      </div>
    </header>
  );
};
