import React from 'react';
import { ProjectConfig, TemplateId, BoardType } from '../types';
import { PARTITION_SCHEMES } from '../data/partitions';
import { 
  Settings, 
  Cpu, 
  Layers, 
  Wifi, 
  GitBranch, 
  Sparkles, 
  Check, 
  Sliders,
  ShieldAlert
} from 'lucide-react';

interface ProjectConfiguratorProps {
  config: ProjectConfig;
  onChange: (newConfig: ProjectConfig) => void;
}

const TEMPLATES: { id: TemplateId; title: string; desc: string; badge: string }[] = [
  {
    id: 'dlna-media-receiver',
    title: 'DLNA UPnP Receiver & Material UI Web Player',
    desc: 'Material 3 Web App at .local, DLNA UPnP receiver always ready for BubbleUPnP/Windows Cast, HTTP stream input, 3-Band Tone EQ, and wireless OTA base.',
    badge: 'Flagship Audio'
  },
  {
    id: 'psram-benchmark',
    title: 'Hardware & 8MB PSRAM Diagnostic',
    desc: 'Runs memory read/write speed test on Octal PSRAM, validates 16MB Flash, CPU 240MHz, and thermals.',
    badge: 'Recommended'
  },
  {
    id: 'wifi-webserver',
    title: 'Async Web Server & Telemetry Portal',
    desc: 'Allocates a 512KB response cache in PSRAM, starts WiFi AP/STA, and serves a modern responsive dashboard.',
    badge: 'IoT Ready'
  },
  {
    id: 'freertos-dualcore',
    title: 'Dual-Core FreeRTOS Pipeline',
    desc: 'Pins real-time computation to Core 1 and network tasks to Core 0 with thread-safe FreeRTOS queues.',
    badge: 'Multi-threaded'
  },
  {
    id: 'tinyml-edge-ai',
    title: 'Edge AI / TinyML 4MB Tensor Arena',
    desc: 'Configures SIMD vector instructions and allocates 4MB model arena in PSRAM for deep learning models.',
    badge: 'Machine Learning'
  },
  {
    id: 'usb-serial-logger',
    title: 'Native USB-OTG & LittleFS Datalogger',
    desc: 'High-speed native USB CDC serial data acquisition logging sensor streams to 16MB Flash filesystem.',
    badge: 'USB High-Speed'
  }
];

export const ProjectConfigurator: React.FC<ProjectConfiguratorProps> = ({ config, onChange }) => {
  const handleBoardChange = (board: BoardType) => {
    let rgbLedPin = 48;
    if (board === 'waveshare-esp32s3-zero') rgbLedPin = 21;
    else if (board === 'lilygo-tdisplay-s3' || board === 'xiao-esp32s3-sense') rgbLedPin = 38;

    onChange({
      ...config,
      board,
      rgbLedPin
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Project & Hardware Configuration
          </h2>
        </div>
        <span className="text-xs text-slate-400 font-mono">ESP32-S3-WROOM-1-N16R8</span>
      </div>

      {/* Row 1: Project Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            GitHub Repository Name
          </label>
          <input
            type="text"
            value={config.projectName}
            onChange={(e) => onChange({ ...config, projectName: e.target.value })}
            placeholder="esp32s3-n16r8-starter"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Author / GitHub Username
          </label>
          <input
            type="text"
            value={config.author}
            onChange={(e) => onChange({ ...config, author: e.target.value })}
            placeholder="gazi-amir7"
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Hardware Board Target
          </label>
          <select
            value={config.board}
            onChange={(e) => handleBoardChange(e.target.value as BoardType)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="devkitc-1-n16r8">ESP32-S3-DevKitC-1-N16R8 (Standard 44-pin)</option>
            <option value="xiao-esp32s3-sense">Seeed Studio XIAO ESP32-S3</option>
            <option value="waveshare-esp32s3-zero">Waveshare ESP32-S3-Zero (Mini)</option>
            <option value="lilygo-tdisplay-s3">LilyGO T-Display S3</option>
          </select>
        </div>
      </div>

      {/* Row 2: Template Selection */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-2">
          Firmware Application Template
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map((tmpl) => {
            const isSelected = config.template === tmpl.id;
            return (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => onChange({ ...config, template: tmpl.id })}
                className={`p-3 rounded-lg text-left border transition relative flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-800/90 border-emerald-500/80 shadow-md shadow-emerald-950/30'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {tmpl.title}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-semibold border border-slate-700 shrink-0">
                      {tmpl.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    {tmpl.desc}
                  </p>
                </div>
                {isSelected && (
                  <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check className="w-3 h-3" /> Selected Template
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 3: 16MB Partition Scheme */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-2">
          16MB Flash Partition Scheme
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PARTITION_SCHEMES.map((scheme) => {
            const isSelected = config.partitionSchemeId === scheme.id;
            return (
              <button
                key={scheme.id}
                type="button"
                onClick={() => onChange({ ...config, partitionSchemeId: scheme.id })}
                className={`p-3 rounded-lg text-left border transition ${
                  isSelected
                    ? 'bg-slate-800/90 border-blue-500/80 text-white'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{scheme.name.split('(')[0]}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  {scheme.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 4: Audio Streamer Settings (Shown when DLNA Receiver is selected) */}
      {config.template === 'dlna-media-receiver' && (
        <div className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Audio Streamer & DLNA Network Settings
              </h3>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">
              http://{config.audioSettings?.mDnsHost || 'esp32-audio'}.local
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                mDNS Hostname (.local)
              </label>
              <input
                type="text"
                value={config.audioSettings?.mDnsHost || 'esp32-audio'}
                onChange={(e) => onChange({
                  ...config,
                  audioSettings: {
                    ...config.audioSettings,
                    mDnsHost: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                  }
                })}
                placeholder="esp32-audio"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                DLNA Friendly Name
              </label>
              <input
                type="text"
                value={config.audioSettings?.dlnaDeviceName || 'ESP32-S3 HiFi Streamer'}
                onChange={(e) => onChange({
                  ...config,
                  audioSettings: {
                    ...config.audioSettings,
                    dlnaDeviceName: e.target.value
                  }
                })}
                placeholder="ESP32-S3 HiFi Streamer"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                I2S DAC Output Pins
              </label>
              <div className="grid grid-cols-3 gap-1 text-center font-mono text-xs">
                <div className="bg-slate-900 border border-slate-700 rounded py-1 text-emerald-400" title="BCLK (Bit Clock)">
                  BCLK: {config.audioSettings?.i2sBclkPin || 15}
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded py-1 text-emerald-400" title="LRC (Word Select)">
                  LRC: {config.audioSettings?.i2sLrcPin || 16}
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded py-1 text-emerald-400" title="DOUT (Data)">
                  DIN: {config.audioSettings?.i2sDoutPin || 17}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Default Startup Volume
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.audioSettings?.defaultVolume || 65}
                  onChange={(e) => onChange({
                    ...config,
                    audioSettings: {
                      ...config.audioSettings,
                      defaultVolume: Number(e.target.value)
                    }
                  })}
                  className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-300 w-8 text-right">
                  {config.audioSettings?.defaultVolume || 65}%
                </span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800">
            <span className="text-emerald-400 font-semibold">Protected Hardware Rule:</span>
            Audio I2S uses GPIO 15, 16, 17. Pins GPIO 33-37 remain strictly isolated for the 8MB Octal PSRAM ring buffer.
          </div>
        </div>
      )}

      {/* Row 5: Hardware Flags & Peripheral Toggles */}
      <div className="pt-2 border-t border-slate-800">
        <label className="block text-xs font-semibold text-slate-300 mb-2">
          Hardware & Build Flags
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* USB CDC */}
          <label className="flex items-center gap-2 p-2.5 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700 transition">
            <input
              type="checkbox"
              checked={config.enableUsbCdc}
              onChange={(e) => onChange({ ...config, enableUsbCdc: e.target.checked })}
              className="rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-900"
            />
            <div>
              <span className="font-semibold text-slate-200 block text-xs">Native USB-CDC Serial</span>
              <span className="text-[10px] text-slate-400">DARDUINO_USB_CDC_ON_BOOT</span>
            </div>
          </label>

          {/* Octal PSRAM Mode */}
          <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
            <span className="font-semibold text-slate-200 block text-xs">8MB Octal PSRAM</span>
            <span className="text-[10px] text-emerald-400 font-mono">OPI Mode @ {config.psramFreq} (OPI_OPI)</span>
          </div>

          {/* Flash Mode */}
          <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-200 block text-xs">16MB Flash Mode</span>
              <span className="text-[10px] text-slate-400">Quad or Octal SPI</span>
            </div>
            <select
              value={config.flashMode}
              onChange={(e) => onChange({ ...config, flashMode: e.target.value as 'qio' | 'opi' })}
              className="bg-slate-900 border border-slate-700 text-xs text-white rounded px-2 py-1"
            >
              <option value="qio">QIO (Quad)</option>
              <option value="opi">OPI (Octal)</option>
            </select>
          </div>

          {/* GitHub Actions CI */}
          <label className="flex items-center gap-2 p-2.5 bg-slate-950 rounded-lg border border-slate-800 cursor-pointer hover:border-slate-700 transition">
            <input
              type="checkbox"
              checked={config.includeGitHubWorkflow}
              onChange={(e) => onChange({ ...config, includeGitHubWorkflow: e.target.checked })}
              className="rounded border-slate-700 text-emerald-500 focus:ring-0 bg-slate-900"
            />
            <div>
              <span className="font-semibold text-slate-200 block text-xs">GitHub Actions CI/CD</span>
              <span className="text-[10px] text-slate-400">.github/workflows/ci.yml</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
