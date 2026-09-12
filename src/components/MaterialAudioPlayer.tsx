import React, { useState } from 'react';
import { 
  Sliders, 
  Cast, 
  Airplay, 
  Wifi, 
  UploadCloud, 
  CheckCircle2, 
  Globe, 
  Music, 
  ExternalLink,
  Info,
  RefreshCw,
  Cpu,
  Zap,
  Check,
  Copy,
  Terminal,
  ShieldCheck,
  Smartphone,
  Laptop,
  Radio,
  Link as LinkIcon
} from 'lucide-react';
import { ProjectConfig } from '../types';
import { useAudioPlayer, EQ_PRESETS, EqPreset } from '../hooks/useAudioPlayer';
import { RADIO_PRESETS, RadioStation } from './TopMediaControlBar';

interface MaterialAudioPlayerProps {
  config: ProjectConfig;
  audio?: ReturnType<typeof useAudioPlayer>;
  onUpdateConfig?: (updated: Partial<ProjectConfig>) => void;
  onOpenMergedBinModal?: () => void;
}

export const MaterialAudioPlayer: React.FC<MaterialAudioPlayerProps> = ({ 
  config,
  audio: providedAudio,
  onOpenMergedBinModal
}) => {
  const fallbackAudio = useAudioPlayer(config);
  const audio = providedAudio || fallbackAudio;

  const mDnsHost = config.audioSettings?.mDnsHost || 'esp32-audio';
  const friendlyName = config.audioSettings?.dlnaDeviceName || 'ESP32-S3 HiFi Streamer';

  const [copiedCli, setCopiedCli] = useState(false);
  const [customInputUrl, setCustomInputUrl] = useState('');

  const esptoolCmd = `esptool.py --chip esp32s3 -p /dev/ttyACM0 -b 921600 write_flash 0x0 ${config.projectName}-factory-merged.bin`;

  const handleCopyEsptool = () => {
    navigator.clipboard.writeText(esptoolCmd);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const handleCustomStreamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInputUrl.trim()) {
      audio.playCustomUrl(customInputUrl.trim(), 'Custom HTTP Stream');
    }
  };

  return (
    <div id="material-audio-dashboard" className="space-y-4">
      {/* 4-Tile Modern Material 3 Bento Grid:
          TILE 1: 3-Band Tone Equalizer (Stand-alone)
          TILE 2: Direct HTTP Link Player & Web Streams (Separated from EQ)
          TILE 3: Wi-Fi, DLNA/UPnP & AirPlay Receiver (All in one place)
          TILE 4: Wireless WebOTA & 16MB Storage Studio
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* TILE 1: 3-Band Tone DSP Equalizer (Separated) */}
        <div className="bg-[#1d201d] border border-[#414942] rounded-3xl p-4 flex flex-col justify-between shadow-xl transition hover:border-[#80d49f]/40">
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#282b27]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#00522e] text-[#80d49f] flex items-center justify-center border border-[#80d49f]/30">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">3-Band Tone EQ</h3>
                  <p className="text-[10px] text-[#8a938b]">Hardware I2S DSP Tone</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#282b27] text-[#80d49f] border border-[#414942] font-bold">
                {audio.activePreset}
              </span>
            </div>

            {/* Sliders: Bass, Mid, Treble */}
            <div className="space-y-3">
              {/* Bass */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#c2c9bf] text-[11px] font-medium">Bass (Low Shelf)</span>
                  <span className="font-mono text-[#80d49f] text-xs font-bold">
                    {audio.bass > 0 ? `+${audio.bass}` : audio.bass} dB
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-16" 
                  max="16" 
                  value={audio.bass}
                  onChange={(e) => { audio.setBass(Number(e.target.value)); audio.setActivePreset('Custom'); }}
                  className="w-full h-1.5 bg-[#282b27] rounded-lg appearance-none cursor-pointer accent-[#80d49f]"
                />
              </div>

              {/* Mid */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#c2c9bf] text-[11px] font-medium">Midrange (Vocals)</span>
                  <span className="font-mono text-[#80d49f] text-xs font-bold">
                    {audio.mid > 0 ? `+${audio.mid}` : audio.mid} dB
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-16" 
                  max="16" 
                  value={audio.mid}
                  onChange={(e) => { audio.setMid(Number(e.target.value)); audio.setActivePreset('Custom'); }}
                  className="w-full h-1.5 bg-[#282b27] rounded-lg appearance-none cursor-pointer accent-[#80d49f]"
                />
              </div>

              {/* Treble */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#c2c9bf] text-[11px] font-medium">Treble (High Air)</span>
                  <span className="font-mono text-[#80d49f] text-xs font-bold">
                    {audio.treble > 0 ? `+${audio.treble}` : audio.treble} dB
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-16" 
                  max="16" 
                  value={audio.treble}
                  onChange={(e) => { audio.setTreble(Number(e.target.value)); audio.setActivePreset('Custom'); }}
                  className="w-full h-1.5 bg-[#282b27] rounded-lg appearance-none cursor-pointer accent-[#80d49f]"
                />
              </div>
            </div>

            {/* Presets Chips */}
            <div className="mt-3 pt-2.5 border-t border-[#282b27]">
              <span className="text-[10px] text-[#8a938b] uppercase tracking-wider block mb-1.5 font-bold">
                DSP Presets
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EQ_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => audio.applyEqPreset(preset)}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition ${
                      audio.activePreset === preset.name
                        ? 'bg-[#00522e] text-[#9cf1bb] border-[#80d49f] font-bold'
                        : 'bg-[#282b27] text-[#c2c9bf] border-[#414942] hover:border-[#80d49f]/40'
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[#282b27] text-[10px] text-[#8a938b] flex justify-between items-center">
            <span>UDA1334A I2S Gain</span>
            <span className="text-[#80d49f] font-mono font-bold">Auto 0dB Limiter</span>
          </div>
        </div>

        {/* TILE 2: Direct HTTP Link Player & Web Radio (Separated from EQ) */}
        <div className="bg-[#1d201d] border border-[#414942] rounded-3xl p-4 flex flex-col justify-between shadow-xl transition hover:border-[#80d49f]/40">
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#282b27]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#00522e] text-[#80d49f] flex items-center justify-center border border-[#80d49f]/30">
                  <LinkIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">HTTP Link Player</h3>
                  <p className="text-[10px] text-[#8a938b]">Custom Stream & Stations</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#282b27] text-[#80d49f] border border-[#414942] font-bold">
                Live
              </span>
            </div>

            <p className="text-[11px] text-[#c2c9bf] mb-2">
              Stream any direct MP3, AAC/M4A, WAV (PCM), FLAC, or Opus URL:
            </p>

            {/* Custom Stream Input Form */}
            <form onSubmit={handleCustomStreamSubmit} className="space-y-1.5 mb-3">
              <input
                type="url"
                value={customInputUrl}
                onChange={(e) => setCustomInputUrl(e.target.value)}
                placeholder="http://stream-server.com/audio.wav"
                className="w-full bg-[#111411] border border-[#414942] rounded-xl px-2.5 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-[#80d49f]"
              />
              <button
                type="submit"
                className="w-full bg-[#80d49f] hover:bg-[#9cf1bb] text-[#00381e] font-bold text-[11px] py-1.5 rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
              >
                <span>Play Stream URL</span>
              </button>
            </form>

            {/* Radio Presets Quick List */}
            <div className="pt-2 border-t border-[#282b27]">
              <span className="text-[10px] text-[#8a938b] uppercase tracking-wider block mb-1 font-bold">
                Online Radio Stations
              </span>
              <div className="space-y-1">
                {RADIO_PRESETS.slice(0, 3).map((st) => (
                  <button
                    key={st.name}
                    onClick={() => audio.playPreset(st)}
                    className={`w-full text-left px-2 py-1 rounded-lg text-xs transition flex items-center justify-between border ${
                      audio.currentTrack === st.name
                        ? 'bg-[#00522e] text-[#9cf1bb] border-[#80d49f]'
                        : 'bg-[#282b27] text-[#c2c9bf] border-transparent hover:border-[#414942]'
                    }`}
                  >
                    <span className="truncate">{st.name}</span>
                    <span className="text-[9px] font-mono text-[#8a938b]">{st.bitrate.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[#282b27] text-[10px] text-[#8a938b] flex justify-between items-center">
            <span>Buffer Allocation</span>
            <span className="text-[#80d49f] font-mono font-bold">256KB PSRAM</span>
          </div>
        </div>

        {/* TILE 3: Wi-Fi, DLNA/UPnP & AirPlay Receiver (Combined as requested) */}
        <div className="bg-[#1d201d] border border-[#414942] rounded-3xl p-4 flex flex-col justify-between shadow-xl transition hover:border-[#80d49f]/40">
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#282b27]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#00522e] text-[#80d49f] flex items-center justify-center border border-[#80d49f]/30">
                  <Cast className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Wi-Fi, DLNA & AirPlay</h3>
                  <p className="text-[10px] text-[#8a938b]">Universal Casting Receiver</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#00522e] text-[#80d49f] border border-[#80d49f]/30 flex items-center gap-1 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#80d49f] animate-pulse"></span>
                Active
              </span>
            </div>

            {/* Protocol badges */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#282b27] text-[#80d49f] border border-[#414942] font-mono">
                DLNA SSDP 1900
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#282b27] text-sky-400 border border-[#414942] font-mono">
                AirPlay RAOP
              </span>
            </div>

            {/* Cast simulation buttons */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              <button
                onClick={() => audio.simulateDlnaCast('BubbleUPnP (Android)', 'Chopin - Nocturne Op.9', 'http://dlna-server:5000/chopin.flac')}
                className="bg-[#282b27] hover:bg-[#323631] text-[#c2c9bf] border border-[#414942] hover:border-[#80d49f]/50 rounded-xl p-2 text-left transition flex items-center gap-1.5"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#80d49f] shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-white truncate">BubbleUPnP</p>
                  <p className="text-[9px] text-[#8a938b]">Android / DLNA</p>
                </div>
              </button>

              <button
                onClick={() => audio.simulateAirPlayCast('iPhone 15 Pro (AirPlay)', 'Daft Punk - Get Lucky')}
                className="bg-[#282b27] hover:bg-[#323631] text-[#c2c9bf] border border-[#414942] hover:border-sky-400/50 rounded-xl p-2 text-left transition flex items-center gap-1.5"
              >
                <Airplay className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-white truncate">Apple AirPlay</p>
                  <p className="text-[9px] text-[#8a938b]">iOS / macOS</p>
                </div>
              </button>
            </div>

            {/* Wi-Fi Setup Form */}
            <div className="pt-2.5 border-t border-[#282b27]">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[10px] font-bold text-[#c2c9bf] flex items-center gap-1">
                  <Wifi className="w-3 h-3 text-[#80d49f]" />
                  {audio.networkMode === 'sta' ? 'Home Wi-Fi' : 'Access Point'}
                </span>
                <button
                  onClick={() => audio.setNetworkMode(m => m === 'sta' ? 'ap' : 'sta')}
                  className="text-[9px] px-2 py-0.5 rounded-full bg-[#282b27] text-[#80d49f] hover:bg-[#323631] border border-[#414942]"
                >
                  Switch {audio.networkMode === 'sta' ? 'AP' : 'STA'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={audio.wifiSsid}
                  onChange={(e) => audio.setWifiSsid(e.target.value)}
                  placeholder="SSID"
                  className="w-full bg-[#111411] border border-[#414942] rounded-lg px-2 py-1 text-[10px] text-white font-mono"
                />
                <input
                  type="password"
                  value={audio.wifiPass}
                  onChange={(e) => audio.setWifiPass(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-[#111411] border border-[#414942] rounded-lg px-2 py-1 text-[10px] text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[#282b27] text-[10px] text-[#8a938b] flex justify-between items-center">
            <span>mDNS Local Host</span>
            <span className="text-[#80d49f] font-mono font-bold">http://{mDnsHost}.local</span>
          </div>
        </div>

        {/* TILE 4: Wireless WebOTA Firmware & 16MB Storage Studio */}
        <div className="bg-[#1d201d] border border-[#414942] rounded-3xl p-4 flex flex-col justify-between shadow-xl transition hover:border-[#80d49f]/40">
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-[#282b27]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#00522e] text-[#80d49f] flex items-center justify-center border border-[#80d49f]/30">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Wireless WebOTA</h3>
                  <p className="text-[10px] text-[#8a938b]">Dual 6.5MB Failsafe Slots</p>
                </div>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#282b27] text-sky-400 border border-[#414942] font-bold">
                {audio.otaActivePartition}
              </span>
            </div>

            <p className="text-[11px] text-[#c2c9bf] mb-2.5">
              Flash new firmware wirelessly over Wi-Fi with automatic safety fallback:
            </p>

            <div className="bg-[#111411] border border-[#414942] rounded-2xl p-2.5 mb-2.5">
              <input 
                type="file" 
                accept=".bin"
                className="text-[10px] text-[#8a938b] w-full mb-2" 
              />
              <button
                onClick={audio.simulateOtaUpload}
                disabled={audio.otaProgress !== null}
                className="w-full bg-[#00522e] hover:bg-[#80d49f] hover:text-[#00381e] text-[#9cf1bb] border border-[#80d49f]/40 font-bold text-[11px] py-1.5 rounded-xl transition"
              >
                {audio.otaProgress !== null ? `Flashing OTA (${audio.otaProgress}%)...` : 'Upload & Flash OTA'}
              </button>

              {audio.otaProgress !== null && (
                <div className="mt-2 w-full h-1.5 bg-[#282b27] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#80d49f] transition-all duration-150"
                    style={{ width: `${audio.otaProgress}%` }}
                  />
                </div>
              )}

              {audio.otaSuccess && (
                <p className="text-[10px] text-[#80d49f] font-semibold mt-1.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Switched partition to {audio.otaActivePartition}! Rebooting...
                </p>
              )}
            </div>

            <button
              onClick={onOpenMergedBinModal}
              className="w-full bg-[#282b27] hover:bg-[#323631] text-[#c2c9bf] hover:text-white border border-[#414942] text-[10px] font-bold py-1.5 rounded-xl transition flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3 h-3 text-[#80d49f]" />
              <span>Factory merged.bin (0x0 Flash)</span>
            </button>
          </div>

          <div className="mt-3 pt-2 border-t border-[#282b27] text-[10px] text-[#8a938b] flex justify-between items-center">
            <span>Storage Size</span>
            <span className="text-[#80d49f] font-mono font-bold">16MB Dual OTA</span>
          </div>
        </div>

      </div>
    </div>
  );
};
