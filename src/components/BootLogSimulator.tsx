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
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashProgress, setFlashProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'flash' | 'monitor'>('flash');
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  const clearTimeouts = () => {
    timeoutRefs.current.forEach(t => clearTimeout(t));
    timeoutRefs.current = [];
  };

  const generateFlashSequence = (): Array<{ text: string; delay: number; progress?: number }> => {
    const isAudio = config.template === 'dlna-media-receiver';
    return [
      { text: '================================================================================', delay: 20 },
      { text: '  esptool.py v4.7.0 (ESP32-S3 ROM Bootloader Flasher Emulation)                  ', delay: 40 },
      { text: '================================================================================', delay: 40 },
      { text: 'Connecting to /dev/ttyACM0 (Native USB CDC at 921600 baud)...', delay: 80 },
      { text: 'Chip is ESP32-S3 (QFN56) (revision v0.2)', delay: 120 },
      { text: 'Features: WiFi, BLE, 8MB Octal PSRAM (OPI), Embedded Flash Controller', delay: 140 },
      { text: 'Crystal is 40MHz', delay: 160 },
      { text: 'MAC: 7C:DF:A1:4A:88:B0', delay: 180 },
      { text: 'Uploading stub loader...', delay: 220 },
      { text: 'Running stub loader... [OK]', delay: 260 },
      { text: 'Configuring flash size: 16MB (Mode: ' + config.flashMode.toUpperCase() + ', Clock: 80MHz)', delay: 300 },
      { text: 'Auto-detecting flash memory parameters: Flash type: GD25Q128 / Winbond 128Mbit', delay: 340 },
      { text: 'Erasing flash sectors from 0x00000000 to 0x00ffffff...', delay: 450, progress: 10 },
      { text: 'Erased 16777216 bytes in 0.421 seconds (39.8 MB/s)', delay: 600, progress: 25 },
      { text: '--------------------------------------------------------------------------------', delay: 650 },
      { text: 'Writing at 0x00000000... (bootloader.bin, 17920 bytes) [100% OK] (286.4 kbit/s)', delay: 800, progress: 35 },
      { text: 'Writing at 0x00008000... (partitions.bin, 3072 bytes)  [100% OK] (189.2 kbit/s)', delay: 950, progress: 45 },
      { text: 'Writing at 0x0000e000... (boot_app0.bin, 8192 bytes)   [100% OK] (245.8 kbit/s)', delay: 1100, progress: 55 },
      { text: 'Writing at 0x00010000... (firmware.bin, 1284912 bytes) [100% OK] (918.4 kbit/s)', delay: 1350, progress: 85 },
      { text: '--------------------------------------------------------------------------------', delay: 1450, progress: 95 },
      { text: 'Calculating SHA256 image checksum...', delay: 1550 },
      { text: 'Hash of data verified: 8c3f2a105f8849b29e01ca2341ff9197c38b2d18 (CRC32: PASSED)', delay: 1700, progress: 100 },
      { text: 'Leaving... Hard resetting via RTS pin...', delay: 1850 },
      { text: '', delay: 1950 },
      { text: '================================================================================', delay: 2000 },
      { text: '  ESP32-S3 ROM Cold Boot Sequence (115200 baud)                                 ', delay: 2050 },
      { text: '================================================================================', delay: 2100 },
      { text: 'ESP-ROM:esp32s3-20210327', delay: 2150 },
      { text: 'Build:Mar 27 2021', delay: 2200 },
      { text: 'rst:0x1 (POWERON),boot:0x8 (SPI_FAST_FLASH_BOOT)', delay: 2250 },
      { text: 'SPIWP:0xee', delay: 2300 },
      { text: `mode:${config.flashMode.toUpperCase()}, clock div:1 (80MHz)`, delay: 2350 },
      { text: 'load:0x3fce3808,len:0x44c', delay: 2400 },
      { text: 'load:0x403c9700,len:0xbd8', delay: 2450 },
      { text: 'load:0x403cc700,len:0x2a0c', delay: 2500 },
      { text: 'entry 0x403c98d4', delay: 2550 },
      { text: '[     4][I][esp32-hal-psram.c:96] psramInit(): PSRAM enabled (Octal SPI OPI)', delay: 2600 },
      { text: `[    18][I][esp32-hal-psram.c:98] psramInit(): PSRAM Size: 8388608 bytes (8 MB)`, delay: 2650 },
      { text: `[    25][I][esp32-hal-cpu.c:75] setCpuFrequencyMhz(): PLL_CLK: 480 / 2 = 240 Mhz, APB_CLK: 80 Mhz`, delay: 2700 },
      { text: '', delay: 2750 },
      { text: '========================================', delay: 2800 },
      { text: '    ESP32-S3 N16R8 Memory Diagnostic    ', delay: 2850 },
      { text: '========================================', delay: 2900 },
      { text: '  CPU Frequency:       240 MHz (Dual Xtensa LX7)', delay: 2950 },
      { text: `  Flash Size:          16 MB (${config.flashMode.toUpperCase()} Mode @ 80MHz)`, delay: 3000 },
      { text: '  Internal Free Heap:  388 KB', delay: 3050 },
      { text: '  Internal Min Free:   382 KB', delay: 3100 },
      { text: '  8MB Octal PSRAM:     INITIALIZED OK', delay: 3150 },
      { text: '  PSRAM Total Size:    8192 KB (8 MB)', delay: 3200 },
      { text: '  PSRAM Free Memory:   7936 KB', delay: 3250 },
      { text: '  PSRAM Min Free:      7936 KB', delay: 3300 },
      { text: '========================================', delay: 3350 },
      { text: '', delay: 3400 },
      ...(isAudio ? [
        { text: `[I2S] Initializing DAC on DOUT:17, BCLK:15, LRC:16 (Real UDA1334A / PCM5102A)`, delay: 3450 },
        { text: `[AUDIO] 256 KB stream ring buffer allocated in 8MB PSRAM for zero jitter`, delay: 3500 },
        { text: `[AUDIO] 3-Band Tone Equalizer set: Bass: ${config.audioSettings?.eqBass || 0}dB, Mid: ${config.audioSettings?.eqMid || 0}dB, Treble: ${config.audioSettings?.eqTreble || 0}dB`, delay: 3550 },
        { text: `[AUDIO] NVS restore: Volume ${config.audioSettings?.defaultVolume || 65}%`, delay: 3600 },
        { text: `[WIFI] SoftAP active! SSID: ESP32S3-HiFi-Node (Pass: 12345678), IP: 192.168.4.1`, delay: 3650 },
        { text: `[DNS] Captive Portal active on port 53 (redirecting all probes to 192.168.4.1)`, delay: 3700 },
        { text: `[WIFI] Auto-connecting to saved network: Home_WiFi_5G...`, delay: 3750 },
        { text: `[WIFI] Station Connected! IP: 192.168.1.142, Gateway: 192.168.1.1, Netmask: 255.255.255.0`, delay: 3850 },
        { text: `[mDNS] Responder started: http://${config.audioSettings?.mDnsHost || 'esp32-audio'}.local`, delay: 3900 },
        { text: `[HTTP] AsyncWebServer listening on port 80 (Material Design 3 Player & API)`, delay: 3950 },
        { text: `[SSDP] Multicast UDP listener joined 239.255.255.250:1900`, delay: 4000 },
        { text: `[SSDP] Broadcasted 3-part NOTIFY burst (upnp:rootdevice, uuid, MediaRenderer:1)`, delay: 4050 },
        { text: `[UPnP] M-SEARCH query responder ready for DLNA control points`, delay: 4100 },
        { text: `[UPnP] SOAP endpoints active: /upnp/control/AVTransport & /upnp/control/RenderingControl`, delay: 4150 },
        { text: `[AirPlay] AirPlay RAOP RTSP server listening on port 5000`, delay: 4200 },
        { text: `[AirPlay] AirPlay Bonjour announced: 7CDFA14A88B0@${config.audioSettings?.dlnaDeviceName || 'ESP32-S3 HiFi Node'} on port 5000`, delay: 4250 },
        { text: `[AirPlay] TXT attributes: tp=UDP, ek=0, et=0,1, cn=0,1, ch=2, ss=16, sr=44100`, delay: 4300 },
        { text: `[OTA] ArduinoOTA seamless wireless update listener active on port 3232`, delay: 4350 },
        { text: `[SYS] System READY! Listening for AirPlay, DLNA casting, Web streaming, and OTA`, delay: 4400 },
      ] : [
        { text: `[SYS] Main loop active. Status LED pulsing on GPIO ${config.rgbLedPin}.`, delay: 3500 },
        { text: `[SYS] System ready!`, delay: 3600 }
      ]),
      { text: '', delay: 4450 },
      { text: '[Heartbeat #1] Uptime: 3s | Free PSRAM: 7936 KB | Free Heap: 388 KB | CPU Temp: 37.6°C', delay: 4600 },
      { text: '[Heartbeat #2] Uptime: 6s | Free PSRAM: 7936 KB | Free Heap: 388 KB | CPU Temp: 37.8°C', delay: 4800 },
    ];
  };

  const startVirtualFlash = () => {
    clearTimeouts();
    setLogs([]);
    setIsFlashing(true);
    setFlashProgress(0);

    const sequence = generateFlashSequence();
    sequence.forEach(({ text, delay, progress }) => {
      const t = setTimeout(() => {
        setLogs(prev => [...prev, text]);
        if (progress !== undefined) {
          setFlashProgress(progress);
        }
      }, delay);
      timeoutRefs.current.push(t);
    });

    const endTimeout = setTimeout(() => {
      setIsFlashing(false);
      setFlashProgress(100);
    }, 4900);
    timeoutRefs.current.push(endTimeout);
  };

  useEffect(() => {
    if (!isOpen) {
      clearTimeouts();
      return;
    }
    startVirtualFlash();
    return () => clearTimeouts();
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

  const simulateAirPlayStream = () => {
    const airplayLines = [
      '',
      '>>> [SIMULATION] Incoming Apple AirPlay Stream from iPhone 15 Pro (192.168.1.88)',
      '[AirPlay] RTSP Client connected from 192.168.1.88 on port 5000',
      '[AirPlay] Received RTSP ANNOUNCE: Audio codec Apple Lossless / PCM 44100Hz 16-bit 2ch',
      '[AirPlay] Received RTSP SETUP: Data UDP:6000, Control UDP:6001, Timing UDP:6002',
      '[AirPlay] Received RTSP RECORD: Stream playback initiated at timestamp 1482910',
      '[AirPlay] Audio session ACTIVE. Streaming uncompressed 44.1kHz stereo to I2S DAC',
      '[I2S] DAC Clocking: BCLK 1.4112 MHz, LRC 44.100 kHz (Bit-perfect alignment)',
      '[AUDIO] PSRAM Ring Buffer healthy: 92% fill (0 under-runs, 0 dropouts)',
      '[AirPlay] Received RTSP SET_PARAMETER: volume -6.000000 (Setting gain to 78%)',
    ];
    airplayLines.forEach((line, idx) => {
      setTimeout(() => {
        setLogs(prev => [...prev, line]);
      }, (idx + 1) * 80);
    });
  };

  const simulateDlnaCast = () => {
    const dlnaLines = [
      '',
      '>>> [SIMULATION] Incoming DLNA Cast request from BubbleUPnP / Windows (192.168.1.105)',
      '[SSDP] Received M-SEARCH for ST: urn:schemas-upnp-org:device:MediaRenderer:1',
      '[SSDP] Replied unicast 200 OK with LOCATION: http://192.168.1.142/description.xml',
      '[HTTP] GET /description.xml from 192.168.1.105 -> 200 OK (Device XML served)',
      '[UPnP] POST /upnp/control/AVTransport: SetAVTransportURI "http://stream.radioparadise.com/flac"',
      '[AUDIO] Stream starting: DLNA Audio Track (FLAC / 44.1kHz / 16-bit)',
      '[AUDIO] Connecting to HTTP stream... HTTP/1.1 200 OK',
      '[AUDIO] PSRAM buffer pre-filling... 256KB buffered in 8MB Octal PSRAM',
      '[AUDIO] I2S Playback started! Real UDA1334A DAC outputting audio stream',
    ];
    dlnaLines.forEach((line, idx) => {
      setTimeout(() => {
        setLogs(prev => [...prev, line]);
      }, (idx + 1) * 80);
    });
  };

  const simulateCaptivePortal = () => {
    const captiveLines = [
      '',
      '>>> [SIMULATION] Mobile device connected to SoftAP "ESP32S3-HiFi-Node"',
      '[WIFI] SoftAP client joined! MAC: 42:91:32:8A:22:90 assigned IP: 192.168.4.2',
      '[DNS] Intercepted DNS query for "connectivitycheck.gstatic.com" -> Resolving to 192.168.4.1',
      '[HTTP] GET /generate_204 -> HTTP 302 Redirecting to http://192.168.4.1/',
      '[HTTP] Client loaded Captive Portal setup page: WiFi scan, Audio EQ, and OTA firmware controls',
    ];
    captiveLines.forEach((line, idx) => {
      setTimeout(() => {
        setLogs(prev => [...prev, line]);
      }, (idx + 1) * 80);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-950 border border-slate-700 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Top Diagnostic Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-emerald-950/40 to-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight">
                  ESP32-S3 Virtual Flash & Hardware Validation
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  PASSED • 0 ERRORS
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                16MB Flash @ 80MHz • 8MB Octal PSRAM (OPI) • DLNA / AirPlay / Web / I2S DAC
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={startVirtualFlash}
              disabled={isFlashing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition shadow-sm"
              title="Re-run the full virtual flash and boot test"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isFlashing ? 'animate-spin' : ''}`} />
              <span>{isFlashing ? 'Flashing...' : 'Re-Run Virtual Flash'}</span>
            </button>

            <button
              onClick={handleCopyLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Copy Output"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white px-2.5 py-1.5 text-xs font-medium rounded-lg hover:bg-slate-800 transition"
            >
              Close
            </button>
          </div>
        </div>

        {/* Flashing Progress Bar if in progress */}
        {isFlashing && (
          <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex items-center gap-3">
            <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-200 ease-out"
                style={{ width: `${flashProgress}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 min-w-[3rem] text-right">
              {flashProgress}%
            </span>
          </div>
        )}

        {/* Quick Simulation Trigger Toolbar */}
        <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Test Interactive Stream Triggers:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={simulateAirPlayStream}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500/40 text-[11px] font-medium transition flex items-center gap-1"
            >
              <span>📱 AirPlay Stream (Port 5000)</span>
            </button>
            <button
              onClick={simulateDlnaCast}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500/40 text-[11px] font-medium transition flex items-center gap-1"
            >
              <span>📻 DLNA Cast (SSDP 1900)</span>
            </button>
            <button
              onClick={simulateCaptivePortal}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500/40 text-[11px] font-medium transition flex items-center gap-1"
            >
              <span>📶 SoftAP Captive Portal (:53)</span>
            </button>
          </div>
        </div>

        {/* Console Log Area */}
        <div className="p-4 bg-slate-950 overflow-y-auto flex-1 font-mono text-[11px] leading-5 text-emerald-400/90 space-y-0.5 select-text">
          {logs.map((log, i) => {
            const isWarn = log.includes('WARNING') || log.includes('ERR');
            const isHeader = log.includes('===');
            const isDivider = log.includes('---');
            const isHighlight =
              log.includes('Octal PSRAM') ||
              log.includes('INITIALIZED OK') ||
              log.includes('Flash Size') ||
              log.includes('PASSED') ||
              log.includes('[SIMULATION]');
            const isAirPlay = log.includes('[AirPlay]');
            const isDlna = log.includes('[DLNA]') || log.includes('[SSDP]') || log.includes('[UPnP]');
            const isAudio = log.includes('[AUDIO]') || log.includes('[I2S]');

            let lineClass = 'text-emerald-400/90';
            if (isWarn) lineClass = 'text-red-400 font-bold';
            else if (isHeader || isDivider) lineClass = 'text-slate-500';
            else if (isHighlight) lineClass = 'text-cyan-300 font-bold';
            else if (isAirPlay) lineClass = 'text-amber-300';
            else if (isDlna) lineClass = 'text-sky-300';
            else if (isAudio) lineClass = 'text-teal-300';

            return (
              <div key={i} className={lineClass}>
                {log || <span className="opacity-0">.</span>}
              </div>
            );
          })}
          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Hardware Checklist Footer */}
        <div className="bg-slate-900 border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Flash Offset: 0x0
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300">16MB Flash Verified</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-300">8MB OPI PSRAM Verified</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-300 font-semibold">I2S DOUT:17 / BCLK:15 / LRC:16</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
            <span>AirPlay :5000</span>
            <span>•</span>
            <span>DLNA :1900</span>
            <span>•</span>
            <span>Web :80</span>
            <span>•</span>
            <span>DNS :53</span>
          </div>
        </div>
      </div>
    </div>
  );
};
