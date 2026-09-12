import React, { useState } from 'react';
import { ProjectConfig, PartitionScheme } from '../types';
import { PARTITION_SCHEMES } from '../data/partitions';
import { downloadMergedBin, generateMergedBinBuffer, MergedBinInfo } from '../utils/mergedBinGenerator';
import { 
  Download, 
  X, 
  Check, 
  Copy, 
  Cpu, 
  Layers, 
  Zap, 
  ExternalLink, 
  Terminal, 
  HelpCircle, 
  CheckCircle2,
  HardDrive,
  FileCode,
  ShieldCheck,
  Usb,
  AlertTriangle,
  Github,
  Sparkles,
  Cloud
} from 'lucide-react';

interface MergedBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ProjectConfig;
  scheme?: PartitionScheme;
  onOpenGitHubModal?: () => void;
}

export const MergedBinModal: React.FC<MergedBinModalProps> = ({
  isOpen,
  onClose,
  config,
  scheme: providedScheme,
  onOpenGitHubModal
}) => {
  const scheme = providedScheme || PARTITION_SCHEMES.find(s => s.id === config.partitionSchemeId) || PARTITION_SCHEMES[0];
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<MergedBinInfo | null>(null);
  const [selectedPort, setSelectedPort] = useState<string>('/dev/ttyACM0');

  const otaDataEntry = scheme.entries.find(e => e.name === 'otadata' || e.subtype === 'ota');
  const app0Entry = scheme.entries.find(e => e.name === 'app0' || e.subtype === 'ota_0' || e.subtype === 'factory');
  const otaDataOffset = otaDataEntry ? otaDataEntry.offset : '0x0F000';
  const app0Offset = app0Entry ? app0Entry.offset : '0x20000';

  if (!isOpen) return null;

  const handleDownload = () => {
    const info = downloadMergedBin(config, scheme);
    setDownloadSuccess(info);
    setTimeout(() => {
      setDownloadSuccess(null);
    }, 4000);
  };

  const esptoolCommand = `esptool.py --chip esp32s3 -p ${selectedPort} -b 921600 write_flash 0x0 ${config.projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'esp32s3-n16r8'}-factory-merged.bin`;

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(esptoolCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div 
        id="merged-bin-modal"
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-8"
      >
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-500/20">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  ESP32-S3 Factory <code className="text-emerald-400 font-mono text-sm">merged.bin</code>
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Single Flash @ 0x0000
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                All-in-one factory image combining Bootloader, Partition Table, OTA Data, and Application
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Main Download Callout Banner */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-teal-950/40 border border-emerald-500/30 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Ready for Immediate Flashing
                </span>
                <h4 className="text-lg font-bold text-white mt-1">
                  Download Ready-to-Flash <span className="font-mono text-emerald-400">merged.bin</span>
                </h4>
                <p className="text-xs text-slate-300 mt-1 max-w-md">
                  No need to manually specify 4 flash offsets! Flash this single binary at address <code className="bg-slate-800 text-emerald-400 px-1 rounded font-mono">0x0</code> with Web Serial or esptool.
                </p>
              </div>

              <button
                id="btn-download-merged-bin"
                onClick={handleDownload}
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-950 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download merged.bin</span>
              </button>
            </div>

            {downloadSuccess && (
              <div className="mt-3 pt-3 border-t border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Downloaded <strong>{(downloadSuccess.totalBytes / (1024 * 1024)).toFixed(2)} MB</strong> factory image (Flash Offset: 0x0000).
                </span>
              </div>
            )}
          </div>

          {/* Flash Memory Map Breakdown */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              Inside this Single Binary (Offset Structure)
            </h4>

            <div className="border border-slate-800 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3 font-mono">Offset</th>
                    <th className="py-2 px-3">Segment Name</th>
                    <th className="py-2 px-3">Function / Content</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                  <tr>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">0x00000</td>
                    <td className="py-2.5 px-3 font-semibold text-white">Bootloader</td>
                    <td className="py-2.5 px-3 text-slate-300">ESP32-S3 2nd stage bootloader ({config.flashMode.toUpperCase()}, 80MHz)</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">Included</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">0x08000</td>
                    <td className="py-2.5 px-3 font-semibold text-white">Partition Table</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      All {scheme.entries.length} partitions: {scheme.entries.map(e => e.name).join(', ')} ({scheme.name})
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">Included</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">{otaDataOffset}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">OTA Data</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      Initial <code className="text-slate-200">boot_app0.bin</code> (pointer to boot slot app0)
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">Included</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">{app0Offset}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">Application (app0)</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {config.template === 'dlna-media-receiver' ? 'DLNA UPnP Player + Material 3 Web + I2S Audio' : 'ESP32-S3 N16R8 High-Perf Firmware'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">Included</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Partition breakdown chips */}
            <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-slate-400 mr-1">Partitions Defined:</span>
              {scheme.entries.map((entry) => (
                <span
                  key={entry.name}
                  className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/80 text-[10px] font-mono text-slate-300"
                  title={`${entry.name} (${entry.type}/${entry.subtype}) @ ${entry.offset} [${entry.size}]`}
                >
                  <strong className="text-emerald-400">{entry.name}</strong> @ {entry.offset}
                </span>
              ))}
            </div>
          </div>

          {/* Hardware Diagnostic & Boot Loop Help */}
          <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Fixing Boot Loop (ets_loader.c 78 / TG0WDT_SYS_RST) & Serial Port Errors</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              If your serial log shows <strong>Failed to open serial port</strong> or loops at <code className="text-amber-300 font-mono">ets_loader.c 78 (TG0WDT_SYS_RST)</code>:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] pl-1">
              <li>
                <strong>Stop the Reboot Loop:</strong> Hold down the <strong>BOOT</strong> button (GPIO 0), press and release the <strong>RST (EN)</strong> button, then release <strong>BOOT</strong>. The board will enter ROM Download Mode and stop resetting, letting the serial port open instantly.
              </li>
              <li>
                <strong>Real Firmware Compilation:</strong> Browser-synthesized files do not contain compiled Xtensa LX7 CPU machine code. Download the full project ZIP and run <code className="text-emerald-400 font-mono">pio run -t upload</code> so GCC compiles the real binary.
              </li>
              <li>
                <strong>Flash Mode:</strong> If using QIO causes flash timeouts, ensure your board supports DIO by setting <code className="text-emerald-400 font-mono">flash_mode = dio</code>.
              </li>
            </ol>
          </div>

          {/* Flash Method 1: Web Serial Browser Flashing (Chrome / Edge) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Usb className="w-4 h-4 text-emerald-400" />
                Option 1: 1-Click Flash in Chrome / Edge (WebSerial)
              </h4>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                No Python Required
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Connect your ESP32-S3 USB-C cable to your PC, open Espressif's official Web Flasher, pick <code className="text-emerald-400 font-mono">merged.bin</code> at address <code className="text-emerald-400 font-mono">0x0</code>, and click <strong>Program</strong>:
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href="https://espressif.github.io/esptool-js/"
                target="_blank"
                rel="noreferrer"
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
              >
                <span>Launch Espressif Web Flasher</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>

              <a
                href="https://adafruit.github.io/Adafruit_WebSerial_ESPTool/"
                target="_blank"
                rel="noreferrer"
                className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
              >
                <span>Adafruit WebSerial Flasher</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Flash Method 2: Command Line via esptool.py */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Option 2: Command Line with esptool.py
              </h4>

              {/* Port selector */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400 text-[11px]">Port:</span>
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none"
                >
                  <option value="/dev/ttyACM0">Linux: /dev/ttyACM0</option>
                  <option value="/dev/ttyUSB0">Linux: /dev/ttyUSB0</option>
                  <option value="COM3">Windows: COM3</option>
                  <option value="COM4">Windows: COM4</option>
                  <option value="/dev/cu.usbmodem14101">macOS: /dev/cu.usbmodem*</option>
                </select>
              </div>
            </div>

            <div className="relative group">
              <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-emerald-400 overflow-x-auto whitespace-pre">
                {esptoolCommand}
              </pre>
              <button
                onClick={handleCopyCmd}
                className="absolute right-2.5 top-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs flex items-center gap-1 transition"
                title="Copy Command"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCmd ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Flash Method 3: Cloud Build via GitHub Actions (No VS Code or PlatformIO needed!) */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-emerald-400" />
                    Option 3: Build in Cloud via GitHub Actions
                  </h4>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                    No VS Code / No Pio Required
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Don't have VS Code or PlatformIO installed on your computer? Push this project to GitHub, let GitHub Actions compile the real firmware in the cloud, and download the ready-to-flash <code className="text-emerald-400 font-mono">merged.bin</code>!
                </p>
              </div>

              {onOpenGitHubModal && (
                <button
                  type="button"
                  onClick={onOpenGitHubModal}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 shadow-lg shadow-emerald-950"
                >
                  <Github className="w-4 h-4 fill-current" />
                  <span>Push to GitHub & Build</span>
                </button>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 space-y-1.5 text-xs text-slate-300">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>3 Simple Steps (100% Free in Browser):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] pl-0.5">
                <li>Click <strong>Push to GitHub & Build</strong> above to push the code (or download the ZIP and upload to a GitHub repo).</li>
                <li>GitHub Actions automatically launches an Ubuntu cloud runner with PlatformIO and compiles the full C++ firmware in ~90 seconds.</li>
                <li>Open your repo's <strong>Actions</strong> tab, click the latest build, and download the <strong><code className="text-emerald-400 font-mono">{config.projectName}-factory-merged-bin</code></strong> artifact.</li>
                <li>Flash the unzipped <code className="text-emerald-400 font-mono">merged.bin</code> via <strong>Espressif Web Flasher</strong> (Option 1 above) at address <code className="text-emerald-400 font-mono">0x0</code>!</li>
              </ol>
            </div>
          </div>

          {/* Flash Method 4: Local PlatformIO (For developers with local toolchain) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-slate-400" />
              Option 4: Build Locally with PlatformIO CLI (Optional)
            </h4>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              If you have PlatformIO installed, you can also compile locally. <code className="text-slate-300 font-mono">scripts/merge_bin.py</code> will automatically assemble <code className="text-slate-200 font-mono">.pio/build/esp32-s3-n16r8/merged.bin</code>:
            </p>
            <div className="bg-slate-900 border border-slate-800 rounded p-2 font-mono text-emerald-400 text-[11px]">
              pio run -e esp32-s3-n16r8
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Target: <strong>ESP32-S3 N16R8</strong> (16MB Flash, 8MB Octal PSRAM)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
