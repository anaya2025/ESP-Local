import { useState, useEffect } from 'react';
import { ProjectConfig } from '../types';
import { RadioStation, RADIO_PRESETS } from '../components/TopMediaControlBar';

export interface EqPreset {
  name: string;
  bass: number;
  mid: number;
  treble: number;
}

export const EQ_PRESETS: EqPreset[] = [
  { name: 'Flat', bass: 0, mid: 0, treble: 0 },
  { name: 'Bass Boost', bass: 7, mid: 1, treble: -1 },
  { name: 'Vocal / Podcast', bass: -2, mid: 5, treble: 2 },
  { name: 'Rock', bass: 5, mid: 2, treble: 4 },
  { name: 'Classical', bass: 3, mid: 0, treble: 4 },
  { name: 'Electronic', bass: 8, mid: 2, treble: 5 }
];

export function useAudioPlayer(config: ProjectConfig) {
  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTrack, setCurrentTrack] = useState<string>(RADIO_PRESETS[0].name);
  const [streamUrl, setStreamUrl] = useState<string>(RADIO_PRESETS[0].url);
  const [sourceType, setSourceType] = useState<'http' | 'dlna' | 'airplay'>('http');
  const [dlnaCastingDevice, setDlnaCastingDevice] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(config.audioSettings?.defaultVolume || 65);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Tone controls (-16 to +16 dB)
  const [bass, setBass] = useState<number>(config.audioSettings?.eqBass || 0);
  const [mid, setMid] = useState<number>(config.audioSettings?.eqMid || 0);
  const [treble, setTreble] = useState<number>(config.audioSettings?.eqTreble || 0);
  const [activePreset, setActivePreset] = useState<string>('Flat');

  // Network & System State
  const [networkMode, setNetworkMode] = useState<'sta' | 'ap'>('sta');
  const [wifiSsid, setWifiSsid] = useState<string>(config.wifiSsid || 'Home_WiFi_5G');
  const [wifiPass, setWifiPass] = useState<string>('••••••••');

  // OTA state
  const [otaProgress, setOtaProgress] = useState<number | null>(null);
  const [otaActivePartition, setOtaActivePartition] = useState<'app0' | 'app1'>('app0');
  const [otaSuccess, setOtaSuccess] = useState<boolean>(false);

  // Spectrum Visualizer Bars
  const [visualizerBars, setVisualizerBars] = useState<number[]>([40, 65, 30, 85, 50, 75, 45, 90]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setVisualizerBars([
          Math.floor(20 + Math.random() * 80),
          Math.floor(30 + Math.random() * 70),
          Math.floor(15 + Math.random() * 85),
          Math.floor(40 + Math.random() * 60),
          Math.floor(25 + Math.random() * 75),
          Math.floor(35 + Math.random() * 65),
          Math.floor(20 + Math.random() * 80),
          Math.floor(30 + Math.random() * 70),
        ]);
      }, 180);
    } else {
      setVisualizerBars([10, 10, 10, 10, 10, 10, 10, 10]);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const togglePlay = () => setIsPlaying(prev => !prev);

  const stop = () => {
    setIsPlaying(false);
  };

  const nextTrack = () => {
    const currentIndex = RADIO_PRESETS.findIndex(s => s.name === currentTrack);
    const nextIndex = (currentIndex + 1) % RADIO_PRESETS.length;
    playPreset(RADIO_PRESETS[nextIndex]);
  };

  const previousTrack = () => {
    const currentIndex = RADIO_PRESETS.findIndex(s => s.name === currentTrack);
    const prevIndex = (currentIndex - 1 + RADIO_PRESETS.length) % RADIO_PRESETS.length;
    playPreset(RADIO_PRESETS[prevIndex]);
  };

  const playPreset = (station: RadioStation) => {
    if (!station) return;
    setStreamUrl(station.url || '');
    setCurrentTrack(station.name || 'Web Stream');
    setSourceType('http');
    setDlnaCastingDevice(null);
    setIsPlaying(true);
  };

  const playCustomUrl = (url: string, trackName?: string) => {
    setStreamUrl(url);
    setCurrentTrack(trackName || 'Direct HTTP Stream');
    setSourceType('http');
    setDlnaCastingDevice(null);
    setIsPlaying(true);
  };

  const applyEqPreset = (preset: EqPreset) => {
    if (!preset) return;
    setBass(preset.bass ?? 0);
    setMid(preset.mid ?? 0);
    setTreble(preset.treble ?? 0);
    setActivePreset(preset.name || 'Custom');
  };

  const simulateDlnaCast = (deviceName: string, track: string, url: string) => {
    setDlnaCastingDevice(deviceName);
    setCurrentTrack(track);
    setStreamUrl(url);
    setSourceType('dlna');
    setIsPlaying(true);
  };

  const simulateAirPlayCast = (deviceName: string, track: string) => {
    setDlnaCastingDevice(deviceName);
    setCurrentTrack(track);
    setStreamUrl('rtp://44100Hz:16bit-ALAC');
    setSourceType('airplay');
    setIsPlaying(true);
  };

  const toggleMute = () => setIsMuted(prev => !prev);

  const simulateOtaUpload = () => {
    setOtaProgress(0);
    setOtaSuccess(false);
    let current = 0;
    const interval = setInterval(() => {
      current += 15;
      if (current >= 100) {
        setOtaProgress(100);
        clearInterval(interval);
        setTimeout(() => {
          setOtaSuccess(true);
          setOtaActivePartition(prev => prev === 'app0' ? 'app1' : 'app0');
          setOtaProgress(null);
        }, 600);
      } else {
        setOtaProgress(current);
      }
    }, 150);
  };

  return {
    isPlaying,
    setIsPlaying,
    currentTrack,
    setCurrentTrack,
    streamUrl,
    setStreamUrl,
    sourceType,
    setSourceType,
    dlnaCastingDevice,
    setDlnaCastingDevice,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    bass,
    setBass,
    mid,
    setMid,
    treble,
    setTreble,
    activePreset,
    setActivePreset,
    networkMode,
    setNetworkMode,
    wifiSsid,
    setWifiSsid,
    wifiPass,
    setWifiPass,
    otaProgress,
    otaActivePartition,
    otaSuccess,
    visualizerBars,
    togglePlay,
    stop,
    nextTrack,
    previousTrack,
    playPreset,
    playCustomUrl,
    applyEqPreset,
    simulateDlnaCast,
    simulateAirPlayCast,
    toggleMute,
    simulateOtaUpload
  };
}
