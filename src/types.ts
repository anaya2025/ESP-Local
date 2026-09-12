export type FrameworkType = 'platformio' | 'espidf' | 'arduino';

export type BoardType = 
  | 'devkitc-1-n16r8'
  | 'xiao-esp32s3-sense'
  | 'waveshare-esp32s3-zero'
  | 'lilygo-tdisplay-s3';

export type TemplateId = 
  | 'dlna-media-receiver'
  | 'psram-benchmark'
  | 'wifi-webserver'
  | 'freertos-dualcore'
  | 'tinyml-edge-ai'
  | 'usb-serial-logger';

export interface PartitionEntry {
  name: string;
  type: string;
  subtype: string;
  offset: string;
  size: string;
  sizeBytes: number;
  flags?: string;
  description: string;
}

export interface PartitionScheme {
  id: string;
  name: string;
  description: string;
  entries: PartitionEntry[];
}

export interface AudioSettings {
  i2sBclkPin: number;
  i2sLrcPin: number;
  i2sDoutPin: number;
  mDnsHost: string;
  dlnaDeviceName: string;
  defaultVolume: number;
  eqBass: number;
  eqMid: number;
  eqTreble: number;
  otaPassword?: string;
}

export interface ProjectConfig {
  projectName: string;
  description: string;
  author: string;
  framework: FrameworkType;
  board: BoardType;
  template: TemplateId;
  partitionSchemeId: string;
  flashMode: 'qio' | 'opi';
  flashFreq: '80m' | '120m';
  psramMode: 'opi'; // Octal PSRAM for N16R8
  psramFreq: '80m' | '120m';
  enableUsbCdc: boolean;
  enableRgbLed: boolean;
  rgbLedPin: number;
  wifiSsid: string;
  wifiPass: string;
  includeGitHubWorkflow: boolean;
  includeDockerSetup: boolean;
  audioSettings: AudioSettings;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  description?: string;
}

export interface GpioPinInfo {
  gpio: number;
  name: string;
  defaultFunc: string;
  isPsramReserved: boolean;
  isStrapping: boolean;
  adcChannel?: string;
  touchChannel?: string;
  notes: string;
}
