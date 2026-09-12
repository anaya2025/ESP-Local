import { PartitionScheme } from '../types';

export const PARTITION_SCHEMES: PartitionScheme[] = [
  {
    id: 'dual-ota-balanced',
    name: 'Dual OTA Balanced (6.5MB App + 6.5MB OTA + 2.8MB FS)',
    description: 'Recommended for production IoT with robust Over-The-Air firmware updates and ample LittleFS storage.',
    entries: [
      { name: 'nvs', type: 'data', subtype: 'nvs', offset: '0x9000', size: '0x6000', sizeBytes: 24576, description: 'Non-Volatile Storage (WiFi credentials, calibration)' },
      { name: 'otadata', type: 'data', subtype: 'ota', offset: '0xf000', size: '0x2000', sizeBytes: 8192, description: 'OTA boot partition switcher metadata' },
      { name: 'app0', type: 'app', subtype: 'ota_0', offset: '0x20000', size: '0x680000', sizeBytes: 6815744, description: 'Factory / Main firmware app partition (6.5 MB)' },
      { name: 'app1', type: 'app', subtype: 'ota_1', offset: '0x6A0000', size: '0x680000', sizeBytes: 6815744, description: 'Secondary OTA update staging partition (6.5 MB)' },
      { name: 'spiffs', type: 'data', subtype: 'spiffs', offset: '0xD20000', size: '0x2D0000', sizeBytes: 2949120, description: 'LittleFS / SPIFFS web assets and filesystem (2.81 MB)' },
      { name: 'coredump', type: 'data', subtype: 'coredump', offset: '0xFF0000', size: '0x10000', sizeBytes: 65536, description: 'Crash log coredump buffer (64 KB)' }
    ]
  },
  {
    id: 'edge-ai-dataset',
    name: 'Edge AI / Neural Net Storage (3.5MB App + 8.8MB FS)',
    description: 'Optimized for TinyML neural networks, TensorFlow Lite model weights, or image/audio dataset storage.',
    entries: [
      { name: 'nvs', type: 'data', subtype: 'nvs', offset: '0x9000', size: '0x6000', sizeBytes: 24576, description: 'Non-Volatile Storage' },
      { name: 'otadata', type: 'data', subtype: 'ota', offset: '0xf000', size: '0x2000', sizeBytes: 8192, description: 'OTA switcher' },
      { name: 'app0', type: 'app', subtype: 'ota_0', offset: '0x20000', size: '0x380000', sizeBytes: 3670016, description: 'TinyML runtime + firmware (3.5 MB)' },
      { name: 'app1', type: 'app', subtype: 'ota_1', offset: '0x3A0000', size: '0x380000', sizeBytes: 3670016, description: 'OTA fallback partition (3.5 MB)' },
      { name: 'littlefs', type: 'data', subtype: 'spiffs', offset: '0x720000', size: '0x8C0000', sizeBytes: 9175040, description: 'Large Model Storage / Audio & Image DB (8.75 MB)' },
      { name: 'coredump', type: 'data', subtype: 'coredump', offset: '0xFE0000', size: '0x20000', sizeBytes: 131072, description: 'Crash log buffer (128 KB)' }
    ]
  },
  {
    id: 'single-giant-app',
    name: 'Single Gigantic App (12MB App + 3.8MB FS - No OTA)',
    description: 'Maximized single binary size for massive monolithic applications with in-firmware graphics/fonts.',
    entries: [
      { name: 'nvs', type: 'data', subtype: 'nvs', offset: '0x9000', size: '0x6000', sizeBytes: 24576, description: 'Non-Volatile Storage' },
      { name: 'app0', type: 'app', subtype: 'factory', offset: '0x10000', size: '0xC00000', sizeBytes: 12582912, description: 'Gigantic application binary (12.0 MB)' },
      { name: 'spiffs', type: 'data', subtype: 'spiffs', offset: '0xC10000', size: '0x3E0000', sizeBytes: 4063232, description: 'Filesystem (3.87 MB)' },
      { name: 'coredump', type: 'data', subtype: 'coredump', offset: '0xFF0000', size: '0x10000', sizeBytes: 65536, description: 'Crash log buffer (64 KB)' }
    ]
  }
];

export function generateCsvPartitionTable(scheme: PartitionScheme): string {
  let csv = '# ESP32-S3 N16R8 16MB Partition Table\n';
  csv += '# Name,   Type, SubType, Offset,  Size, Flags\n';
  for (const entry of scheme.entries) {
    csv += `${entry.name.padEnd(9)}, ${entry.type.padEnd(5)}, ${entry.subtype.padEnd(8)}, ${entry.offset.padEnd(8)}, ${entry.size.padEnd(9)}${entry.flags ? `, ${entry.flags}` : ''}\n`;
  }
  return csv;
}
