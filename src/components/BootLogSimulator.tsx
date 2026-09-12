import React, { useState, useEffect, useRef } from 'react';
import { ProjectConfig } from '../types';
import { Terminal, Play, RotateCcw, Copy, Check, ShieldCheck, Zap } from 'lucide-react';

interface BootLogSimulatorProps {
  config: ProjectConfig;
  isOpen: boolean;
  onClose: () => void;
}

export const BootLogSimulator: React.FC<BootLogSimulatorProps> = ({ config, isOpen, onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [copied, setCopied] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const generateBootSequence = (): string[] => {
    return [
      'ESP-ROM:esp32s3-20210327',
      'Build:Mar 27 2021',
      'rst:0x1 (POWERON),boot:0x8 (SPI_FAST_FLASH_BOOT)',
      `SPIWP:0xee`,
      `mode:${config.flashMode.toUpperCase()}, clock div:1 (80MHz)`,
      'load:0x3fce3808,len:0x44c',
      'load:0x403c9700,len:0xbd8',
      'load:0x403cc700,len:0x2a0c',
      'entry 0x403c98d4',
      '[     4][I][esp32-hal-psram.c:96] psramInit(): PSRAM enabled (Octal SPI OPI)',
      `[    18][I][esp32-hal-psram.c:98] psramInit(): PSRAM Size: 8388608 bytes (8 MB)`,
      `[    25][I][esp32-hal-cpu.c:75] setCpuFrequencyMhz(): PLL_CLK: 480 / 2 = 240 Mhz, APB_CLK: 80 Mhz`,
      '',
      '========================================',
      '    ESP32-S3 N16R8 Memory Diagnostic    ',
      '========================================',
      '  CPU Frequency:       240 MHz (Dual Xtensa LX7)',
      `  Flash Size:          16 MB (${config.flashMode.toUpperCase()})`,
      '  Internal Free Heap:  388 KB',
      '  Internal Min Free:   382 KB',
      '  8MB Octal PSRAM:     INITIALIZED OK',
      '  PSRAM Total Size:    8192 KB (8 MB)',
      '  PSRAM Free Memory:   8124 KB',
      '  PSRAM Min Free:      8124 KB',
      '========================================',
      '',
      ...(config.template === 'dlna-media-receiver' ? [
        `[I2S] DAC Initialized on BCLK:${config.audioSettings?.i2sBclkPin || 15}, LRC:${config.audioSettings?.i2sLrcPin || 16}, DOUT:${config.audioSettings?.i2sDoutPin || 17}`,
        `[AUDIO] Initialized 1024 KB stream ring buffer in 8MB Octal PSRAM`,
        `[AUDIO] 3-Band Tone Equalizer set: Bass: ${config.audioSettings?.eqBass || 0}dB, Mid: ${config.audioSettings?.eqMid || 0}dB, Treble: ${config.audioSettings?.eqTreble || 0}dB`,
        `[WIFI] Connected to Home WiFi! IP Address: 192.168.1.124`,
        `[mDNS] Responder active! Host: http://${config.audioSettings?.mDnsHost || 'esp32-audio'}.local`,
        `[HTTP] Material Design 3 Web Server listening on port 80`,
        `[DLNA] SSDP Multicast responder joined 239.255.255.250:1900`,
        `[DLNA] MediaRenderer active as "${config.audioSettings?.dlnaDeviceName || 'ESP32-S3 HiFi Streamer'}"`,
        `[OTA] Seamless ArduinoOTA listener started on port 3232`,
        `[FreeRTOS] Audio decode task pinned to Core 1 with priority 5`,
        `[READY] System listening for DLNA casting, Web streaming, and OTA updates!`
      ] : [
        '>>> Starting 8MB Octal PSRAM Read/Write Benchmark...',
        'Allocating 2 MB test chunk in PSRAM...',
        '  [RESULT] Write speed: 38.42 MB/s (54631 us)',
        '  [RESULT] Read speed:  42.15 MB/s (49798 us)',
        '  [VERIFY] Data Integrity: PASSED (100% matched)',
        '  Free PSRAM after test: 8124 KB',
        '',
        config.template === 'wifi-webserver'
          ? `[WIFI] Access Point started! SSID: ${config.wifiSsid || 'ESP32S3_AP'} | IP: http://192.168.4.1`
          : `[SYS] Main loop active. Status LED pulsing on GPIO ${config.rgbLedPin}.`
      ]),
      '[Heartbeat #1] Uptime: 3 s | Free PSRAM: 7100 KB | Free Heap: 388 KB | Temp: 37.8 C',
      '[Heartbeat #2] Uptime: 6 s | Free PSRAM: 7100 KB | Free Heap: 388 KB | Temp: 38.1 C'
    ];
  };

  useEffect(() => {
    if (!isOpen) return;
    setLogs([]);
    const sequence = generateBootSequence();
    let currentIdx = 0;

    const interval = setInterval(() => {
      if (currentIdx < sequence.length) {
        const line = sequence[currentIdx];
        setLogs(prev => [...prev, line]);
        currentIdx++;
      } else {
        clearInterval(interval);
      }
    }, 90);

    return () => clearInterval(interval);
  }, [isOpen, config]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!isOpen) return null;

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const restartMCU = () => {
    setLogs([]);
    const sequence = generateBootSequence();
    let currentIdx = 0;
    const interval = setInterval(() => {
      if (currentIdx < sequence.length) {
        const line = sequence[currentIdx];
        setLogs(prev => [...prev, line]);
        currentIdx++;
      } else {
        clearInterval(interval);
      }
    }, 70);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Terminal Header */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono font-bold text-white">
              ESP32-S3 Serial Monitor (115200 baud)
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Connected: /dev/ttyACM0 (Native USB CDC)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={restartMCU}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Reset MCU"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset MCU</span>
            </button>

            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Copy Output"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white px-2 py-1 text-xs rounded hover:bg-slate-800 transition"
            >
              Close
            </button>
          </div>
        </div>

        {/* Console Log Area */}
        <div className="p-4 bg-slate-950 overflow-y-auto flex-1 font-mono text-[11px] leading-5 text-emerald-400/90 space-y-0.5 select-text">
          {logs.map((log, i) => {
            const isWarn = log.includes('WARNING') || log.includes('ERR');
            const isHeader = log.includes('===');
            const isDivider = log.includes('***');
            const isHighlight = log.includes('Octal PSRAM') || log.includes('INITIALIZED OK') || log.includes('Flash Size');

            let lineClass = 'text-emerald-400/90';
            if (isWarn) lineClass = 'text-red-400 font-bold';
            else if (isHeader || isDivider) lineClass = 'text-slate-500';
            else if (isHighlight) lineClass = 'text-cyan-300 font-bold';

            return (
              <div key={i} className={lineClass}>
                {log || <span className="opacity-0">.</span>}
              </div>
            );
          })}
          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Footer */}
        <div className="bg-slate-900/80 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Target: ESP32-S3 N16R8 • 240MHz • USB-CDC</span>
          </div>
          <span className="font-mono">8MB OPI PSRAM verified • 16MB Flash verified</span>
        </div>
      </div>
    </div>
  );
};
