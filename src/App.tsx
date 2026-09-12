/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ProjectConfig } from './types';
import { PARTITION_SCHEMES } from './data/partitions';
import { generateProjectFiles } from './data/projectTemplates';
import { downloadProjectZip } from './utils/zipExporter';
import { Header } from './components/Header';
import { TopMediaControlBar } from './components/TopMediaControlBar';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { MaterialAudioPlayer } from './components/MaterialAudioPlayer';
import { ProjectConfigurator } from './components/ProjectConfigurator';
import { RepositoryViewer } from './components/RepositoryViewer';
import { PartitionVisualizer } from './components/PartitionVisualizer';
import { PinoutConflictChecker } from './components/PinoutConflictChecker';
import { GitHubPublishModal } from './components/GitHubPublishModal';
import { BootLogSimulator } from './components/BootLogSimulator';
import { MergedBinModal } from './components/MergedBinModal';
import { 
  FolderGit2, 
  Layers, 
  Cpu, 
  Terminal, 
  Download, 
  Github, 
  BookOpen, 
  Zap,
  ArrowRight,
  Settings,
  ExternalLink,
  Sliders,
  Radio,
  CheckCircle2,
  Cast
} from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState<ProjectConfig>({
    projectName: 'esp32s3-n16r8-dlna-player',
    description: 'ESP32-S3 N16R8 HiFi DLNA UPnP Media Receiver, Material Design 3 Web Player (.local), 3-Band Tone EQ presets, and seamless wireless OTA base.',
    author: 'gazi-amir7',
    framework: 'platformio',
    board: 'devkitc-1-n16r8',
    template: 'dlna-media-receiver',
    partitionSchemeId: 'dual-ota-balanced',
    flashMode: 'qio',
    flashFreq: '80m',
    psramMode: 'opi',
    psramFreq: '80m',
    enableUsbCdc: true,
    enableRgbLed: true,
    wifiSsid: 'Home_WiFi_5G',
    wifiPassword: '',
    audioSettings: {
      dlnaDeviceName: 'ESP32-S3 HiFi Streamer',
      mDnsHost: 'esp32-audio',
      defaultVolume: 65,
      eqBass: 0,
      eqMid: 0,
      eqTreble: 0,
      i2sBclkPin: 15,
      i2sLrcPin: 16,
      i2sDoutPin: 17
    },
    extraLibs: [
      'https://github.com/pschatzmann/ESP32-A2DP.git',
      'https://github.com/schreibfaul1/ESP32-audioI2S.git',
      'ESP Async WebServer',
      'AsyncTCP',
      'bblanchon/ArduinoJson@^7.0.0'
    ]
  });

  // Active engineering sub-view: repo, partitions, pins, guide, config
  const [activeEngineeringTab, setActiveEngineeringTab] = useState<'repo' | 'partitions' | 'pins' | 'guide' | 'config'>('repo');
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isMergedBinModalOpen, setIsMergedBinModalOpen] = useState(false);

  // Shared audio state for both the TopMediaControlBar and the MaterialAudioPlayer dashboard
  const audio = useAudioPlayer(config);

  const activePartitionScheme = useMemo(() => {
    return (
      PARTITION_SCHEMES.find((s) => s.id === config.partitionSchemeId) ||
      PARTITION_SCHEMES[0]
    );
  }, [config.partitionSchemeId]);

  const generatedFiles = useMemo(() => {
    return generateProjectFiles(config);
  }, [config]);

  const handleDownloadZip = async () => {
    try {
      await downloadProjectZip(generatedFiles, config.projectName);
    } catch (err) {
      console.error('Failed to generate ZIP archive', err);
    }
  };

  const mDnsHost = config.audioSettings?.mDnsHost || 'esp32-audio';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* 1. Main Top Header Banner */}
      <Header
        config={config}
        onDownloadZip={handleDownloadZip}
        onOpenMergedBinModal={() => setIsMergedBinModalOpen(true)}
        onOpenGitHubModal={() => setIsGitHubModalOpen(true)}
        onViewTerminal={() => setIsTerminalOpen(true)}
      />

      {/* 2. MEDIA CONTROL (Placed right after the main top banner as requested) */}
      <TopMediaControlBar
        isPlaying={audio.isPlaying}
        onTogglePlay={audio.togglePlay}
        onStop={audio.stop}
        onNext={audio.nextTrack}
        onPrevious={audio.previousTrack}
        currentTrack={audio.currentTrack}
        streamUrl={audio.streamUrl}
        sourceType={audio.sourceType}
        dlnaCastingDevice={audio.dlnaCastingDevice}
        volume={audio.volume}
        onVolumeChange={audio.setVolume}
        isMuted={audio.isMuted}
        onToggleMute={audio.toggleMute}
        activePreset={audio.activePreset}
        mDnsHost={mDnsHost}
        visualizerBars={audio.visualizerBars}
        onOpenMergedBinModal={() => setIsMergedBinModalOpen(true)}
        onSelectStation={audio.playPreset}
      />

      {/* 3. Compact Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        {/* Subtle Quick Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/60 border border-slate-800/80 rounded-xl text-[11px] text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Firmware Web App:
            </span>
            <span className="font-mono text-slate-300">http://{mDnsHost}.local</span>
            <span className="text-slate-600">•</span>
            <span>DLNA MediaRenderer Active</span>
            <span className="text-slate-600">•</span>
            <span>Dual 6.5MB OTA Rollback</span>
            <span className="text-slate-600">•</span>
            <span>1024KB Octal PSRAM Buffer</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMergedBinModalOpen(true)}
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition hover:underline"
            >
              <Zap className="w-3 h-3 fill-emerald-400" />
              <span>Factory merged.bin (@ 0x0)</span>
            </button>
            <span className="text-slate-600">•</span>
            <button
              onClick={() => setIsGitHubModalOpen(true)}
              className="text-slate-300 hover:text-white flex items-center gap-1 transition hover:underline"
            >
              <Github className="w-3 h-3 text-emerald-400" />
              <span>Push to GitHub</span>
            </button>
          </div>
        </div>

        {/* 4. Compact 3-Column Audio/DLNA/OTA Bento Dashboard */}
        <MaterialAudioPlayer 
          config={config} 
          audio={audio}
          onOpenMergedBinModal={() => setIsMergedBinModalOpen(true)} 
          onUpdateConfig={(upd) => setConfig(prev => ({ ...prev, ...upd }))}
        />

        {/* 5. Compact Engineering & Firmware Studio Section */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
          {/* Section Header & Sub-Tabs Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                ESP32-S3 N16R8 Engineering & Source Studio
              </h2>
            </div>

            {/* Segmented Tab Controls */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium overflow-x-auto">
              <button
                onClick={() => setActiveEngineeringTab('repo')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition whitespace-nowrap ${
                  activeEngineeringTab === 'repo'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5" />
                <span>Repository Code ({generatedFiles.length})</span>
              </button>

              <button
                onClick={() => setActiveEngineeringTab('partitions')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition whitespace-nowrap ${
                  activeEngineeringTab === 'partitions'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>16MB Partition Table</span>
              </button>

              <button
                onClick={() => setActiveEngineeringTab('pins')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition whitespace-nowrap ${
                  activeEngineeringTab === 'pins'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>PSRAM & Pinout Map</span>
              </button>

              <button
                onClick={() => setActiveEngineeringTab('config')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition whitespace-nowrap ${
                  activeEngineeringTab === 'config'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>

              <button
                onClick={() => setActiveEngineeringTab('guide')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition whitespace-nowrap ${
                  activeEngineeringTab === 'guide'
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Flashing Guide</span>
              </button>
            </div>
          </div>

          {/* Sub-view: Live GitHub Repository Viewer */}
          {activeEngineeringTab === 'repo' && (
            <div className="space-y-3">
              <RepositoryViewer 
                files={generatedFiles} 
                config={config} 
                onOpenMergedBinModal={() => setIsMergedBinModalOpen(true)}
              />
            </div>
          )}

          {/* Sub-view: 16MB Partition Table Visualizer */}
          {activeEngineeringTab === 'partitions' && (
            <div className="space-y-3">
              <PartitionVisualizer scheme={activePartitionScheme} />
            </div>
          )}

          {/* Sub-view: PSRAM & Pinout Conflict Guard */}
          {activeEngineeringTab === 'pins' && (
            <div className="space-y-3">
              <PinoutConflictChecker />
            </div>
          )}

          {/* Sub-view: Project Configurator */}
          {activeEngineeringTab === 'config' && (
            <div className="space-y-3">
              <ProjectConfigurator config={config} onChange={setConfig} />
            </div>
          )}

          {/* Sub-view: Flashing & CI Guide */}
          {activeEngineeringTab === 'guide' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-slate-300 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">
                    1-Click Flashing & Automated Cloud Builds
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Flash the single factory image or build and push with GitHub Actions.
                  </p>
                </div>
                <button
                  onClick={() => setIsMergedBinModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shrink-0"
                >
                  <Zap className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Get merged.bin (@ 0x0)</span>
                </button>
              </div>

              {/* 3 Step Workflow */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                    1
                  </span>
                  <h4 className="font-bold text-slate-200 text-xs">Single Flash (merged.bin)</h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Flash at offset <code className="text-emerald-400 font-mono">0x0</code> using Chrome WebSerial or <code className="text-emerald-400 font-mono">esptool.py</code>. Contains bootloader, partitions, OTA data, and app!
                  </p>
                </div>

                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                    2
                  </span>
                  <h4 className="font-bold text-slate-200 text-xs">Push to GitHub</h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Use our 1-click modal or <code className="text-emerald-400 font-mono">gh repo create --source=. --push</code> to host code on your personal repository.
                  </p>
                </div>

                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                    3
                  </span>
                  <h4 className="font-bold text-slate-200 text-xs">Automated Cloud Builds</h4>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    GitHub Actions automatically compiles via PlatformIO and generates <code className="text-emerald-400 font-mono">merged.bin</code> as a downloadable artifact.
                  </p>
                </div>
              </div>

              {/* Local CLI Command Block */}
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <p className="font-mono text-[11px] text-slate-300 font-semibold flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  Local Terminal Commands:
                </p>
                <pre className="p-2.5 bg-slate-950 rounded-lg text-emerald-400 font-mono text-[10px] overflow-x-auto leading-relaxed">
{`# 1-Line flash with esptool.py (starts at 0x0)
esptool.py --chip esp32s3 -p /dev/ttyACM0 -b 921600 write_flash 0x0 ${config.projectName}-factory-merged.bin

# Or build & upload with PlatformIO (scripts/merge_bin.py runs automatically)
pio run -e esp32-s3-n16r8 -t upload`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <MergedBinModal
        isOpen={isMergedBinModalOpen}
        onClose={() => setIsMergedBinModalOpen(false)}
        config={config}
        scheme={activePartitionScheme}
        onOpenGitHubModal={() => {
          setIsMergedBinModalOpen(false);
          setIsGitHubModalOpen(true);
        }}
      />

      <GitHubPublishModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
        config={config}
        files={generatedFiles}
      />

      <BootLogSimulator
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        config={config}
        partitionScheme={activePartitionScheme}
      />
    </div>
  );
}
