#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <ESPAsyncWebServer.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ESP8266Audio Real I2S Multi-Format Decoder Pipeline
#include "AudioFileSourceHTTPStream.h"
#include "AudioFileSourceBuffer.h"
#include "AudioGeneratorMP3.h"
#include "AudioGeneratorAAC.h"
#include "AudioGeneratorFLAC.h"
#include "AudioGeneratorOpus.h"
#include "AudioGeneratorWAV.h"
#include "AudioOutputI2S.h"
#include "airplay_raop.h"

// I2S Audio Pin Definitions for UDA1334A DAC (ESP32-S3 N16R8)
#define I2S_BCLK_PIN    14   // Bit Clock -> UDA1334A BCLK
#define I2S_WCLK_PIN    15   // Word Clock -> UDA1334A WSEL / LRC
#define I2S_DOUT_PIN    16   // Data Out  -> UDA1334A DIN
#define STATUS_LED_PIN   2   // Onboard indicator LED

// Allocate 256KB Ring Buffer in 8MB PSRAM for stutter-free audio streaming
#define PSRAM_BUFFER_SIZE (256 * 1024)

AsyncWebServer server(80);
WiFiUDP ssdpUdp;
AirPlayReceiver airplay;
const IPAddress SSDP_MULTICAST_IP(239, 255, 255, 250);
const unsigned int SSDP_PORT = 1900;
static volatile bool pendingStaGotIp = false;

// Audio Pipeline Polymorphic Pointers
AudioFileSourceHTTPStream *httpStream = nullptr;
AudioFileSourceBuffer *ringBuffer = nullptr;
AudioGenerator *activeDecoder = nullptr;
AudioOutputI2S *i2sOutput = nullptr;
uint8_t *psramBufferMemory = nullptr;
size_t actualBufferSize = PSRAM_BUFFER_SIZE;

// System & Audio State (Persisted in NVS)
int currentVolume = 75; // 0 to 100%
int currentBass = 0;    // -16 to +16 dB
int currentMid = 0;     // -16 to +16 dB
int currentTreble = 0;  // -16 to +16 dB
bool isPlaying = false;
bool isMuted = false;
String currentTrack = "Stopped";
String currentUrl = "";
String currentCodec = "None"; // MP3, AAC, FLAC, Opus, AirPlay
String savedSsid = "";
String savedPass = "";

// NVS Storage Helper Functions (Safe open/commit/close per call)
void loadSettingsFromNVS() {
    Preferences p;
    if (p.begin("audio_node", true)) {
        currentVolume = p.getInt("volume", 75);
        currentBass = p.getInt("bass", 0);
        currentMid = p.getInt("mid", 0);
        currentTreble = p.getInt("treble", 0);
        savedSsid = p.getString("ssid", "");
        savedPass = p.getString("pass", "");
        p.end();
    }
    Serial.printf("[NVS] Loaded settings: Vol=%d%%, Bass=%d dB, Mid=%d dB, Treble=%d dB, WiFi=%s\n",
                  currentVolume, currentBass, currentMid, currentTreble, savedSsid.c_str());
}

void saveVolumeToNVS(int vol) {
    Preferences p;
    if (p.begin("audio_node", false)) {
        p.putInt("volume", vol);
        p.end();
    }
}

void saveToneToNVS(int b, int m, int t) {
    Preferences p;
    if (p.begin("audio_node", false)) {
        p.putInt("bass", b);
        p.putInt("mid", m);
        p.putInt("treble", t);
        p.end();
    }
}

void saveWifiToNVS(const String& ssid, const String& pass) {
    savedSsid = ssid;
    savedPass = pass;
    Preferences p;
    if (p.begin("audio_node", false)) {
        p.putString("ssid", ssid);
        p.putString("pass", pass);
        p.end();
    }
    Serial.printf("[NVS] Wi-Fi credentials saved for SSID: %s\n", ssid.c_str());
}

// Forward declarations
void stopAudioPlayback();
void startAudioStream(const String &url, const String &trackName);

// UPnP / DLNA Device Description XML
const char UPNP_DESC_XML[] PROGMEM = R"rawxml(<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
    <friendlyName>ESP32-S3 HiFi Node (UDA1334A)</friendlyName>
    <manufacturer>Open-Air HiFi</manufacturer>
    <modelDescription>HiFi Network Audio Renderer</modelDescription>
    <modelName>ESP32-S3 N16R8</modelName>
    <modelNumber>S3-HiFi-v1</modelNumber>
    <UDN>uuid:2b7405e0-8a4e-4e4b-91d1-esp32s3audio01</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
        <SCPDURL>/upnp/AVTransport.xml</SCPDURL>
        <controlURL>/upnp/control/AVTransport</controlURL>
        <eventSubURL>/upnp/event/AVTransport</eventSubURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
        <SCPDURL>/upnp/RenderingControl.xml</SCPDURL>
        <controlURL>/upnp/control/RenderingControl</controlURL>
        <eventSubURL>/upnp/event/RenderingControl</eventSubURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
        <SCPDURL>/upnp/ConnectionManager.xml</SCPDURL>
        <controlURL>/upnp/control/ConnectionManager</controlURL>
        <eventSubURL>/upnp/event/ConnectionManager</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>
)rawxml";

// UPnP AVTransport Service XML definition
const char AVTRANSPORT_XML[] PROGMEM = R"rawxml(<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action><name>SetAVTransportURI</name></action>
    <action><name>Play</name></action>
    <action><name>Pause</name></action>
    <action><name>Stop</name></action>
    <action><name>GetTransportInfo</name></action>
    <action><name>GetPositionInfo</name></action>
    <action><name>GetMediaInfo</name></action>
    <action><name>GetDeviceCapabilities</name></action>
  </actionList>
</scpd>
)rawxml";

// UPnP RenderingControl Service XML definition
const char RENDERING_CONTROL_XML[] PROGMEM = R"rawxml(<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action><name>SetVolume</name></action>
    <action><name>GetVolume</name></action>
    <action><name>SetMute</name></action>
    <action><name>GetMute</name></action>
  </actionList>
</scpd>
)rawxml";

// UPnP ConnectionManager Service XML definition
const char CONNECTION_MANAGER_XML[] PROGMEM = R"rawxml(<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action><name>GetProtocolInfo</name></action>
    <action><name>GetCurrentConnectionIDs</name></action>
    <action><name>GetCurrentConnectionInfo</name></action>
  </actionList>
</scpd>
)rawxml";

// Embedded Responsive Material Design 3 Dashboard
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ESP32-S3 HiFi Node (UDA1334A) • Material 3 HiFi Control</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Google+Sans:wght@400;500;700&family=Material+Symbols+Outlined" rel="stylesheet">
  <style>
    :root {
      --md-sys-color-primary: #80d49f;
      --md-sys-color-on-primary: #00381e;
      --md-sys-color-primary-container: #00522e;
      --md-sys-color-on-primary-container: #9cf1bb;
      --md-sys-color-surface: #111411;
      --md-sys-color-on-surface: #e1e3de;
      --md-sys-color-surface-container: #1d201d;
      --md-sys-color-surface-container-high: #282b27;
      --md-sys-color-outline: #8a938b;
      --md-sys-color-outline-variant: #414942;
      --md-sys-shape-corner-large: 24px;
      --md-sys-shape-corner-full: 9999px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Google Sans', 'Roboto', system-ui, sans-serif;
      background-color: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface);
      padding-bottom: 30px;
    }
    header {
      background: var(--md-sys-color-surface-container);
      padding: 14px 24px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge-group {
      display: flex;
      gap: 6px;
    }
    .badge {
      padding: 4px 12px;
      border-radius: var(--md-sys-shape-corner-full);
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .badge-dlna {
      background: rgba(128, 212, 159, 0.15);
      color: #9cf1bb;
      border: 1px solid rgba(128, 212, 159, 0.3);
    }
    .badge-airplay {
      background: rgba(56, 189, 248, 0.15);
      color: #7dd3fc;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }

    /* Live Date & Time Bar */
    .datetime-bar {
      background: #181c18;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      padding: 8px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      font-family: monospace;
      color: var(--md-sys-color-outline);
    }
    .datetime-clock {
      color: var(--md-sys-color-primary);
      font-weight: 700;
      background: #111411;
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    main {
      max-width: 1100px;
      margin: 20px auto;
      padding: 0 16px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--md-sys-color-surface-container);
      border-radius: var(--md-sys-shape-corner-large);
      border: 1px solid var(--md-sys-color-outline-variant);
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .card-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--md-sys-color-outline);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .slider-row {
      margin-bottom: 14px;
    }
    .slider-label {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    input[type=range] {
      width: 100%;
      accent-color: var(--md-sys-color-primary);
      height: 6px;
      background: var(--md-sys-color-surface-container-high);
      border-radius: 4px;
      cursor: pointer;
    }
    .chip-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .chip {
      background: var(--md-sys-color-surface-container-high);
      color: var(--md-sys-color-on-surface);
      border: 1px solid var(--md-sys-color-outline-variant);
      padding: 5px 12px;
      border-radius: var(--md-sys-shape-corner-full);
      font-size: 11px;
      cursor: pointer;
      transition: 0.15s;
    }
    .chip:hover { border-color: var(--md-sys-color-primary); }
    .chip.active {
      background: var(--md-sys-color-primary-container);
      color: var(--md-sys-color-on-primary-container);
      border-color: var(--md-sys-color-primary);
    }
    .input-btn-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    input[type=text], input[type=password] {
      width: 100%;
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 12px;
      color: white;
      padding: 8px 12px;
      font-size: 12px;
      font-family: monospace;
    }
    .btn-filled {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      border: none;
      border-radius: 12px;
      padding: 8px 16px;
      font-weight: 700;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    /* Mobile Responsive Optimizations */
    @media (max-width: 680px) {
      header {
        padding: 12px 16px;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
      .badge-group {
        flex-wrap: wrap;
        width: 100%;
      }
      .datetime-bar {
        padding: 8px 16px;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
      }
      .player-bar {
        padding: 12px 16px;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      .track-info {
        text-align: center;
      }
      .ctrl-buttons {
        justify-content: center;
      }
      .vol-control {
        width: 100%;
        justify-content: center;
      }
      .custom-select {
        font-size: 13px;
        padding: 12px 14px;
      }
      .btn-filled {
        min-height: 44px;
        font-size: 13px;
      }
    }

    /* Top Media Controller Bar (Right below Live Internet Time) */
    .player-bar {
      background: #141714;
      border-bottom: 2px solid var(--md-sys-color-outline-variant);
      padding: 12px 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    }
    .track-info {
      display: flex;
      flex-direction: column;
      min-width: 130px;
    }
    .track-info h4 { font-size: 13px; color: white; margin: 0; font-weight: 700; }
    .track-info p { font-size: 11px; color: var(--md-sys-color-outline); font-family: monospace; margin-top: 2px; }
    .ctrl-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .vol-control {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--md-sys-color-surface-container-high);
      padding: 6px 14px;
      border-radius: var(--md-sys-shape-corner-full);
      border: 1px solid var(--md-sys-color-outline-variant);
    }
    .ctrl-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      transition: 0.15s;
    }
    .ctrl-btn:hover { background: rgba(255, 255, 255, 0.15); }
    .ctrl-btn.play {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      width: 46px;
      height: 46px;
      border: none;
    }
    .custom-select {
      width: 100%;
      background: var(--md-sys-color-surface-container-high);
      color: white;
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 12px;
      outline: none;
      cursor: pointer;
    }
    .custom-select option {
      background: #1c201c;
      color: #e1e3de;
      padding: 6px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h2 style="font-size: 16px; font-weight: 700;">ESP32-S3 HiFi Node (UDA1334A)</h2>
      <p style="font-size: 11px; color: var(--md-sys-color-outline);">ESP32-S3 N16R8 • http://esp32-audio.local</p>
    </div>
    <div class="badge-group">
      <div class="badge badge-dlna" title="DLNA / UPnP MediaRenderer v1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg> DLNA
      </div>
      <div class="badge badge-airplay" title="Apple AirPlay 2 / RAOP Receiver">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 22h12l-6-6-6 6zM21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v-2H3V5h18v12h-4v2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg> AirPlay 2
      </div>
      <div class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg> <span id="codecBadge">MP3/AAC/M4A/FLAC/Opus/WAV</span>
      </div>
    </div>
  </header>

  <!-- Live Internet Date + Timer -->
  <div class="datetime-bar">
    <div style="display: flex; gap: 10px; align-items: center;">
      <span style="color: var(--md-sys-color-primary); font-weight: bold;">● LIVE INTERNET TIME</span>
      <span id="liveDate">Loading...</span>
      <span id="liveTime" class="datetime-clock">00:00:00</span>
    </div>
    <div>UDA1334A I2S • 44.1kHz • 8MB PSRAM</div>
  </div>

  <!-- Top Media Controller Bar (Placed directly after Live Internet Time) -->
  <div class="player-bar">
    <div class="track-info">
      <h4 id="nowPlayingTitle">SomaFM Groove Salad</h4>
      <p id="nowPlayingSource">I2S Line-Out • UDA1334A</p>
    </div>
    
    <div class="ctrl-buttons">
      <!-- Prev -->
      <button class="ctrl-btn" onclick="prevTrack()" title="Previous Station">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
      </button>

      <!-- Stop -->
      <button class="ctrl-btn" onclick="stopAudio()" title="Stop">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
      </button>

      <!-- Play / Pause -->
      <button class="ctrl-btn play" onclick="togglePlay()" id="playBtn" title="Play / Pause">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      </button>

      <!-- Next -->
      <button class="ctrl-btn" onclick="nextTrack()" title="Next Station">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>
    </div>

    <div class="vol-control">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--md-sys-color-outline);"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
      <input type="range" id="vol" min="0" max="100" value="65" style="width: 90px;" oninput="setVol(this.value)">
    </div>
  </div>

  <main>
    <!-- TILE 1: 3-Band Tone Equalizer (Stand-alone) -->
    <div class="card">
      <div>
        <div class="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--md-sys-color-primary);"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg> 3-Band Tone EQ
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>Bass (Low Frequencies)</span><span id="bassVal">0 dB</span></div>
          <input type="range" id="bass" min="-16" max="16" value="0" oninput="updateTone()">
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>Midrange (Vocals)</span><span id="midVal">0 dB</span></div>
          <input type="range" id="mid" min="-16" max="16" value="0" oninput="updateTone()">
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>Treble (High Frequencies)</span><span id="trebleVal">0 dB</span></div>
          <input type="range" id="treble" min="-16" max="16" value="0" oninput="updateTone()">
        </div>
        <div class="chip-group">
          <span class="chip active" onclick="applyPreset(0,0,0,this)">Flat</span>
          <span class="chip" onclick="applyPreset(7,1,-1,this)">Bass Boost</span>
          <span class="chip" onclick="applyPreset(-2,5,2,this)">Vocal</span>
          <span class="chip" onclick="applyPreset(5,2,4,this)">Rock</span>
          <span class="chip" onclick="applyPreset(3,0,4,this)">Classical</span>
        </div>
      </div>
      <div style="font-size: 10px; color: var(--md-sys-color-outline); margin-top: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px;">
        Direct I2S Hardware DSP Filter
      </div>
    </div>

    <!-- TILE 2: Direct HTTP Link & Preset Radio Player -->
    <div class="card">
      <div>
        <div class="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--md-sys-color-primary);"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg> HTTP & Radio Player
        </div>
        
        <!-- Radio Preset Dropdown Form -->
        <div style="margin-bottom: 14px;">
          <label for="radioSelect" style="display: block; font-size: 11px; color: var(--md-sys-color-outline); margin-bottom: 6px; font-weight: 600;">PRESET RADIO STATIONS:</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <select id="radioSelect" class="custom-select" onchange="onRadioSelected(this)">
              <option value="" disabled selected>-- Select a Radio Station --</option>
              <option value="http://ice1.somafm.com/groovesalad-128-mp3" data-name="SomaFM Groove Salad (MP3)">🥗 SomaFM Groove Salad (128k MP3)</option>
              <option value="http://ice1.somafm.com/groovesalad-128-aac" data-name="SomaFM Groove Salad (AAC)">🎧 SomaFM Groove Salad (128k AAC/M4A)</option>
              <option value="http://stream.srg-ssr.ch/m/rsj/mp3_128" data-name="Swiss Radio Jazz">🎷 Swiss Radio Jazz (128k MP3)</option>
              <option value="http://ice1.somafm.com/defcon-128-mp3" data-name="DEF CON Radio">⚡ DEF CON Radio (128k MP3 Synthwave)</option>
              <option value="http://ice1.somafm.com/dronezone-128-mp3" data-name="SomaFM Drone Zone">🌌 SomaFM Drone Zone (128k MP3 Ambient)</option>
              <option value="http://media-ice.musicradio.com/ClassicFMMP3" data-name="Classic FM UK">🎻 Classic FM UK (128k MP3 Classical)</option>
              <option value="http://stream.live.vc.bbcmedia.co.uk/bbc_world_service" data-name="BBC World Service">📻 BBC World Service (96k AAC Live)</option>
              <option value="http://streams.ilovemusic.de/iloveradio17.mp3" data-name="Chillhop Lo-Fi">☕ Chillhop & Lo-Fi Beats (128k MP3)</option>
            </select>
            <button class="btn-filled" onclick="playSelectedRadio()" style="width: 100%;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Play Selected Station
            </button>
          </div>
        </div>

        <p style="font-size: 11px; color: var(--md-sys-color-outline); margin-bottom: 6px;">
          Or enter custom audio URL:
        </p>
        <div class="input-btn-row">
          <input type="text" id="streamUrl" placeholder="http://stream-server.com/audio.wav">
          <button class="btn-filled" onclick="playUrl()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Stream URL
          </button>
        </div>
      </div>
      <div style="font-size: 10px; color: var(--md-sys-color-outline); margin-top: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px;">
        Auto-Codec: MP3 • AAC / M4A (MP4A) • WAV (PCM) • FLAC • Opus
      </div>
    </div>

    <!-- TILE 3: Wi-Fi, DLNA & AirPlay Receiver (Combined) -->
    <div class="card">
      <div>
        <div class="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--md-sys-color-primary);"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg> Wi-Fi, DLNA & AirPlay 2
        </div>
        <p style="font-size: 11px; color: var(--md-sys-color-outline); margin-bottom: 8px;">
          Network streaming receivers running simultaneously:
        </p>
        <div style="background: var(--md-sys-color-surface-container-high); border-radius: 12px; padding: 10px; font-size: 11px; margin-bottom: 10px; border: 1px solid var(--md-sys-color-outline-variant);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span>DLNA / UPnP Renderer</span><span style="color: var(--md-sys-color-primary); font-weight: 600;">Active (SSDP 1900)</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Apple AirPlay 2 / RAOP</span><span style="color: #7dd3fc; font-weight: 600;">Active (Port 5000)</span>
          </div>
        </div>
        <div class="input-btn-row">
          <input type="text" id="wifiSsid" placeholder="WiFi SSID">
          <input type="password" id="wifiPass" placeholder="WiFi Password">
          <button class="btn-filled" onclick="saveWiFi()">Save & Connect</button>
        </div>
      </div>
      <div style="font-size: 10px; color: var(--md-sys-color-outline); margin-top: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px;">
        mDNS: http://esp32-audio.local
      </div>
    </div>

    <!-- TILE 4: Wireless WebOTA Firmware Update -->
    <div class="card">
      <div>
        <div class="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--md-sys-color-primary);"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg> Wireless WebOTA
        </div>
        <p style="font-size: 11px; color: var(--md-sys-color-outline); margin-bottom: 10px;">
          16MB Dual OTA Failsafe Storage. Upload firmware.bin directly:
        </p>
        <form method="POST" action="/update" enctype="multipart/form-data" class="input-btn-row">
          <input type="file" name="update" accept=".bin" style="color: white; font-size: 11px;">
          <button type="submit" class="btn-filled">Upload & Flash OTA</button>
        </form>
      </div>
      <div style="font-size: 10px; color: var(--md-sys-color-outline); margin-top: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px;">
        Partition: Dual 6.5MB App Slots
      </div>
    </div>
  </main>

  <script>
    const STATIONS = [
      { name: 'SomaFM Groove Salad (MP3)', url: 'http://ice1.somafm.com/groovesalad-128-mp3' },
      { name: 'SomaFM Groove Salad (AAC)', url: 'http://ice1.somafm.com/groovesalad-128-aac' },
      { name: 'Swiss Radio Jazz', url: 'http://stream.srg-ssr.ch/m/rsj/mp3_128' },
      { name: 'DEF CON Radio', url: 'http://ice1.somafm.com/defcon-128-mp3' },
      { name: 'SomaFM Drone Zone', url: 'http://ice1.somafm.com/dronezone-128-mp3' },
      { name: 'Classic FM UK', url: 'http://media-ice.musicradio.com/ClassicFMMP3' },
      { name: 'BBC World Service', url: 'http://stream.live.vc.bbcmedia.co.uk/bbc_world_service' },
      { name: 'Chillhop Lo-Fi', url: 'http://streams.ilovemusic.de/iloveradio17.mp3' }
    ];
    let curStationIdx = 0;

    const SVG_PLAY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    const SVG_PAUSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

    // Live internet clock updater
    setInterval(() => {
      const d = new Date();
      document.getElementById('liveDate').innerText = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      document.getElementById('liveTime').innerText = d.toLocaleTimeString();
    }, 1000);

    function updateTone() {
      const b = document.getElementById('bass').value;
      const m = document.getElementById('mid').value;
      const t = document.getElementById('treble').value;
      document.getElementById('bassVal').innerText = (b > 0 ? '+' : '') + b + ' dB';
      document.getElementById('midVal').innerText = (m > 0 ? '+' : '') + m + ' dB';
      document.getElementById('trebleVal').innerText = (t > 0 ? '+' : '') + t + ' dB';
      fetch('/api/tone?bass=' + b + '&mid=' + m + '&treble=' + t, { method: 'POST' });
    }

    function applyPreset(b, m, t, el) {
      document.getElementById('bass').value = b;
      document.getElementById('mid').value = m;
      document.getElementById('treble').value = t;
      document.querySelectorAll('.chip-group .chip').forEach(c => c.classList.remove('active'));
      if (el) el.classList.add('active');
      updateTone();
    }

    function playUrl() {
      const url = document.getElementById('streamUrl').value;
      if (!url) return;
      fetch('/api/play', { method: 'POST', body: url });
      document.getElementById('nowPlayingTitle').innerText = 'Custom Stream';
      document.getElementById('nowPlayingSource').innerText = url;
    }

    function onRadioSelected(selectEl) {
      const opt = selectEl.options[selectEl.selectedIndex];
      if (opt && opt.value) {
        document.getElementById('streamUrl').value = opt.value;
      }
    }

    function playSelectedRadio() {
      const sel = document.getElementById('radioSelect');
      const opt = sel.options[sel.selectedIndex];
      if (!opt || !opt.value) {
        alert('Please choose a radio station from the dropdown');
        return;
      }
      setRadio(opt.value, opt.getAttribute('data-name') || opt.text);
    }

    function setRadio(url, name) {
      document.getElementById('streamUrl').value = url;
      fetch('/api/play', { method: 'POST', body: url });
      document.getElementById('nowPlayingTitle').innerText = name;
      document.getElementById('nowPlayingSource').innerText = url;
    }

    function nextTrack() {
      curStationIdx = (curStationIdx + 1) % STATIONS.length;
      setRadio(STATIONS[curStationIdx].url, STATIONS[curStationIdx].name);
      const sel = document.getElementById('radioSelect');
      if (sel) sel.value = STATIONS[curStationIdx].url;
    }

    function prevTrack() {
      curStationIdx = (curStationIdx - 1 + STATIONS.length) % STATIONS.length;
      setRadio(STATIONS[curStationIdx].url, STATIONS[curStationIdx].name);
      const sel = document.getElementById('radioSelect');
      if (sel) sel.value = STATIONS[curStationIdx].url;
    }

    function stopAudio() {
      fetch('/api/pause', { method: 'POST' });
      document.getElementById('playBtn').innerHTML = SVG_PLAY;
    }

    function setVol(val) {
      fetch('/api/volume?val=' + val, { method: 'POST' });
    }

    function togglePlay() {
      fetch('/api/pause', { method: 'POST' })
        .then(r => r.text())
        .then(state => {
          document.getElementById('playBtn').innerHTML = state === 'PLAYING' ? SVG_PAUSE : SVG_PLAY;
        });
    }

    let isSavingWifi = false;
    function saveWiFi() {
      if (isSavingWifi) return;
      const ssid = document.getElementById('wifiSsid').value;
      const pass = document.getElementById('wifiPass').value;
      if (!ssid) {
        alert('Please enter a Wi-Fi SSID');
        return;
      }
      isSavingWifi = true;
      fetch('/api/wifi?ssid=' + encodeURIComponent(ssid) + '&pass=' + encodeURIComponent(pass), { method: 'POST' })
        .then(() => {
          alert('Wi-Fi credentials saved! Connecting to ' + ssid + '...');
          setTimeout(() => { isSavingWifi = false; }, 3000);
        })
        .catch(() => {
          isSavingWifi = false;
        });
    }
  
    let initialSynced = false;

    // Real-time hardware telemetry and playback poller
    function pollStatus() {
      fetch('/api/status')
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (!initialSynced) {
            initialSynced = true;
            if (d.volume !== undefined) {
              var vEl = document.getElementById('vol');
              if (vEl) vEl.value = d.volume;
            }
            if (d.bass !== undefined) {
              var bEl = document.getElementById('bass');
              if (bEl) { bEl.value = d.bass; document.getElementById('bassVal').innerText = (d.bass > 0 ? '+' : '') + d.bass + ' dB'; }
            }
            if (d.mid !== undefined) {
              var mEl = document.getElementById('mid');
              if (mEl) { mEl.value = d.mid; document.getElementById('midVal').innerText = (d.mid > 0 ? '+' : '') + d.mid + ' dB'; }
            }
            if (d.treble !== undefined) {
              var tEl = document.getElementById('treble');
              if (tEl) { tEl.value = d.treble; document.getElementById('trebleVal').innerText = (d.treble > 0 ? '+' : '') + d.treble + ' dB'; }
            }
          }
          if (d.codec) {
            var cEl = document.getElementById('codecBadge');
            if (cEl) cEl.innerText = d.codec;
          }
          if (d.track && d.track.length > 0) {
            var el = document.getElementById('nowPlayingTitle');
            if (el) el.innerText = d.track;
          }
          if (d.url && d.url.length > 0) {
            var el = document.getElementById('nowPlayingSource');
            if (el) el.innerText = d.url;
          }
          var heapEl = document.getElementById('freeHeapVal');
          if (heapEl && d.freeHeap) {
            heapEl.innerText = Math.round(d.freeHeap / 1024) + ' KB';
          }
          var psramEl = document.getElementById('freePsramVal');
          if (psramEl && d.freePsram) {
            psramEl.innerText = (d.freePsram / (1024 * 1024)).toFixed(2) + ' MB';
          }
          var playBtn = document.getElementById('playBtn');
          if (playBtn) {
            playBtn.innerHTML = d.playing ? SVG_PAUSE : SVG_PLAY;
          }
        })
        .catch(function() {});
    }
    setInterval(pollStatus, 2000);
    setTimeout(pollStatus, 500);
  </script>
</body>
</html>
)rawliteral";

// Real Audio Pipeline: Stop playback safely
void stopAudioPlayback() {
    if (activeDecoder && activeDecoder->isRunning()) {
        activeDecoder->stop();
    }
    delete activeDecoder; activeDecoder = nullptr;
    delete ringBuffer;    ringBuffer = nullptr;
    delete httpStream;    httpStream = nullptr;
    isPlaying = false;
    currentCodec = "None";
    Serial.println("[AUDIO] Playback stopped. I2S silenced.");
}

// Real Audio Pipeline: Stream URL and decode directly into UDA1334A I2S
void startAudioStream(const String &url, const String &trackName) {
    stopAudioPlayback();
    currentUrl = url;
    currentTrack = trackName;

    Serial.printf("[AUDIO] Connecting to HTTP stream: %s\n", url.c_str());
    httpStream = new AudioFileSourceHTTPStream(url.c_str());
    if (!httpStream) {
        Serial.println("[AUDIO] Failed to allocate HTTP stream!");
        return;
    }

    // Allocate 256KB Ring Buffer in 8MB PSRAM to prevent under-runs
    ringBuffer = new AudioFileSourceBuffer(httpStream, psramBufferMemory, actualBufferSize);
    if (!ringBuffer) {
        Serial.println("[AUDIO] Failed to allocate PSRAM ring buffer!");
        delete httpStream; httpStream = nullptr;
        return;
    }

    // Multi-format audio decoder factory: AAC/M4A/MP4A, WAV (PCM), FLAC, Opus, MP3
    String lowerUrl = url;
    lowerUrl.toLowerCase();

    if (lowerUrl.indexOf(".aac") >= 0 || lowerUrl.indexOf("/aac") >= 0 || lowerUrl.indexOf("-aac") >= 0 || 
        lowerUrl.indexOf(".m4a") >= 0 || lowerUrl.indexOf("mp4a") >= 0 || lowerUrl.indexOf(".mp4") >= 0) {
        currentCodec = "AAC/M4A";
        activeDecoder = new AudioGeneratorAAC();
        Serial.println("[AUDIO] Instantiated AudioGeneratorAAC (AAC/M4A/MP4A)");
    } else if (lowerUrl.indexOf(".wav") >= 0 || lowerUrl.indexOf(".wave") >= 0 || lowerUrl.indexOf("/wav") >= 0) {
        currentCodec = "WAV";
        activeDecoder = new AudioGeneratorWAV();
        Serial.println("[AUDIO] Instantiated AudioGeneratorWAV (Uncompressed PCM)");
    } else if (lowerUrl.indexOf(".flac") >= 0 || lowerUrl.indexOf("/flac") >= 0) {
        currentCodec = "FLAC";
        activeDecoder = new AudioGeneratorFLAC();
        Serial.println("[AUDIO] Instantiated AudioGeneratorFLAC");
    } else if (lowerUrl.indexOf(".opus") >= 0 || lowerUrl.indexOf("/opus") >= 0 || lowerUrl.indexOf(".ogg") >= 0) {
        currentCodec = "Opus";
        activeDecoder = new AudioGeneratorOpus();
        Serial.println("[AUDIO] Instantiated AudioGeneratorOpus");
    } else {
        // Default to MP3
        currentCodec = "MP3";
        activeDecoder = new AudioGeneratorMP3();
        Serial.println("[AUDIO] Instantiated AudioGeneratorMP3 (default)");
    }

    if (!activeDecoder) {
        Serial.printf("[AUDIO] Failed to create %s decoder!\n", currentCodec.c_str());
        delete ringBuffer; ringBuffer = nullptr;
        delete httpStream; httpStream = nullptr;
        currentCodec = "None";
        return;
    }

    if (activeDecoder->begin(ringBuffer, i2sOutput)) {
        isPlaying = true;
        Serial.printf("[AUDIO] Streaming SUCCESS! Codec: %s -> Outputting to UDA1334A (BCLK=%d, WSEL=%d, DIN=%d)\n", 
                      currentCodec.c_str(), I2S_BCLK_PIN, I2S_WCLK_PIN, I2S_DOUT_PIN);
    } else {
        Serial.printf("[AUDIO] %s decoder begin failed!\n", currentCodec.c_str());
        stopAudioPlayback();
    }
}

// SSDP Periodic NOTIFY broadcast
void broadcastSSDPNotify() {
    IPAddress ip = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP() : WiFi.softAPIP();
    if (ip == IPAddress(0, 0, 0, 0)) return;
    String ipStr = ip.toString();

    const char* targets[] = {
        "upnp:rootdevice",
        "uuid:2b7405e0-8a4e-4e4b-91d1-esp32s3audio01",
        "urn:schemas-upnp-org:device:MediaRenderer:1",
        "urn:schemas-upnp-org:service:AVTransport:1",
        "urn:schemas-upnp-org:service:RenderingControl:1",
        "urn:schemas-upnp-org:service:ConnectionManager:1"
    };

    for (int i = 0; i < 6; i++) {
        String target = targets[i];
        String usn = target.startsWith("uuid:") ? target : ("uuid:2b7405e0-8a4e-4e4b-91d1-esp32s3audio01::" + target);
        String notifyMsg = 
          "NOTIFY * HTTP/1.1\r\n"
          "HOST: 239.255.255.250:1900\r\n"
          "CACHE-CONTROL: max-age=1800\r\n"
          "LOCATION: http://" + ipStr + ":80/upnp/desc.xml\r\n"
          "NT: " + target + "\r\n"
          "NTS: ssdp:alive\r\n"
          "SERVER: ESP32-S3/1.0 UPnP/1.0 DLNADOC/1.50 Open-Air/1.0\r\n"
          "USN: " + usn + "\r\n\r\n";

        // Broadcast to SSDP Multicast address (239.255.255.250:1900)
        ssdpUdp.beginPacket(SSDP_MULTICAST_IP, SSDP_PORT);
        ssdpUdp.write((const uint8_t*)notifyMsg.c_str(), notifyMsg.length());
        ssdpUdp.endPacket();
        delay(2);
    }
}

// SSDP M-SEARCH response
void handleSSDP() {
    int packetSize = ssdpUdp.parsePacket();
    if (packetSize > 0) {
        char buf[512];
        int len = ssdpUdp.read(buf, sizeof(buf) - 1);
        if (len > 0) {
            buf[len] = '\0';
            String req(buf);
            if (req.indexOf("M-SEARCH") >= 0) {
                IPAddress ip = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP() : WiFi.softAPIP();
                String ipStr = ip.toString();

                auto sendResponse = [&](const String& target) {
                    String usn = target.startsWith("uuid:") ? target : ("uuid:2b7405e0-8a4e-4e4b-91d1-esp32s3audio01::" + target);
                    String response = 
                        "HTTP/1.1 200 OK\r\n"
                        "CACHE-CONTROL: max-age=1800\r\n"
                        "DATE: Sun, 01 Jan 2026 00:00:00 GMT\r\n"
                        "EXT:\r\n"
                        "LOCATION: http://" + ipStr + ":80/upnp/desc.xml\r\n"
                        "SERVER: ESP32-S3/1.0 UPnP/1.0 DLNADOC/1.50 Open-Air/1.0\r\n"
                        "ST: " + target + "\r\n"
                        "USN: " + usn + "\r\n\r\n";
                    ssdpUdp.beginPacket(ssdpUdp.remoteIP(), ssdpUdp.remotePort());
                    ssdpUdp.write((const uint8_t*)response.c_str(), response.length());
                    ssdpUdp.endPacket();
                    delay(2);
                };

                if (req.indexOf("ssdp:all") >= 0) {
                    sendResponse("upnp:rootdevice");
                    sendResponse("uuid:2b7405e0-8a4e-4e4b-91d1-esp32s3audio01");
                    sendResponse("urn:schemas-upnp-org:device:MediaRenderer:1");
                    sendResponse("urn:schemas-upnp-org:service:AVTransport:1");
                    sendResponse("urn:schemas-upnp-org:service:RenderingControl:1");
                    sendResponse("urn:schemas-upnp-org:service:ConnectionManager:1");
                } else if (req.indexOf("upnp:rootdevice") >= 0) {
                    sendResponse("upnp:rootdevice");
                } else if (req.indexOf("MediaRenderer") >= 0) {
                    sendResponse("urn:schemas-upnp-org:device:MediaRenderer:1");
                } else if (req.indexOf("AVTransport") >= 0) {
                    sendResponse("urn:schemas-upnp-org:service:AVTransport:1");
                } else if (req.indexOf("RenderingControl") >= 0) {
                    sendResponse("urn:schemas-upnp-org:service:RenderingControl:1");
                } else if (req.indexOf("ConnectionManager") >= 0) {
                    sendResponse("urn:schemas-upnp-org:service:ConnectionManager:1");
                } else if (req.indexOf("2b7405e0-8a4e-4e4b-91d1-esp32s3audio01") >= 0) {
                    sendResponse("uuid:2b7405e0-8a4e-4e4b-91d1-esp32s3audio01");
                }
            }
        }
    }
}

// Re-registers and starts all network discovery services across the active interface
void startNetworkServices() {
    IPAddress ip = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP() : WiFi.softAPIP();
    Serial.println("\n[NET] ========================================================");
    Serial.printf("[NET] Starting Discovery & Streaming Services for IP: %s (STA: %s)\n",
                  ip.toString().c_str(), (WiFi.status() == WL_CONNECTED) ? "CONNECTED" : "SOFTAP ONLY");

    // 1. Restart mDNS Responder (http://esp32-audio.local)
    MDNS.end();
    delay(50);
    if (MDNS.begin("esp32-audio")) {
        MDNS.addService("http", "tcp", 80);
        Serial.println("[mDNS] Responder active at http://esp32-audio.local");
    } else {
        Serial.println("[mDNS] Error initializing mDNS responder");
    }

    // 2. Announce AirPlay 1/2 RAOP via mDNS Bonjour
    airplay.announceBonjour();

    // 3. Re-bind SSDP Multicast UDP socket (239.255.255.250:1900)
    ssdpUdp.stop();
    delay(50);
    if (ssdpUdp.beginMulticast(SSDP_MULTICAST_IP, SSDP_PORT)) {
        Serial.println("[SSDP] Multicast listening on 239.255.255.250:1900");
    } else {
        Serial.println("[SSDP] Error binding SSDP multicast port 1900");
    }

    // 4. Send initial SSDP alive announcement bursts
    broadcastSSDPNotify();
    Serial.println("[NET] ========================================================\n");
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n\n========================================================");
    Serial.println("  ESP32-S3 HiFi Node (UDA1334A DAC • N16R8)");
    Serial.println("========================================================");

    pinMode(STATUS_LED_PIN, OUTPUT);
    digitalWrite(STATUS_LED_PIN, HIGH);

    // 1. Load persistent user preferences from NVS (Volume, Tone EQ, WiFi credentials)
    loadSettingsFromNVS();

    #if defined(BOARD_HAS_PSRAM)
    if (psramFound()) {
        psramBufferMemory = (uint8_t*)ps_malloc(PSRAM_BUFFER_SIZE);
        if (psramBufferMemory) {
            actualBufferSize = PSRAM_BUFFER_SIZE;
            Serial.printf("[PSRAM] Allocated %d KB buffer in PSRAM (Free PSRAM: %u bytes)\n", 
                          (int)(PSRAM_BUFFER_SIZE / 1024), ESP.getFreePsram());
        }
    }
    #endif
    if (!psramBufferMemory) {
        actualBufferSize = 32 * 1024;
        psramBufferMemory = (uint8_t*)malloc(actualBufferSize);
        Serial.printf("[RAM] Allocated %d KB internal buffer fallback\n", (int)(actualBufferSize / 1024));
    }

    // Initialize I2S Audio Output for UDA1334A DAC with restored NVS volume
    i2sOutput = new AudioOutputI2S();
    i2sOutput->SetPinout(I2S_BCLK_PIN, I2S_WCLK_PIN, I2S_DOUT_PIN);
    i2sOutput->SetGain((float)currentVolume / 100.0f);
    Serial.printf("[I2S] DAC ready on BCLK:%d, WSEL/LRC:%d, DOUT:%d (Restored Gain: %d%%)\n", 
                  I2S_BCLK_PIN, I2S_WCLK_PIN, I2S_DOUT_PIN, currentVolume);

    // WiFi Event Diagnostics & Status Listener
    WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
        switch (event) {
            case ARDUINO_EVENT_WIFI_STA_START:
                Serial.println("[WIFI] Station interface started");
                break;
            case ARDUINO_EVENT_WIFI_STA_CONNECTED:
                Serial.printf("[WIFI] Connected to AP successfully (Channel: %d)\n", WiFi.channel());
                break;
            case ARDUINO_EVENT_WIFI_STA_GOT_IP:
                Serial.println("\n========================================================");
                Serial.printf("[WIFI] SUCCESS! Connected to: %s\n", WiFi.SSID().c_str());
                Serial.printf("[WIFI] Station IP:  http://%s\n", WiFi.localIP().toString().c_str());
                Serial.printf("[WIFI] Gateway IP: %s\n", WiFi.gatewayIP().toString().c_str());
                Serial.printf("[WIFI] DNS Server: %s\n", WiFi.dnsIP().toString().c_str());
                Serial.printf("[WIFI] Signal RSSI: %d dBm\n", WiFi.RSSI());
                Serial.println("[mDNS] Web player accessible at: http://esp32-audio.local");
                Serial.println("========================================================\n");
                pendingStaGotIp = true;
                break;
            case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
                Serial.printf("[WIFI] Disconnected from station. Reason code: %d\n", info.wifi_sta_disconnected.reason);
                break;
            case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
                Serial.println("[WIFI] Device connected to ESP32 SoftAP");
                break;
            case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
                Serial.println("[WIFI] Device disconnected from ESP32 SoftAP");
                break;
            default:
                break;
        }
    });

    // WiFi Setup (AP + STA mode)
    WiFi.mode(WIFI_AP_STA);
    WiFi.setSleep(false);              // Prevent modem sleep packet drops on mesh routers
    WiFi.setAutoReconnect(true);       // Automatically reconnect on connection drops
    WiFi.softAP("ESP32S3-HiFi-Node", "12345678");
    Serial.printf("[WIFI] SoftAP active! SSID: ESP32S3-HiFi-Node (Pass: 12345678), IP: %s\n", WiFi.softAPIP().toString().c_str());

    // Auto-connect using saved NVS WiFi credentials if available
    if (savedSsid.length() > 0) {
        Serial.printf("[WIFI] Auto-connecting to saved network: %s\n", savedSsid.c_str());
        WiFi.begin(savedSsid.c_str(), savedPass.c_str());
        Serial.print("[WIFI] Waiting for connection");
        unsigned long t0 = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t0 < 5000) {
            delay(100);
            Serial.print(".");
        }
        Serial.println();
        if (WiFi.status() == WL_CONNECTED) {
            Serial.printf("[WIFI] Connected! Station IP: %s\n", WiFi.localIP().toString().c_str());
        } else {
            Serial.println("[WIFI] Connecting in background...");
        }
    }

    // Web Server Endpoints
    server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
        request->send_P(200, "text/html", INDEX_HTML);
    });

    server.on("/upnp/desc.xml", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse_P(200, "text/xml; charset=\"utf-8\"", (const uint8_t*)UPNP_DESC_XML, strlen_P(UPNP_DESC_XML));
        response->addHeader("Connection", "close");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    });

    server.on("/description.xml", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse_P(200, "text/xml; charset=\"utf-8\"", (const uint8_t*)UPNP_DESC_XML, strlen_P(UPNP_DESC_XML));
        response->addHeader("Connection", "close");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    });

    server.on("/description.xml", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse_P(200, "text/xml; charset=\"utf-8\"", (const uint8_t*)UPNP_DESC_XML, strlen_P(UPNP_DESC_XML));
        response->addHeader("Connection", "close");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    });

    server.on("/upnp/AVTransport.xml", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse_P(200, "text/xml; charset=\"utf-8\"", (const uint8_t*)AVTRANSPORT_XML, strlen_P(AVTRANSPORT_XML));
        response->addHeader("Connection", "close");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    });

    server.on("/upnp/RenderingControl.xml", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse_P(200, "text/xml; charset=\"utf-8\"", (const uint8_t*)RENDERING_CONTROL_XML, strlen_P(RENDERING_CONTROL_XML));
        response->addHeader("Connection", "close");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    });

    server.on("/upnp/ConnectionManager.xml", HTTP_GET, [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse_P(200, "text/xml; charset=\"utf-8\"", (const uint8_t*)CONNECTION_MANAGER_XML, strlen_P(CONNECTION_MANAGER_XML));
        response->addHeader("Connection", "close");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    });

    server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request) {
        String json = "{\"playing\":";
        json += (isPlaying ? "true" : "false");
        json += ",\"track\":\"" + currentTrack + "\"";
        json += ",\"url\":\"" + currentUrl + "\"";
        json += ",\"codec\":\"" + currentCodec + "\"";
        json += ",\"volume\":" + String(currentVolume);
        json += ",\"bass\":" + String(currentBass);
        json += ",\"mid\":" + String(currentMid);
        json += ",\"treble\":" + String(currentTreble);
        json += ",\"muted\":";
        json += (isMuted ? "true" : "false");
        json += ",\"freeHeap\":" + String(ESP.getFreeHeap());
        #if defined(BOARD_HAS_PSRAM)
        json += ",\"freePsram\":" + String(ESP.getFreePsram());
        #else
        json += ",\"freePsram\":0";
        #endif
        json += "}";
        request->send(200, "application/json", json);
    });

    server.on("/api/play", HTTP_ANY, [](AsyncWebServerRequest *request) {
        String url = "";
        String name = "Live Stream";
        if (request->hasArg("url")) url = request->arg("url");
        if (request->hasArg("name")) name = request->arg("name");
        if (url.length() > 0) {
            startAudioStream(url, name);
            request->send(200, "text/plain", "OK");
        } else {
            request->send(400, "text/plain", "Missing url parameter");
        }
    }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (len > 0) {
            String url = String((char*)data, len);
            url.trim();
            if (url.length() > 0) {
                startAudioStream(url, "Web Stream");
                request->send(200, "text/plain", "OK");
            }
        }
    });

    server.on("/api/stop", HTTP_ANY, [](AsyncWebServerRequest *request) {
        stopAudioPlayback();
        request->send(200, "text/plain", "OK");
    });

    server.on("/api/pause", HTTP_ANY, [](AsyncWebServerRequest *request) {
        if (isPlaying) {
            stopAudioPlayback();
        } else if (currentUrl.length() > 0) {
            startAudioStream(currentUrl, currentTrack);
        }
        request->send(200, "text/plain", isPlaying ? "PLAYING" : "STOPPED");
    });

    server.on("/api/volume", HTTP_ANY, [](AsyncWebServerRequest *request) {
        if (request->hasArg("val")) {
            currentVolume = request->arg("val").toInt();
            if (currentVolume < 0) currentVolume = 0;
            if (currentVolume > 100) currentVolume = 100;
            if (i2sOutput && !isMuted) {
                i2sOutput->SetGain((float)currentVolume / 100.0f);
            }
            saveVolumeToNVS(currentVolume);
        }
        request->send(200, "text/plain", String(currentVolume));
    });

    server.on("/api/mute", HTTP_ANY, [](AsyncWebServerRequest *request) {
        if (request->hasArg("val")) {
            isMuted = (request->arg("val") == "1");
            if (i2sOutput) {
                i2sOutput->SetGain(isMuted ? 0.0f : ((float)currentVolume / 100.0f));
            }
        }
        request->send(200, "text/plain", isMuted ? "MUTED" : "UNMUTED");
    });

    server.on("/api/wifi", HTTP_ANY, [](AsyncWebServerRequest *request) {
        String ssid = "";
        String pass = "";
        if (request->hasArg("ssid")) ssid = request->arg("ssid");
        if (request->hasArg("pass")) pass = request->arg("pass");
        if (ssid.length() > 0) {
            saveWifiToNVS(ssid, pass);
            request->send(200, "text/plain", "OK");
            Serial.printf("[WIFI] Received new credentials for SSID '%s'. Connecting...\n", ssid.c_str());
            WiFi.disconnect(false);
            delay(100);
            WiFi.begin(ssid.c_str(), pass.c_str());
        } else {
            request->send(400, "text/plain", "Missing SSID");
        }
    });

    server.on("/api/tone", HTTP_ANY, [](AsyncWebServerRequest *request) {
        int b = request->hasArg("bass") ? request->arg("bass").toInt() : currentBass;
        int m = request->hasArg("mid") ? request->arg("mid").toInt() : currentMid;
        int t = request->hasArg("treble") ? request->arg("treble").toInt() : currentTreble;
        currentBass = b;
        currentMid = m;
        currentTreble = t;
        saveToneToNVS(b, m, t);
        Serial.printf("[AUDIO] Tone EQ saved to NVS: Bass=%d dB, Mid=%d dB, Treble=%d dB\n", b, m, t);
        request->send(200, "text/plain", "OK");
    });
    server.on("/connect", HTTP_POST, [](AsyncWebServerRequest *request) {
        String ssid = "";
        String pass = "";
        if (request->hasArg("ssid")) ssid = request->arg("ssid");
        if (request->hasArg("pass")) pass = request->arg("pass");
        if (ssid.length() > 0) {
            WiFi.begin(ssid.c_str(), pass.c_str());
            request->send(200, "text/html", "<h3>Connecting to " + ssid + "...</h3><p>Check serial monitor or IP address.</p><a href='/'>Back</a>");
        } else {
            request->send(400, "text/plain", "Missing SSID");
        }
    });

    // WebOTA Firmware Upload
    server.on("/update", HTTP_POST, [](AsyncWebServerRequest *request) {
        bool shouldReboot = !Update.hasError();
        AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", shouldReboot ? "OK" : "FAIL");
        response->addHeader("Connection", "close");
        request->send(response);
        if (shouldReboot) {
            delay(500);
            ESP.restart();
        }
    }, [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
        if (!index) {
            Serial.printf("[OTA] Update Start: %s\n", filename.c_str());
            if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                Update.printError(Serial);
            }
        }
        if (Update.write(data, len) != len) {
            Update.printError(Serial);
        }
        if (final) {
            if (Update.end(true)) {
                Serial.printf("[OTA] Update Success: %u bytes\n", (unsigned int)(index + len));
            } else {
                Update.printError(Serial);
            }
        }
    });

    // UPnP SOAP OPTIONS Pre-flight Handlers
    auto sendOptionsResponse = [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", "OK");
        response->addHeader("Allow", "GET, POST, OPTIONS");
        response->addHeader("Access-Control-Allow-Origin", "*");
        response->addHeader("Access-Control-Allow-Headers", "Content-Type, SOAPACTION");
        response->addHeader("Connection", "close");
        request->send(response);
    };
    server.on("/upnp/control/AVTransport", HTTP_OPTIONS, sendOptionsResponse);
    server.on("/upnp/control/RenderingControl", HTTP_OPTIONS, sendOptionsResponse);
    server.on("/upnp/control/ConnectionManager", HTTP_OPTIONS, sendOptionsResponse);

    // UPnP SOAP AVTransport Control
    server.on("/upnp/control/AVTransport", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL,
      [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (index + len >= total) {
            String body = (data && len > 0) ? String((const char*)data, len) : "";
            String action = "Response";
            String actionResp = "";

            if (body.indexOf("SetAVTransportURI") >= 0) {
                action = "SetAVTransportURIResponse";
                int u1 = body.indexOf("<CurrentURI>");
                int u2 = body.indexOf("</CurrentURI>");
                if (u1 > 0 && u2 > u1) {
                    String uri = body.substring(u1 + 12, u2);
                    uri.replace("&amp;", "&");
                    startAudioStream(uri, "DLNA Audio Track");
                }
            } else if (body.indexOf("<u:Play") >= 0) {
                action = "PlayResponse";
                if (!isPlaying && currentUrl.length() > 0) {
                    startAudioStream(currentUrl, currentTrack);
                }
            } else if (body.indexOf("<u:Pause") >= 0) {
                action = "PauseResponse";
                stopAudioPlayback();
            } else if (body.indexOf("<u:Stop") >= 0) {
                action = "StopResponse";
                stopAudioPlayback();
            } else if (body.indexOf("GetTransportInfo") >= 0) {
                action = "GetTransportInfoResponse";
                String state = isPlaying ? "PLAYING" : "STOPPED";
                actionResp = "<CurrentTransportState>" + state + "</CurrentTransportState><CurrentTransportStatus>OK</CurrentTransportStatus><CurrentSpeed>1</CurrentSpeed>";
            } else if (body.indexOf("GetPositionInfo") >= 0) {
                action = "GetPositionInfoResponse";
                actionResp = "<Track>1</Track><TrackDuration>00:00:00</TrackDuration><TrackMetaData></TrackMetaData><TrackURI>" + currentUrl + "</TrackURI><RelTime>00:00:00</RelTime><AbsTime>00:00:00</AbsTime><RelCount>0</RelCount><AbsCount>0</AbsCount>";
            } else if (body.indexOf("GetMediaInfo") >= 0) {
                action = "GetMediaInfoResponse";
                actionResp = "<NrTracks>1</NrTracks><MediaDuration>00:00:00</MediaDuration><CurrentURI>" + currentUrl + "</CurrentURI><CurrentURIMetaData></CurrentURIMetaData><NextURI></NextURI><NextURIMetaData></NextURIMetaData><PlayMedium>NETWORK</PlayMedium><RecordMedium>NOT_IMPLEMENTED</RecordMedium><WriteStatus>NOT_IMPLEMENTED</WriteStatus>";
            } else if (body.indexOf("GetDeviceCapabilities") >= 0) {
                action = "GetDeviceCapabilitiesResponse";
                actionResp = "<PlayMedia>NETWORK</PlayMedia><RecMedia>NOT_IMPLEMENTED</RecMedia><RecQualityModes>NOT_IMPLEMENTED</RecQualityModes>";
            }

            String resp = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n"
                          "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\r\n"
                          "  <s:Body>\r\n"
                          "    <u:" + action + " xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" + actionResp + "</u:" + action + ">\r\n"
                          "  </s:Body>\r\n"
                          "</s:Envelope>\r\n";
            AsyncWebServerResponse *response = request->beginResponse(200, "text/xml; charset=\"utf-8\"", resp);
            response->addHeader("Connection", "close");
            response->addHeader("EXT", "");
            response->addHeader("Access-Control-Allow-Origin", "*");
            request->send(response);
        }
      });

    // UPnP SOAP RenderingControl
    server.on("/upnp/control/RenderingControl", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL,
      [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (index + len >= total) {
            String body = (data && len > 0) ? String((const char*)data, len) : "";
            String action = "Response";
            String actionResp = "";

            if (body.indexOf("SetVolume") >= 0) {
                action = "SetVolumeResponse";
                int v1 = body.indexOf("<DesiredVolume>");
                int v2 = body.indexOf("</DesiredVolume>");
                if (v1 > 0 && v2 > v1) {
                    currentVolume = body.substring(v1 + 15, v2).toInt();
                    if (i2sOutput && !isMuted) {
                        i2sOutput->SetGain((float)currentVolume / 100.0f);
                    }
                    saveVolumeToNVS(currentVolume);
                }
            } else if (body.indexOf("GetVolume") >= 0) {
                action = "GetVolumeResponse";
                actionResp = "<CurrentVolume>" + String(currentVolume) + "</CurrentVolume>";
            } else if (body.indexOf("SetMute") >= 0) {
                action = "SetMuteResponse";
                int m1 = body.indexOf("<DesiredMute>");
                int m2 = body.indexOf("</DesiredMute>");
                if (m1 > 0 && m2 > m1) {
                    isMuted = (body.substring(m1 + 13, m2).toInt() == 1);
                    if (i2sOutput) {
                        i2sOutput->SetGain(isMuted ? 0.0f : ((float)currentVolume / 100.0f));
                    }
                }
            } else if (body.indexOf("GetMute") >= 0) {
                action = "GetMuteResponse";
                actionResp = "<CurrentMute>" + String(isMuted ? "1" : "0") + "</CurrentMute>";
            }

            String resp = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n"
                          "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\r\n"
                          "  <s:Body>\r\n"
                          "    <u:" + action + " xmlns:u=\"urn:schemas-upnp-org:service:RenderingControl:1\">" + actionResp + "</u:" + action + ">\r\n"
                          "  </s:Body>\r\n"
                          "</s:Envelope>\r\n";
            AsyncWebServerResponse *response = request->beginResponse(200, "text/xml; charset=\"utf-8\"", resp);
            response->addHeader("Connection", "close");
            response->addHeader("EXT", "");
            response->addHeader("Access-Control-Allow-Origin", "*");
            request->send(response);
        }
      });

    // UPnP SOAP ConnectionManager
    server.on("/upnp/control/ConnectionManager", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL,
      [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (index + len >= total) {
            String body = (data && len > 0) ? String((const char*)data, len) : "";
            String action = "Response";
            String actionResp = "";

            if (body.indexOf("GetProtocolInfo") >= 0) {
                action = "GetProtocolInfoResponse";
                actionResp = "<Source></Source><Sink>http-get:*:audio/mpeg:*,http-get:*:audio/mp3:*,http-get:*:audio/x-wav:*,http-get:*:audio/wav:*,http-get:*:audio/aac:*,http-get:*:audio/x-m4a:*,http-get:*:audio/flac:*,http-get:*:*</Sink>";
            } else if (body.indexOf("GetCurrentConnectionIDs") >= 0) {
                action = "GetCurrentConnectionIDsResponse";
                actionResp = "<ConnectionIDs>0</ConnectionIDs>";
            } else if (body.indexOf("GetCurrentConnectionInfo") >= 0) {
                action = "GetCurrentConnectionInfoResponse";
                actionResp = "<RcsID>0</RcsID><AVTransportID>0</AVTransportID><ProtocolInfo></ProtocolInfo><PeerConnectionManager></PeerConnectionManager><PeerConnectionID>-1</PeerConnectionID><Direction>Input</Direction><Status>OK</Status>";
            }

            String resp = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n"
                          "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\r\n"
                          "  <s:Body>\r\n"
                          "    <u:" + action + " xmlns:u=\"urn:schemas-upnp-org:service:ConnectionManager:1\">" + actionResp + "</u:" + action + ">\r\n"
                          "  </s:Body>\r\n"
                          "</s:Envelope>\r\n";
            AsyncWebServerResponse *response = request->beginResponse(200, "text/xml; charset=\"utf-8\"", resp);
            response->addHeader("Connection", "close");
            response->addHeader("EXT", "");
            response->addHeader("Access-Control-Allow-Origin", "*");
            request->send(response);
        }
      });

    // UPnP GENA EventSub endpoints (returns 200 OK with SID and TIMEOUT for DLNA controllers)
    auto handleEventSub = [](AsyncWebServerRequest *request) {
        AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", "");
        response->addHeader("SERVER", "ESP32-S3/1.0 UPnP/1.0 DLNADOC/1.50 Open-Air/1.0");
        response->addHeader("SID", "uuid:2b7405e0-8a4e-4e4b-91d1-sub01");
        response->addHeader("TIMEOUT", "Second-1800");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
    };

    server.on("/upnp/event/AVTransport", HTTP_ANY, handleEventSub);
    server.on("/upnp/event/RenderingControl", HTTP_ANY, handleEventSub);
    server.on("/upnp/event/ConnectionManager", HTTP_ANY, handleEventSub);

    server.onNotFound([](AsyncWebServerRequest *request) {
        if (request->url().indexOf("event") >= 0) {
            AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", "");
            response->addHeader("SERVER", "ESP32-S3/1.0 UPnP/1.0 DLNADOC/1.50 Open-Air/1.0");
            response->addHeader("SID", "uuid:2b7405e0-8a4e-4e4b-91d1-sub01");
            response->addHeader("TIMEOUT", "Second-1800");
            response->addHeader("Access-Control-Allow-Origin", "*");
            request->send(response);
            return;
        }
        request->send(404, "text/plain", "Not Found");
    });

    server.begin();
    Serial.println("[HTTP] Server started on port 80");

    // Connect AirPlay 2 audio & control events
    airplay.setOnAudioPcm([](const uint8_t* pcm, size_t len) {
        if (!i2sOutput) return;
        size_t numSamples = len / 4;
        int16_t sample[2];
        for (size_t i = 0; i < numSamples; i++) {
            sample[0] = (int16_t)((pcm[i * 4] << 8) | pcm[i * 4 + 1]);
            sample[1] = (int16_t)((pcm[i * 4 + 2] << 8) | pcm[i * 4 + 3]);
            i2sOutput->ConsumeSample(sample);
        }
    });

    airplay.setOnState([](bool playing) {
        if (playing) {
            if (activeDecoder && activeDecoder->isRunning()) {
                stopAudioPlayback();
            }
            isPlaying = true;
            currentCodec = "AirPlay (PCM)";
            currentTrack = "AirPlay: " + airplay.getClientName();
        } else {
            isPlaying = false;
            currentCodec = "None";
            currentTrack = "Stopped";
        }
    });

    airplay.setOnVolume([](float volPercent) {
        currentVolume = (int)volPercent;
        if (i2sOutput && !isMuted) {
            i2sOutput->SetGain(volPercent / 100.0f);
        }
        saveVolumeToNVS(currentVolume);
    });

    airplay.setOnMeta([](const String& title, const String& artist) {
        currentTrack = title;
        if (artist.length() > 0) {
            currentTrack += " - " + artist;
        }
    });

    airplay.begin("ESP32-S3 HiFi Node", 5000, 6000);
    startNetworkServices();
    Serial.println("[SYS] System initialized and ready!");
}

void loop() {
    if (pendingStaGotIp) {
        pendingStaGotIp = false;
        startNetworkServices();
    }

    if (activeDecoder && activeDecoder->isRunning()) {
        if (!activeDecoder->loop()) {
            Serial.printf("[AUDIO] %s stream playback ended or stalled\n", currentCodec.c_str());
            stopAudioPlayback();
        }
    }

    handleSSDP();
    airplay.loop();

    static unsigned long lastNotify = 0;
    if (millis() - lastNotify > 60000) {
        lastNotify = millis();
        broadcastSSDPNotify();
    }

    vTaskDelay(pdMS_TO_TICKS(1));
}
