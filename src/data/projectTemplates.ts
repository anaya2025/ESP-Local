import { ProjectConfig, GeneratedFile } from '../types';
import { PARTITION_SCHEMES, generateCsvPartitionTable } from './partitions';
import { 
  getAudioConfigHeader, 
  getDlnaRendererHeader, 
  getDlnaRendererSource, 
  getMaterialUiHtml,
  getAirPlayReceiverHeader,
  getAirPlayReceiverCpp
} from './dlnaRendererSource';

export function generateProjectFiles(config: ProjectConfig): GeneratedFile[] {
  const scheme = PARTITION_SCHEMES.find(s => s.id === config.partitionSchemeId) || PARTITION_SCHEMES[0];
  const otaDataEntry = scheme.entries.find(e => e.name === 'otadata' || e.subtype === 'ota');
  const app0Entry = scheme.entries.find(e => e.name === 'app0' || e.subtype === 'ota_0' || e.subtype === 'factory');
  const otaDataOffset = otaDataEntry ? otaDataEntry.offset : '0xf000';
  const app0Offset = app0Entry ? app0Entry.offset : '0x20000';

  const files: GeneratedFile[] = [];

  // 1. .gitignore
  files.push({
    path: '.gitignore',
    language: 'plaintext',
    description: 'Git ignore rules for ESP32 build artifacts',
    content: `# PlatformIO & ESP-IDF build artifacts
.pio/
.pioenvs/
.piolibdeps/
build/
sdkconfig.old
sdkconfig.ci
*.bin
*.elf
*.map

# Editor configurations
.vscode/.browse.c_cpp.db*
.vscode/c_cpp_properties.json
.vscode/launch.json
.vscode/ipch/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db
`
  });

  // 2. GitHub Actions CI Workflow
  if (config.includeGitHubWorkflow) {
    files.push({
      path: '.github/workflows/ci.yml',
      language: 'yaml',
      description: 'Automated GitHub Actions CI/CD to build firmware on push/PR',
      content: `name: ESP32-S3 N16R8 Build CI

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    name: Build ${config.projectName} Firmware
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Set up Python 3.11
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install PlatformIO Core & esptool
        run: |
          python -m pip install --upgrade pip
          pip install --upgrade platformio esptool

      - name: PlatformIO Cache
        uses: actions/cache@v4
        with:
          path: |
            ~/.platformio
            .pio
          key: \${{ runner.os }}-pio-\${{ hashFiles('**/platformio.ini') }}
          restore-keys: |
            \${{ runner.os }}-pio-

      - name: Compile ESP32-S3 N16R8 Target
        run: pio run -e esp32-s3-n16r8

      - name: Ensure Factory merged.bin is Created
        run: |
          BUILD_DIR=".pio/build/esp32-s3-n16r8"
          if [ ! -f "$BUILD_DIR/merged.bin" ]; then
            echo "Generating merged.bin via esptool..."
            BOOT_APP0=$(find ~/.platformio/packages -name "boot_app0.bin" 2>/dev/null | head -n 1)
            CMD="python -m esptool --chip esp32s3 merge_bin -o $BUILD_DIR/merged.bin --flash_mode ${config.flashMode} --flash_freq 80m --flash_size 16MB 0x0 $BUILD_DIR/bootloader.bin 0x8000 $BUILD_DIR/partitions.bin"
            if [ -n "$BOOT_APP0" ] && [ -f "$BOOT_APP0" ]; then
              CMD="$CMD ${otaDataOffset} $BOOT_APP0"
            fi
            CMD="$CMD ${app0Offset} $BUILD_DIR/firmware.bin"
            echo "Running: $CMD"
            eval $CMD
          fi
          echo ">>> Factory merged.bin ready:"
          ls -lh $BUILD_DIR/merged.bin

      - name: Upload Single Factory merged.bin (Flash at 0x0)
        uses: actions/upload-artifact@v4
        with:
          name: ${config.projectName}-factory-merged-bin
          path: .pio/build/esp32-s3-n16r8/merged.bin

      - name: Upload All Individual Firmware Binaries
        uses: actions/upload-artifact@v4
        with:
          name: ${config.projectName}-all-binaries
          path: |
            .pio/build/esp32-s3-n16r8/merged.bin
            .pio/build/esp32-s3-n16r8/firmware.bin
            .pio/build/esp32-s3-n16r8/bootloader.bin
            .pio/build/esp32-s3-n16r8/partitions.bin
`
    });
  }

  // 3. Partition Table CSV (16MB Flash)
  files.push({
    path: 'partitions_16MB.csv',
    language: 'csv',
    description: '16MB Custom Partition Table optimized for N16R8 Flash',
    content: generateCsvPartitionTable(scheme)
  });

  // 4. Header File: include/esp32s3_n16r8_config.h
  files.push({
    path: 'include/esp32s3_n16r8_config.h',
    language: 'cpp',
    description: 'Hardware constants and PSRAM macros for N16R8 module',
    content: `/**
 * @file esp32s3_n16r8_config.h
 * @brief Hardware configuration for ESP32-S3-WROOM-1-N16R8
 * 
 * Target: ESP32-S3 (Xtensa Dual-Core LX7 @ 240MHz)
 * Flash:  16MB (${config.flashMode.toUpperCase()} Mode)
 * PSRAM:  8MB Octal SPI (OPI @ ${config.psramFreq.toUpperCase()})
 */

#pragma once

#include <Arduino.h>

// Board Hardware Definitions
#define BOARD_NAME               "${config.projectName}"
#define BOARD_AUTHOR             "${config.author || 'Maker'}"
#define BOARD_MCU                "ESP32-S3"
#define BOARD_FLASH_SIZE_MB      16
#define BOARD_PSRAM_SIZE_MB      8

// Built-in NeoPixel / Status LED pin
#define RGB_LED_PIN              ${config.rgbLedPin}
#define RGB_LED_COUNT            1

// Native USB-OTG / CDC Configuration
#define USE_USB_CDC              ${config.enableUsbCdc ? 1 : 0}

// WiFi Settings (Configurable)
#define DEFAULT_WIFI_SSID        "${config.wifiSsid || 'ESP32S3_AP'}"
#define DEFAULT_WIFI_PASS        "${config.wifiPass || '12345678'}"

/**
 * CRITICAL HARDWARE SAFETY NOTICE:
 * GPIO 33, 34, 35, 36, 37 are internally wired to the 8MB Octal PSRAM (OPI).
 * NEVER reconfigure these pins as general GPIO, or the system will crash!
 */
#define IS_PSRAM_RESERVED_PIN(pin) \\
    ((pin) >= 33 && (pin) <= 37)

// Utility function to print complete memory statistics
inline void printMemorySummary() {
    Serial.println(F("========================================"));
    Serial.println(F("    ESP32-S3 N16R8 Memory Diagnostic    "));
    Serial.println(F("========================================"));
    Serial.printf("  CPU Frequency:       %u MHz\\n", getCpuFrequencyMhz());
    Serial.printf("  Flash Size:          %u MB (%s)\\n", ESP.getFlashChipSize() / (1024 * 1024), "${config.flashMode.toUpperCase()}");
    Serial.printf("  Internal Free Heap:  %u KB\\n", ESP.getFreeHeap() / 1024);
    Serial.printf("  Internal Min Free:   %u KB\\n", ESP.getMinFreeHeap() / 1024);
    
    if (psramFound()) {
        Serial.printf("  8MB Octal PSRAM:     INITIALIZED OK\\n");
        Serial.printf("  PSRAM Total Size:    %u KB (%u MB)\\n", ESP.getPsramSize() / 1024, ESP.getPsramSize() / (1024 * 1024));
        Serial.printf("  PSRAM Free Memory:   %u KB\\n", ESP.getFreePsram() / 1024);
        Serial.printf("  PSRAM Min Free:      %u KB\\n", ESP.getMinFreePsram() / 1024);
    } else {
        Serial.println(F("  [!] WARNING: PSRAM NOT DETECTED! Check build flags (-DBOARD_HAS_PSRAM, memory_type = qio_opi)"));
    }
    Serial.println(F("========================================\\n"));
}
`
  });

  // If DLNA Audio Streamer template is selected, add audio & DLNA source files
  if (config.template === 'dlna-media-receiver') {
    files.push({
      path: 'include/audio_config.h',
      language: 'cpp',
      description: 'I2S Pinouts, Volume, and Tone Equalizer parameters',
      content: getAudioConfigHeader(config)
    });

    files.push({
      path: 'src/dlna_renderer.h',
      language: 'cpp',
      description: 'SSDP Multicast & UPnP AVTransport/RenderingControl DLNA Receiver',
      content: getDlnaRendererHeader()
    });

    files.push({
      path: 'src/dlna_renderer.cpp',
      language: 'cpp',
      description: 'DLNA MediaRenderer implementation',
      content: getDlnaRendererSource()
    });

    files.push({
      path: 'src/airplay_raop.h',
      language: 'cpp',
      description: 'Apple AirPlay (RAOP) RTSP/RTP Audio Receiver Header',
      content: getAirPlayReceiverHeader()
    });

    files.push({
      path: 'src/airplay_raop.cpp',
      language: 'cpp',
      description: 'Apple AirPlay (RAOP) Receiver implementation',
      content: getAirPlayReceiverCpp()
    });

    files.push({
      path: 'src/material_ui_assets.h',
      language: 'cpp',
      description: 'Material Design 3 Web App served at http://esp32-audio.local',
      content: getMaterialUiHtml(config)
    });
  }

  // 5. platformio.ini (PlatformIO Configuration)
  files.push({
    path: 'platformio.ini',
    language: 'ini',
    description: 'PlatformIO configuration file configured for 16MB Flash & 8MB Octal PSRAM',
    content: `; PlatformIO Project Configuration File
; Project: ${config.projectName}
; Hardware: ESP32-S3 N16R8 (16MB Flash, 8MB Octal PSRAM)

[platformio]
default_envs = esp32-s3-n16r8
description = ${config.description || 'ESP32-S3 N16R8 High Performance Firmware'}

[env:esp32-s3-n16r8]
platform = espressif32 @ ~6.9.0
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200
upload_speed = 921600

; --- Flash & PSRAM Memory Tuning for N16R8 ---
board_build.flash_mode = ${config.flashMode}
board_build.f_flash = ${config.flashFreq === '120m' ? '120000000L' : '80000000L'}
board_build.f_cpu = 240000000L
board_upload.flash_size = 16MB
board_build.partitions = partitions_16MB.csv

; OPI (Octal SPI) PSRAM configuration
board_build.arduino.memory_type = ${config.flashMode === 'opi' ? 'opi_opi' : 'qio_opi'}

; Auto-merge all binaries into a single merged.bin at 0x0
extra_scripts = post:scripts/merge_bin.py

build_flags =
    -DBOARD_HAS_PSRAM
    -mfix-esp32-psram-cache-issue
    -DARDUINO_USB_CDC_ON_BOOT=${config.enableUsbCdc ? '1' : '0'}
    -DARDUINO_USB_MODE=${config.enableUsbCdc ? '1' : '0'}
    -DCORE_DEBUG_LEVEL=3

lib_deps =
    ${config.template === 'dlna-media-receiver' ? 'esphome/ESP32-audioI2S @ ^3.0.12\n    bblanchon/ArduinoJson @ ^7.0.4' : ''}
    ${config.template === 'wifi-webserver' ? 'ESP Async WebServer\n    AsyncTCP' : ''}
    ${config.enableRgbLed ? 'adafruit/Adafruit NeoPixel @ ^1.12.0' : ''}
`
  });

  // 6. PlatformIO Merge Binary Script: scripts/merge_bin.py
  files.push({
    path: 'scripts/merge_bin.py',
    language: 'python',
    description: 'PlatformIO post-build hook generating single-file merged.bin at 0x0',
    content: `#!/usr/bin/env python3
"""
PlatformIO Post-Build Script: Generate Factory merged.bin
Automatically merges bootloader, partitions, boot_app0, and firmware into a single flashable binary at 0x0000.
"""
Import("env")
import os

def merge_bin_action(source, target, env):
    build_dir = env.subst("$BUILD_DIR")
    flash_size = env.BoardConfig().get("upload.flash_size", "16MB")
    flash_mode = env.BoardConfig().get("build.flash_mode", "${config.flashMode}")
    f_flash = env.BoardConfig().get("build.f_flash", "80m").replace("000000L", "m")

    bootloader = os.path.join(build_dir, "bootloader.bin")
    partitions = os.path.join(build_dir, "partitions.bin")
    firmware = os.path.join(build_dir, "firmware.bin")
    merged_bin = os.path.join(build_dir, "merged.bin")

    # Locate boot_app0.bin in framework packages
    packages_dir = env.subst("$PROJECT_PACKAGES_DIR")
    boot_app0 = os.path.join(packages_dir, "framework-arduinoespressif32", "tools", "partitions", "boot_app0.bin")

    print(f"\\n========================================================")
    print(f"  [PlatformIO Hook] Creating Factory merged.bin at 0x0  ")
    print(f"========================================================")
    print(f"  Flash Mode: {flash_mode.upper()} | Flash Freq: {f_flash.upper()} | Size: {flash_size}")
    print(f"  Output:     {merged_bin}")

    cmd_parts = [
        "python", "-m", "esptool",
        "--chip", "esp32s3",
        "merge_bin",
        "-o", f'"{merged_bin}"',
        "--flash_mode", flash_mode,
        "--flash_freq", f_flash,
        "--flash_size", flash_size,
        "0x0", f'"{bootloader}"',
        "0x8000", f'"{partitions}"'
    ]

    if os.path.exists(boot_app0):
        cmd_parts.extend(["${otaDataOffset}", f'"{boot_app0}"'])

    cmd_parts.extend(["${app0Offset}", f'"{firmware}"'])

    cmd = " ".join(cmd_parts)
    print(f"  Running: {cmd}\\n")
    env.Execute(cmd)
    print(f"  >>> Done! Flash with: esptool.py --chip esp32s3 write_flash 0x0 {merged_bin}\\n")

env.AddPostAction("$BUILD_DIR/\${PROGNAME}.bin", merge_bin_action)
`
  });

  // 7. Template Source Code: src/main.cpp
  files.push({
    path: 'src/main.cpp',
    language: 'cpp',
    description: 'Primary firmware source code',
    content: getMainCppContent(config)
  });

  // 8. README.md
  files.push({
    path: 'README.md',
    language: 'markdown',
    description: 'Comprehensive documentation and flashing guide',
    content: getReadmeContent(config, scheme)
  });

  // 9. Flashing helper script (scripts/flash.sh & scripts/flash.bat)
  files.push({
    path: 'scripts/flash.sh',
    language: 'bash',
    description: 'One-click shell script for flashing single merged.bin with esptool',
    content: `#!/usr/bin/env bash
# Flash script for ESP32-S3 N16R8 via esptool.py
PORT="\${1:-/dev/ttyACM0}"
BAUD=921600

echo "========================================================"
echo "  Flashing ${config.projectName} Factory merged.bin"
echo "  Target Port: \${PORT} @ \${BAUD} baud"
echo "========================================================"

# Check if merged.bin exists for 1-step flashing at 0x0
if [ -f ".pio/build/esp32-s3-n16r8/merged.bin" ]; then
    echo ">>> Found merged.bin! Flashing complete image at 0x0..."
    esptool.py --chip esp32s3 --port "\${PORT}" --baud \${BAUD} write_flash 0x0 .pio/build/esp32-s3-n16r8/merged.bin
else
    echo ">>> Running PlatformIO upload..."
    pio run -t upload --upload-port "\${PORT}" || {
        echo "PlatformIO upload failed. Attempting direct esptool multi-binary write..."
        esptool.py --chip esp32s3 --port "\${PORT}" --baud \${BAUD} write_flash \\
          0x0 .pio/build/esp32-s3-n16r8/bootloader.bin \\
          0x8000 .pio/build/esp32-s3-n16r8/partitions.bin \\
          ${app0Offset} .pio/build/esp32-s3-n16r8/firmware.bin
    }
fi

echo ">>> Done! Opening serial monitor..."
pio device monitor -b 115200 -p "\${PORT}"
`
  });

  return files;
}

function getMainCppContent(config: ProjectConfig): string {
  switch (config.template) {
    case 'dlna-media-receiver':
      return `/**
 * @file main.cpp
 * @brief ESP32-S3 N16R8 DLNA UPnP HiFi Media Receiver & Material UI Web Player
 * 
 * Features:
 * 1. Material Design 3 Web Control Center served at http://${config.audioSettings?.mDnsHost || 'esp32-audio'}.local
 * 2. AP Startup (ESP32S3-Audio-Setup) -> Home WiFi Connection with auto-fallback
 * 3. DLNA / UPnP MediaRenderer always running in background (BubbleUPnP, mConnect, Windows Cast, VLC)
 * 4. Direct HTTP/HTTPS audio stream link playback (MP3, AAC, FLAC, WAV, Shoutcast web radio)
 * 5. Hardware 3-Band Tone Equalizer (Bass, Mid, Treble) with quick presets
 * 6. FreeRTOS dual-core allocation: Core 0 handles network/DLNA/web, Core 1 handles real-time I2S decode
 * 7. Seamless Wireless OTA base (ArduinoOTA on port 3232 + WebOTA upload on /update)
 * 
 * Hardware safety:
 * - 8MB Octal PSRAM ring buffer for stutter-free network audio
 * - Pins GPIO 33-37 strictly reserved for PSRAM
 * - I2S DAC connected safely to GPIO ${config.audioSettings?.i2sBclkPin || 15}, ${config.audioSettings?.i2sLrcPin || 16}, ${config.audioSettings?.i2sDoutPin || 17}
 */

#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <Update.h>
#include <ArduinoOTA.h>
#include <Audio.h> // ESP32-audioI2S library
#include "esp32s3_n16r8_config.h"
#include "audio_config.h"
#include "dlna_renderer.h"
#include "airplay_raop.h"
#include "material_ui_assets.h"

Audio audio;
WebServer server(80);
DLNARenderer dlna;
AirPlayReceiver airplay;

// Playback state variables
bool isPlaying = false;
String currentTrack = "Ready to Stream";
String currentSource = "DLNA / AirPlay / Web Ready";
int currentVolume = DEFAULT_VOLUME;
int currentBass = DEFAULT_EQ_BASS;
int currentMid = DEFAULT_EQ_MID;
int currentTreble = DEFAULT_EQ_TREBLE;

// FreeRTOS Task for Audio decoding on Core 1
TaskHandle_t AudioTaskHandle = NULL;

void audioLoopTask(void *pvParameters) {
    Serial.printf("[Core 1] Audio decoding task running on Core %d\\n", xPortGetCoreID());
    for (;;) {
        audio.loop();
        vTaskDelay(pdMS_TO_TICKS(1)); // Yield for watchdog
    }
}

void setupWiFiAndMdns() {
    Serial.println(F("[WIFI] Checking connection to home network..."));
    WiFi.mode(WIFI_AP_STA);

    if (strlen(DEFAULT_WIFI_SSID) > 0 && String(DEFAULT_WIFI_SSID) != "ESP32S3_AP") {
        WiFi.begin(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASS);
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500);
            Serial.print(F("."));
            attempts++;
        }
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println(F("\\n[WIFI] Connected to Home WiFi successfully!"));
        Serial.printf("[WIFI] IP Address: %s\\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println(F("\\n[WIFI] Home WiFi not reachable. Launching AP Startup mode..."));
        WiFi.softAP(AP_SSID, AP_PASSWORD);
        Serial.printf("[WIFI] SoftAP active! Connect to '%s' (Pass: '%s')\\n", AP_SSID, AP_PASSWORD);
        Serial.printf("[WIFI] Configuration URL: http://%s\\n", WiFi.softAPIP().toString().c_str());
    }

    // Register mDNS: http://esp32-audio.local
    if (MDNS.begin(MDNS_HOSTNAME)) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("[mDNS] Responder started! Open http://%s.local\\n", MDNS_HOSTNAME);
    }
}

void setupHttpServer() {
    // 1. Serve Material UI 3 Web App
    server.on("/", HTTP_GET, []() {
        server.send_P(200, "text/html", MATERIAL_UI_INDEX_HTML);
    });

    // 2. Play Stream URL API
    server.on("/api/play", HTTP_POST, []() {
        String url = server.arg("plain");
        if (url.length() > 0) {
            Serial.printf("[HTTP] Starting stream: %s\\n", url.c_str());
            audio.connecttohost(url.c_str());
            isPlaying = true;
            currentTrack = "Web Stream";
            currentSource = url;
            server.send(200, "text/plain", "OK");
        } else {
            server.send(400, "text/plain", "Missing URL");
        }
    });

    // 3. Pause / Resume API
    server.on("/api/pause", HTTP_POST, []() {
        audio.pauseResume();
        isPlaying = audio.isRunning();
        server.send(200, "text/plain", isPlaying ? "PLAYING" : "PAUSED");
    });

    // 4. Volume Control API
    server.on("/api/volume", HTTP_POST, []() {
        if (server.hasArg("val")) {
            currentVolume = server.arg("val").toInt();
            audio.setVolume(map(currentVolume, 0, 100, 0, 21)); // 0-21 internal range
            server.send(200, "text/plain", String(currentVolume));
        }
    });

    // 5. Tone EQ API (-16 to +16 dB)
    server.on("/api/tone", HTTP_POST, []() {
        if (server.hasArg("bass")) currentBass = server.arg("bass").toInt();
        if (server.hasArg("mid")) currentMid = server.arg("mid").toInt();
        if (server.hasArg("treble")) currentTreble = server.arg("treble").toInt();
        audio.setTone(currentBass, currentMid, currentTreble);
        server.send(200, "text/plain", "TONE_OK");
    });

    // 6. Seamless WebOTA Handler
    server.on("/update", HTTP_POST, []() {
        server.sendHeader("Connection", "close");
        server.send(200, "text/plain", (Update.hasError()) ? "OTA_FAIL" : "OTA_SUCCESS_REBOOTING");
        ESP.restart();
    }, []() {
        HTTPUpload& upload = server.upload();
        if (upload.status == UPLOAD_FILE_START) {
            Serial.printf("[OTA] Update started: %s\\n", upload.filename.c_str());
            if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_END) {
            if (Update.end(true)) {
                Serial.printf("[OTA] Update Success! %u bytes written.\\n", upload.totalSize);
            }
        }
    });

    server.begin();
    Serial.println(F("[HTTP] Material UI server listening on port 80"));
}

void setup() {
    Serial.begin(115200);
    delay(2000);

    Serial.println(F("\\n========================================================"));
    Serial.println(F("   ESP32-S3 N16R8 DLNA UPnP & Material UI Streamer     "));
    Serial.println(F("========================================================"));
    printMemorySummary();

    // 1. Configure I2S DAC output (safe from GPIO 33-37 PSRAM)
    audio.setPinout(I2S_BCLK_PIN, I2S_LRC_PIN, I2S_DOUT_PIN);
    audio.setVolume(map(DEFAULT_VOLUME, 0, 100, 0, 21));
    audio.setTone(DEFAULT_EQ_BASS, DEFAULT_EQ_MID, DEFAULT_EQ_TREBLE);
    Serial.printf("[I2S] DAC Initialized on BCLK:%d, LRC:%d, DOUT:%d\\n", I2S_BCLK_PIN, I2S_LRC_PIN, I2S_DOUT_PIN);

    // 2. Setup WiFi and mDNS (.local)
    setupWiFiAndMdns();

    // 3. Setup HTTP Server and Material UI
    setupHttpServer();

    // 4. Initialize DLNA / UPnP MediaRenderer
    dlna.begin(&server, DLNA_FRIENDLY_NAME, 80);
    dlna.setOnPlayUrl([](const String& url, const String& meta) {
        Serial.printf("[DLNA Cast] Receiving stream: %s\\n", url.c_str());
        audio.connecttohost(url.c_str());
        isPlaying = true;
        currentTrack = "DLNA Cast Stream";
        currentSource = url;
    });
    dlna.setOnPause([]() { audio.pauseResume(); isPlaying = false; });
    dlna.setOnStop([]() { audio.stopSong(); isPlaying = false; });
    dlna.setOnVolume([](int vol) {
        currentVolume = vol;
        audio.setVolume(map(vol, 0, 100, 0, 21));
    });

    // 5. Initialize AirPlay 1 (RAOP) Receiver (iOS / macOS Bonjour & RTSP/RTP)
    airplay.begin(DLNA_FRIENDLY_NAME, 5000, 6000);
    airplay.setOnMeta([](const String& title, const String& artist) {
        Serial.printf("[AirPlay Meta] %s by %s\\n", title.c_str(), artist.c_str());
        currentTrack = title;
        currentSource = "Apple AirPlay (" + artist + ")";
    });
    airplay.setOnState([](bool playing) {
        isPlaying = playing;
        if (!playing) audio.pauseResume();
    });

    // 6. Initialize ArduinoOTA for wireless PlatformIO uploads
    ArduinoOTA.setHostname(MDNS_HOSTNAME);
    ArduinoOTA.onStart([]() { Serial.println(F("[OTA] Wireless ArduinoOTA update starting...")); });
    ArduinoOTA.onEnd([]() { Serial.println(F("\\n[OTA] Update complete! Rebooting...")); });
    ArduinoOTA.begin();

    // 7. Spawn high-priority Audio loop task pinned to Core 1
    xTaskCreatePinnedToCore(audioLoopTask, "AudioTask", 8192, NULL, 5, &AudioTaskHandle, 1);
    Serial.println(F("[SYS] System ready! Listening for DLNA casting, AirPlay and Web streams.\\n"));
}

void loop() {
    server.handleClient();
    dlna.loop();
    airplay.loop();
    ArduinoOTA.handle();
    vTaskDelay(pdMS_TO_TICKS(2));
}
`;

    case 'wifi-webserver':
      return `/**
 * @file main.cpp
 * @brief ESP32-S3 N16R8 High-Speed Web Server & Telemetry Dashboard
 * 
 * Utilizes the 8MB Octal PSRAM for buffer management and serving responsive web assets.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <esp_psram.h>
#include "esp32s3_n16r8_config.h"

// Large PSRAM Web Request Buffer (Allocated safely in 8MB PSRAM)
#define PSRAM_BUFFER_SIZE (1024 * 512) // 512 KB in PSRAM
char* pSramWebCache = nullptr;

WiFiServer server(80);

void setup() {
    Serial.begin(115200);
    delay(2000); // Allow USB-CDC to attach

    Serial.println(F("\\n[SYS] Booting ESP32-S3 N16R8 Web Server..."));
    printMemorySummary();

    // 1. Allocate 512KB cache buffer specifically from Octal PSRAM
    if (psramFound()) {
        pSramWebCache = (char*) ps_malloc(PSRAM_BUFFER_SIZE);
        if (pSramWebCache) {
            snprintf(pSramWebCache, PSRAM_BUFFER_SIZE, "ESP32-S3 N16R8 Fast PSRAM Cache Initialized.");
            Serial.printf("[PSRAM] Successfully allocated %d KB buffer in Octal PSRAM\\n", PSRAM_BUFFER_SIZE / 1024);
        } else {
            Serial.println(F("[!] Failed to allocate PSRAM cache buffer."));
        }
    }

    // 2. Launch WiFi in SoftAP mode or Station mode
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASS);
    
    IPAddress apIP = WiFi.softAPIP();
    Serial.print(F("[WIFI] Access Point started! SSID: "));
    Serial.println(DEFAULT_WIFI_SSID);
    Serial.print(F("[WIFI] Web Dashboard URL: http://"));
    Serial.println(apIP);

    server.begin();
    Serial.println(F("[HTTP] HTTP Server listening on port 80"));
}

void loop() {
    WiFiClient client = server.available();
    if (!client) {
        delay(10);
        return;
    }

    // Read HTTP request header
    String request = client.readStringUntil('\\r');
    client.flush();

    // Serve High-Performance Telemetry Dashboard
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: text/html");
    client.println("Connection: close");
    client.println();
    
    client.println("<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>");
    client.println("<title>ESP32-S3 N16R8 Dashboard</title>");
    client.println("<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:2rem;max-width:700px;margin:auto;}");
    client.println(".card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;}");
    client.println(".metric{font-size:1.8rem;font-weight:700;color:#58a6ff;} label{color:#8b949e;font-size:0.85rem;display:block;}");
    client.println(".grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}</style></head><body>");
    
    client.printf("<h2>⚡ %s</h2>", BOARD_NAME);
    client.println("<p style='color:#8b949e;'>ESP32-S3 N16R8 (16MB Flash • 8MB Octal PSRAM @ 240MHz)</p>");
    
    client.println("<div class='grid'>");
    client.printf("<div class='card'><label>Octal PSRAM Total</label><div class='metric'>%u MB</div></div>", ESP.getPsramSize() / (1024 * 1024));
    client.printf("<div class='card'><label>Octal PSRAM Free</label><div class='metric'>%u KB</div></div>", ESP.getFreePsram() / 1024);
    client.printf("<div class='card'><label>Flash Chip Size</label><div class='metric'>%u MB</div></div>", ESP.getFlashChipSize() / (1024 * 1024));
    client.printf("<div class='card'><label>Internal Free Heap</label><div class='metric'>%u KB</div></div>", ESP.getFreeHeap() / 1024);
    client.println("</div>");
    
    client.printf("<div class='card'><label>System Uptime</label><p>%lu seconds</p>", millis() / 1000);
    client.printf("<label>CPU Frequency</label><p>%u MHz (Dual-Core Xtensa LX7)</p></div>", getCpuFrequencyMhz());
    client.println("<button onclick='location.reload()' style='background:#238636;color:white;border:none;padding:10px 20px;border-radius:6px;font-weight:600;cursor:pointer;'>Refresh Telemetry</button>");
    client.println("</body></html>");

    delay(1);
    client.stop();
}
`;

    case 'freertos-dualcore':
      return `/**
 * @file main.cpp
 * @brief ESP32-S3 N16R8 Dual-Core FreeRTOS Architecture
 * 
 * Demonstrates pinning high-priority tasks to Core 0 (Networking/IO)
 * and Core 1 (DSP/Computation), sharing data via PSRAM buffers and queues.
 */

#include <Arduino.h>
#include <esp_psram.h>
#include "esp32s3_n16r8_config.h"

TaskHandle_t TaskCore0Handle = NULL;
TaskHandle_t TaskCore1Handle = NULL;
QueueHandle_t dataQueue = NULL;

struct TelemetryPacket {
    uint32_t packetId;
    float temperature;
    uint32_t freePsram;
    uint32_t timestamp;
};

// Task running on Core 0: High-speed Network / Ingestion
void TaskCore0(void *pvParameters) {
    Serial.printf("[Core 0] Task started on Core %d\\n", xPortGetCoreID());
    TelemetryPacket packet;

    for (;;) {
        if (xQueueReceive(dataQueue, &packet, portMAX_DELAY) == pdTRUE) {
            Serial.printf("[Core 0 Telemetry] ID: %lu | Free PSRAM: %lu KB | Temp: %.1f C\\n",
                          packet.packetId, packet.freePsram / 1024, packet.temperature);
        }
    }
}

// Task running on Core 1: Heavy Computation / Sensor Sampling
void TaskCore1(void *pvParameters) {
    Serial.printf("[Core 1] Task started on Core %d\\n", xPortGetCoreID());
    uint32_t counter = 0;

    for (;;) {
        TelemetryPacket packet;
        packet.packetId = ++counter;
        packet.freePsram = ESP.getFreePsram();
        packet.temperature = temperatureRead(); // Built-in on-die temperature
        packet.timestamp = millis();

        // Push to queue for Core 0
        xQueueSend(dataQueue, &packet, pdMS_TO_TICKS(50));

        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

void setup() {
    Serial.begin(115200);
    delay(2000);

    Serial.println(F("\\n[SYS] Initializing ESP32-S3 Dual-Core FreeRTOS Pipeline..."));
    printMemorySummary();

    // Create FreeRTOS Queue in memory
    dataQueue = xQueueCreate(20, sizeof(TelemetryPacket));

    // Spawn Core 0 task (Pinned to Core 0, priority 1, stack size 4096)
    xTaskCreatePinnedToCore(TaskCore0, "TaskCore0", 4096, NULL, 1, &TaskCore0Handle, 0);

    // Spawn Core 1 task (Pinned to Core 1, priority 2, stack size 4096)
    xTaskCreatePinnedToCore(TaskCore1, "TaskCore1", 4096, NULL, 2, &TaskCore1Handle, 1);
}

void loop() {
    // Empty: FreeRTOS tasks handle all work independently on both cores
    vTaskDelay(pdMS_TO_TICKS(10000));
}
`;

    case 'tinyml-edge-ai':
      return `/**
 * @file main.cpp
 * @brief ESP32-S3 N16R8 Edge AI / TinyML Tensor Arena Allocator
 * 
 * Takes advantage of 8MB Octal PSRAM and Xtensa Vector Instructions (SIMD)
 * to allocate large multi-megabyte tensor arenas for Deep Learning models.
 */

#include <Arduino.h>
#include <esp_psram.h>
#include "esp32s3_n16r8_config.h"

// 4 Megabytes Tensor Arena allocated directly in Octal PSRAM!
#define TENSOR_ARENA_SIZE (4 * 1024 * 1024)
uint8_t* tensorArena = nullptr;

void setup() {
    Serial.begin(115200);
    delay(2000);

    Serial.println(F("\\n=================================================="));
    Serial.println(F("  ESP32-S3 N16R8 Edge AI / TinyML Runtime Setup   "));
    Serial.println(F("=================================================="));
    printMemorySummary();

    if (!psramFound()) {
        Serial.println(F("[ERROR] PSRAM is required for Large Model Arena! Halting."));
        while (true) { delay(1000); }
    }

    Serial.printf("[TinyML] Allocating %d MB Tensor Arena in 8MB Octal PSRAM...\\n", TENSOR_ARENA_SIZE / (1024 * 1024));
    tensorArena = (uint8_t*) ps_malloc(TENSOR_ARENA_SIZE);

    if (tensorArena != nullptr) {
        Serial.printf("[TinyML] SUCCESS! Tensor Arena pointer: 0x%p\\n", tensorArena);
        Serial.printf("[TinyML] Remaining Free PSRAM: %u KB\\n", ESP.getFreePsram() / 1024);

        // Vector instruction memory warmup test
        Serial.println(F("[TinyML] Running SIMD vector memory bandwidth test..."));
        uint32_t startMs = millis();
        memset(tensorArena, 0xAA, TENSOR_ARENA_SIZE);
        uint32_t elapsedMs = millis() - startMs;
        
        float throughputMBps = ((float)TENSOR_ARENA_SIZE / (1024.0 * 1024.0)) / ((float)elapsedMs / 1000.0);
        Serial.printf("[TinyML] Wrote 4MB in %lu ms (Throughput: %.2f MB/s)\\n", elapsedMs, throughputMBps);
    } else {
        Serial.println(F("[TinyML] Allocation FAILED. Check PSRAM configuration."));
    }
}

void loop() {
    static uint32_t inferenceCount = 0;
    inferenceCount++;

    Serial.printf("[TinyML Loop #%lu] Ready for model execution. Free PSRAM: %u KB\\n",
                  inferenceCount, ESP.getFreePsram() / 1024);
    delay(3000);
}
`;

    case 'usb-serial-logger':
      return `/**
 * @file main.cpp
 * @brief ESP32-S3 N16R8 Native USB-OTG High-Speed Datalogger
 */

#include <Arduino.h>
#include <LittleFS.h>
#include "esp32s3_n16r8_config.h"

void setup() {
    Serial.begin(115200);
    delay(2000);

    Serial.println(F("\\n[SYS] ESP32-S3 N16R8 Native USB & LittleFS Datalogger"));
    printMemorySummary();

    if (!LittleFS.begin(true)) {
        Serial.println(F("[FS] LittleFS Mount Failed. Formatting..."));
    } else {
        Serial.printf("[FS] LittleFS Mounted successfully. Total: %u KB, Used: %u KB\\n",
                      LittleFS.totalBytes() / 1024, LittleFS.usedBytes() / 1024);
    }
}

void loop() {
    static uint32_t logIndex = 0;
    logIndex++;

    Serial.printf("[LOG #%lu] Uptime: %lu ms | Free PSRAM: %u KB | Free Heap: %u KB\\n",
                  logIndex, millis(), ESP.getFreePsram() / 1024, ESP.getFreeHeap() / 1024);
    
    delay(2000);
}
`;

    case 'psram-benchmark':
    default:
      return `/**
 * @file main.cpp
 * @brief ESP32-S3 N16R8 Hardware & 8MB Octal PSRAM Benchmark
 * 
 * Validates:
 * 1. 16MB Quad/Octal SPI Flash speed and size
 * 2. 8MB Octal SPI (OPI) PSRAM read/write verification
 * 3. Xtensa Dual-Core 240MHz CPU status and on-die thermal sensor
 * 4. WS2812 RGB LED status indicator (GPIO 48)
 */

#include <Arduino.h>
#include <esp_psram.h>
#include "esp32s3_n16r8_config.h"

#if defined(RGB_LED_PIN) && (RGB_LED_PIN > 0)
// Simple GPIO pulse for built-in LED
void blinkStatusLed() {
    pinMode(RGB_LED_PIN, OUTPUT);
    digitalWrite(RGB_LED_PIN, HIGH);
    delay(100);
    digitalWrite(RGB_LED_PIN, LOW);
}
#endif

void runPsramSpeedBenchmark() {
    Serial.println(F("\\n>>> Starting 8MB Octal PSRAM Read/Write Benchmark..."));
    
    if (!psramFound()) {
        Serial.println(F("[FAIL] PSRAM was NOT found! Verify build flags in platformio.ini."));
        return;
    }

    const size_t testSize = 2 * 1024 * 1024; // 2 Megabytes
    Serial.printf("Allocating %u MB test chunk in PSRAM...\\n", (uint32_t)(testSize / (1024 * 1024)));

    uint32_t* psramBuf = (uint32_t*) ps_malloc(testSize);
    if (!psramBuf) {
        Serial.println(F("[FAIL] Could not allocate 2MB buffer in PSRAM!"));
        return;
    }

    // 1. Write Benchmark
    uint32_t startWrite = micros();
    for (size_t i = 0; i < (testSize / sizeof(uint32_t)); i++) {
        psramBuf[i] = (uint32_t)(i ^ 0xA5A55A5A);
    }
    uint32_t writeTimeUs = micros() - startWrite;

    // 2. Read & Verify Benchmark
    bool verifyPass = true;
    uint32_t startRead = micros();
    for (size_t i = 0; i < (testSize / sizeof(uint32_t)); i++) {
        if (psramBuf[i] != (uint32_t)(i ^ 0xA5A55A5A)) {
            verifyPass = false;
            break;
        }
    }
    uint32_t readTimeUs = micros() - startRead;

    float writeSpeedMBps = ((float)testSize / (1024.0 * 1024.0)) / ((float)writeTimeUs / 1000000.0);
    float readSpeedMBps  = ((float)testSize / (1024.0 * 1024.0)) / ((float)readTimeUs / 1000000.0);

    Serial.printf("  [RESULT] Write speed: %.2f MB/s (%u us)\\n", writeSpeedMBps, writeTimeUs);
    Serial.printf("  [RESULT] Read speed:  %.2f MB/s (%u us)\\n", readSpeedMBps, readTimeUs);
    Serial.printf("  [VERIFY] Data Integrity: %s\\n", verifyPass ? "PASSED (100% matched)" : "FAILED (Corruption)");

    free(psramBuf);
    Serial.printf("  Free PSRAM after test: %u KB\\n\\n", ESP.getFreePsram() / 1024);
}

void setup() {
    Serial.begin(115200);
    
    // USB-CDC Delay to catch early boot logs
    delay(2500);

    Serial.println(F("\\n\\n************************************************"));
    Serial.printf("    WELCOME TO %s FIRMWARE\\n", BOARD_NAME);
    Serial.println(F("    Target: ESP32-S3 N16R8 (16MB Flash, 8MB PSRAM)"));
    Serial.println(F("************************************************\\n"));

    printMemorySummary();
    runPsramSpeedBenchmark();

#if defined(RGB_LED_PIN) && (RGB_LED_PIN > 0)
    blinkStatusLed();
#endif
}

void loop() {
    static uint32_t tick = 0;
    tick++;

    Serial.printf("[Heartbeat #%lu] Uptime: %lu s | Free PSRAM: %u KB | Free Heap: %u KB | Temp: %.1f C\\n",
                  tick,
                  millis() / 1000,
                  ESP.getFreePsram() / 1024,
                  ESP.getFreeHeap() / 1024,
                  temperatureRead());

    delay(3000);
}
`;
  }
}

function getReadmeContent(config: ProjectConfig, scheme: any): string {
  const isAudio = config.template === 'dlna-media-receiver';
  const mDns = config.audioSettings?.mDnsHost || 'esp32-audio';
  const bclk = config.audioSettings?.i2sBclkPin || 15;
  const lrc = config.audioSettings?.i2sLrcPin || 16;
  const dout = config.audioSettings?.i2sDoutPin || 17;

  return `# ${config.projectName} 🚀
> Complete firmware starter repository for **ESP32-S3 N16R8** (16MB Flash, 8MB Octal PSRAM)${isAudio ? ' • DLNA UPnP HiFi Media Receiver & Material UI Web Player' : ''}.

[![Build CI](https://github.com/${config.author || 'your-username'}/${config.projectName}/actions/workflows/ci.yml/badge.svg)](https://github.com/${config.author || 'your-username'}/${config.projectName}/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![ESP32-S3](https://img.shields.io/badge/Hardware-ESP32--S3-blue)](https://www.espressif.com/en/products/socs/esp32-s3)
[![Memory](https://img.shields.io/badge/Memory-16MB%20Flash%20%7C%208MB%20OPI%20PSRAM-green)](#)

## 📌 Hardware Specifications

| Component | Specification |
| :--- | :--- |
| **SoC** | Espressif ESP32-S3 Dual-core Xtensa LX7 @ 240 MHz |
| **Vector Extension** | Hardware SIMD instructions for DSP & Audio processing |
| **Flash Memory** | **16 MB** (${config.flashMode.toUpperCase()} Mode @ ${config.flashFreq.toUpperCase()}) |
| **PSRAM Memory** | **8 MB Octal SPI (OPI)** @ ${config.psramFreq.toUpperCase()} (Used for 1MB Audio Ring Buffer) |
| **USB** | Hardware USB Full-Speed OTG / CDC on GPIO 19 (D-) & 20 (D+) |
| **Status LED** | GPIO ${config.rgbLedPin} |

---

## ⚠️ CRITICAL PINOUT WARNING: OCTAL PSRAM
Because this board is equipped with **8MB Octal PSRAM (OPI)**, pins **GPIO 33, 34, 35, 36, and 37** are hardwired to the high-speed PSRAM bus:
- **DO NOT** connect external sensors, DACs, or displays to GPIO 33–37.
- Reconfiguring these pins in firmware will trigger an immediate **Cache Error Crash** and reboot loop!
${isAudio ? `
---

## 🎵 Audio Architecture & Features

### 1. Material Design 3 Web Player
- Visit **\`http://${mDns}.local\`** on any phone, tablet, or desktop on your network.
- Hosted directly on the ESP32-S3, featuring Material Design 3 cards, ripple buttons, tone sliders, and live track info.
- Built-in Internet Radio presets: Jazz, Chillout, Synthwave, BBC Radio 1.

### 2. DLNA / UPnP MediaRenderer (Always Ready)
- Any DLNA/UPnP app immediately discovers **"${config.audioSettings?.dlnaDeviceName || 'ESP32-S3 HiFi Streamer'}"** on the local Wi-Fi network:
  - **Android**: BubbleUPnP, mConnect, Hi-Fi Cast
  - **iOS**: mConnect Player, VLC
  - **Windows**: Right click any MP3/FLAC -> **"Cast to Device"** -> Select your ESP32-S3!
  - **macOS / Linux**: Audirvana, Foobar2000, VLC

### 3. AP Startup -> Home WiFi (With Auto-Fallback)
- On first boot or if home WiFi credentials are not found, boots into SoftAP: **\`ESP32S3-Audio-Setup\`** (Password: \`12345678\`).
- Once connected, configure your home Wi-Fi and reboot seamlessly into station mode.

### 4. Hardware 3-Band Tone Equalizer (EQ)
- Real-time digital signal processing (DSP) tone controls:
  - **Bass**: -16 dB to +16 dB
  - **Mid**: -16 dB to +16 dB
  - **Treble**: -16 dB to +16 dB
- Quick Presets: Flat, Bass Boost, Vocal / Podcast, Rock, Classical, Acoustic.

### 5. Seamless Wireless OTA Base
- **WebOTA**: Upload \`firmware.bin\` directly via the web dashboard at \`http://${mDns}.local/update\`.
- **ArduinoOTA**: Flash over the network from PlatformIO:
  \`\`\`bash
  pio run -e esp32-s3-n16r8 -t upload --upload-port ${mDns}.local
  \`\`\`
- Utilizes the 16MB dual OTA partition table (\`app0\` 6.5MB, \`app1\` 6.5MB) with automatic rollback protection.

### 6. I2S DAC Wiring Guide (MAX98357A / PCM5102A / ES9038)

| I2S Pin | ESP32-S3 GPIO | Note |
| :--- | :--- | :--- |
| **BCLK** (Bit Clock) | **GPIO ${bclk}** | Safe general I/O |
| **LRC / WS** (Word Select) | **GPIO ${lrc}** | Safe general I/O |
| **DOUT / DIN** (Data) | **GPIO ${dout}** | Safe general I/O |
| **VCC** | 5V / 3.3V | External DAC power |
| **GND** | GND | Common ground |
` : ''}
---

## 💾 16MB Partition Scheme (${scheme.name})

Custom partition table configured in \`partitions_16MB.csv\`:

\`\`\`csv
${generateCsvPartitionTable(scheme).trim()}
\`\`\`

---

## 🛠️ Quick Start

### 2. ⚡ 1-Click Flash with Single merged.bin (Web or CLI)
PlatformIO automatically creates a complete factory image at \`.pio/build/esp32-s3-n16r8/merged.bin\` (packs bootloader, partitions, boot_app0, and app into one file).

- **Via Web Flasher (Chrome / Edge, No Python needed):**
  1. Open [Espressif Web Flasher](https://espressif.github.io/esptool-js/)
  2. Select your USB port and upload \`merged.bin\` at offset **\`0x0\`**!

- **Via esptool.py (Single Command):**
  \`\`\`bash
  esptool.py --chip esp32s3 -p /dev/ttyACM0 -b 921600 write_flash 0x0 .pio/build/esp32-s3-n16r8/merged.bin
  \`\`\`

### 3. Build & Flash using PlatformIO CLI
\`\`\`bash
# 1. Clone your GitHub repository
git clone https://github.com/${config.author || 'your-username'}/${config.projectName}.git
cd ${config.projectName}

# 2. Build the firmware (scripts/merge_bin.py will auto-generate merged.bin)
pio run -e esp32-s3-n16r8

# 3. Flash to board (replace with your COM port or /dev/ttyACM0)
pio run -e esp32-s3-n16r8 -t upload --upload-port /dev/ttyACM0

# 4. Open Serial Monitor (115200 baud)
pio device monitor -b 115200
\`\`\`

${isAudio ? `### 4. Wireless OTA Flashing (Once initial flash is complete)
\`\`\`bash
pio run -e esp32-s3-n16r8 -t upload --upload-port ${mDns}.local
\`\`\`
` : ''}
---

## 🚀 GitHub Actions CI/CD Included
This repository includes a pre-configured \`.github/workflows/ci.yml\` workflow. Whenever you push commits or open pull requests to GitHub, GitHub Actions automatically:
1. Provisions Python 3.11 and PlatformIO Core.
2. Caches dependencies for lightning-fast builds.
3. Compiles the firmware specifically for the ESP32-S3 N16R8 target.
4. Auto-generates and uploads downloadable compiled binary artifacts (\`merged.bin\`, \`firmware.bin\`, \`bootloader.bin\`, \`partitions.bin\`).

---

## 📄 License
MIT License. Feel free to use in personal and commercial IoT products!
`;
}
