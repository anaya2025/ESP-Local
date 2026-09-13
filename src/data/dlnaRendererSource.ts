import { ProjectConfig } from '../types';

export function getAudioConfigHeader(config: ProjectConfig): string {
  const { audioSettings } = config;
  return `/**
 * @file audio_config.h
 * @brief ESP32-S3 N16R8 Hardware Pinouts, Audio & Network Configurations
 * 
 * Hardware Audio DAC: UDA1334A / MAX98357A / PCM5102A (I2S)
 * Safe I2S Pins: BCLK=14, LRC/WSEL=15, DOUT=16 (Completely avoiding GPIO 33-37 Octal PSRAM)
 */

#pragma once

#include <Arduino.h>

// I2S Hardware DAC Pin Definitions (Safe for N16R8 Octal PSRAM)
#define I2S_BCLK_PIN          ${audioSettings?.i2sBclkPin || 14}
#define I2S_LRC_PIN           ${audioSettings?.i2sLrcPin || 15}
#define I2S_DOUT_PIN          ${audioSettings?.i2sDoutPin || 16}

// Default Audio Output Levels
#define DEFAULT_VOLUME        ${audioSettings?.defaultVolume || 65}  // 0 to 100

// Default EQ Tone Settings (-16 to +16 dB)
#define DEFAULT_EQ_BASS       ${audioSettings?.eqBass || 0}
#define DEFAULT_EQ_MID        ${audioSettings?.eqMid || 0}
#define DEFAULT_EQ_TREBLE     ${audioSettings?.eqTreble || 0}

// Networking & mDNS
#define MDNS_HOSTNAME         "${audioSettings?.mDnsHost || 'esp32-audio'}"
#define DLNA_FRIENDLY_NAME    "${audioSettings?.dlnaDeviceName || 'ESP32-S3 HiFi Streamer'}"
#define AP_SSID               "ESP32S3-Audio-Setup"
#define AP_PASSWORD           "12345678"

// Status LED (GPIO 48 on DevKitC-1, 38 on Xiao/LilyGO, 21 on Waveshare)
#define STATUS_LED_PIN        ${config.rgbLedPin}
`;
}

export function getDlnaRendererHeader(): string {
  return `/**
 * @file dlna_renderer.h
 * @brief High-performance DLNA / UPnP MediaRenderer for ESP32-S3
 */

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <WebServer.h>

class DLNARenderer {
public:
    typedef void (*PlayUrlCallback)(const String& url, const String& meta);
    typedef void (*VolumeCallback)(int volume);
    typedef void (*ControlCallback)();

    DLNARenderer();
    bool begin(WebServer* server, const char* friendlyName = "ESP32-S3 HiFi Streamer", uint16_t port = 80);
    void loop();
    void stop();

    void setOnPlayUrl(PlayUrlCallback cb) { _onPlayUrl = cb; }
    void setOnVolume(VolumeCallback cb) { _onVolume = cb; }
    void setOnPause(ControlCallback cb) { _onPause = cb; }
    void setOnStop(ControlCallback cb) { _onStop = cb; }

private:
    WebServer* _server;
    String _friendlyName;
    String _uuid;
    uint16_t _port;
    WiFiUDP _ssdpUdp;
    unsigned long _lastNotifyTime;

    PlayUrlCallback _onPlayUrl;
    VolumeCallback _onVolume;
    ControlCallback _onPause;
    ControlCallback _onStop;

    void _registerHttpEndpoints();
    void _sendSsdpAlive();
    void _sendSsdpBye();
    void _handleSsdpSearch();
    String _getDeviceDescriptionXML();
};
`;
}

export function getDlnaRendererSource(): string {
  return `/**
 * @file dlna_renderer.cpp
 * @brief DLNA MediaRenderer SSDP & SOAP AVTransport implementation
 */

#include "dlna_renderer.h"

#define SSDP_MULTICAST_ADDR IPAddress(239, 255, 255, 250)
#define SSDP_MULTICAST_PORT 1900
#define SSDP_INTERVAL_MS    180000

DLNARenderer::DLNARenderer() 
    : _server(nullptr), _port(80), _lastNotifyTime(0),
      _onPlayUrl(nullptr), _onVolume(nullptr), _onPause(nullptr), _onStop(nullptr) {
}

bool DLNARenderer::begin(WebServer* server, const char* friendlyName, uint16_t port) {
    _server = server;
    _friendlyName = friendlyName;
    _port = port;

    uint8_t mac[6];
    WiFi.macAddress(mac);
    char uuidBuf[40];
    snprintf(uuidBuf, sizeof(uuidBuf), "4d656469-6152-656e-%02x%02x-%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    _uuid = String(uuidBuf);

    if (_ssdpUdp.beginMulticast(SSDP_MULTICAST_ADDR, SSDP_MULTICAST_PORT)) {
        Serial.println(F("[DLNA] SSDP Multicast listening on 239.255.255.250:1900"));
    } else {
        Serial.println(F("[DLNA] Failed to join SSDP multicast group"));
    }

    _registerHttpEndpoints();
    _sendSsdpAlive();
    Serial.printf("[DLNA] UPnP MediaRenderer '%s' started on port %d\\n", _friendlyName.c_str(), _port);
    return true;
}

void DLNARenderer::loop() {
    if (millis() - _lastNotifyTime > SSDP_INTERVAL_MS) {
        _sendSsdpAlive();
        _lastNotifyTime = millis();
    }
    _handleSsdpSearch();
}

void DLNARenderer::_sendSsdpAlive() {
    IPAddress ip = WiFi.localIP();
    String location = "http://" + ip.toString() + ":" + String(_port) + "/description.xml";
    IPAddress bcastIp = WiFi.broadcastIP();
    
    const char* targets[] = {
        "upnp:rootdevice",
        "urn:schemas-upnp-org:device:MediaRenderer:1",
        "urn:schemas-upnp-org:service:AVTransport:1",
        "urn:schemas-upnp-org:service:RenderingControl:1",
        "urn:schemas-upnp-org:service:ConnectionManager:1"
    };

    for (const char* nt : targets) {
        String msg = "NOTIFY * HTTP/1.1\r\n"
                     "HOST: 239.255.255.250:1900\r\n"
                     "CACHE-CONTROL: max-age=1800\r\n"
                     "LOCATION: " + location + "\r\n"
                     "NT: " + String(nt) + "\r\n"
                     "NTS: ssdp:alive\r\n"
                     "SERVER: Linux/3.0.0 UPnP/1.0 DLNADOC/1.50 Platinum/1.0.4.2\r\n"
                     "USN: uuid:" + _uuid + "::" + String(nt) + "\r\n\r\n";

        // Multicast
        _ssdpUdp.beginPacket(SSDP_MULTICAST_ADDR, SSDP_MULTICAST_PORT);
        _ssdpUdp.write((const uint8_t*)msg.c_str(), msg.length());
        _ssdpUdp.endPacket();

        // Subnet Broadcast to bypass router multicast filtering
        if (bcastIp != IPAddress(0, 0, 0, 0)) {
            _ssdpUdp.beginPacket(bcastIp, SSDP_MULTICAST_PORT);
            _ssdpUdp.write((const uint8_t*)msg.c_str(), msg.length());
            _ssdpUdp.endPacket();
        }
        delay(2);
    }
}

void DLNARenderer::_sendSsdpBye() {
    const char* targets[] = {
        "upnp:rootdevice",
        "urn:schemas-upnp-org:device:MediaRenderer:1"
    };

    for (const char* nt : targets) {
        String msg = "NOTIFY * HTTP/1.1\r\n"
                     "HOST: 239.255.255.250:1900\r\n"
                     "NT: " + String(nt) + "\r\n"
                     "NTS: ssdp:byebye\r\n"
                     "USN: uuid:" + _uuid + "::" + String(nt) + "\r\n\r\n";

        _ssdpUdp.beginPacket(SSDP_MULTICAST_ADDR, SSDP_MULTICAST_PORT);
        _ssdpUdp.write((const uint8_t*)msg.c_str(), msg.length());
        _ssdpUdp.endPacket();
    }
}

void DLNARenderer::_handleSsdpSearch() {
    int packetSize = _ssdpUdp.parsePacket();
    if (packetSize > 0) {
        char buf[512];
        int len = _ssdpUdp.read(buf, sizeof(buf) - 1);
        if (len > 0) {
            buf[len] = '\0';
            String req(buf);
            String reqUpper = req;
            reqUpper.toUpperCase();

            if (reqUpper.indexOf("M-SEARCH") >= 0) {
                auto sendResp = [&](const String& st, const String& usn) {
                    IPAddress ip = WiFi.localIP();
                    String location = "http://" + ip.toString() + ":" + String(_port) + "/description.xml";
                    String response = "HTTP/1.1 200 OK\r\n"
                                      "CACHE-CONTROL: max-age=1800\r\n"
                                      "DATE: Sun, 01 Jan 2026 00:00:00 GMT\r\n"
                                      "EXT:\r\n"
                                      "LOCATION: " + location + "\r\n"
                                      "SERVER: Linux/3.0.0 UPnP/1.0 DLNADOC/1.50 Platinum/1.0.4.2\r\n"
                                      "ST: " + st + "\r\n"
                                      "USN: " + usn + "\r\n\r\n";
                    _ssdpUdp.beginPacket(_ssdpUdp.remoteIP(), _ssdpUdp.remotePort());
                    _ssdpUdp.write((const uint8_t*)response.c_str(), response.length());
                    _ssdpUdp.endPacket();
                    delay(2);
                };

                if (reqUpper.indexOf("SSDP:ALL") >= 0) {
                    sendResp("upnp:rootdevice", "uuid:" + _uuid + "::upnp:rootdevice");
                    sendResp("uuid:" + _uuid, "uuid:" + _uuid);
                    sendResp("urn:schemas-upnp-org:device:MediaRenderer:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:device:MediaRenderer:1");
                    sendResp("urn:schemas-upnp-org:service:AVTransport:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:service:AVTransport:1");
                    sendResp("urn:schemas-upnp-org:service:RenderingControl:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:service:RenderingControl:1");
                    sendResp("urn:schemas-upnp-org:service:ConnectionManager:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:service:ConnectionManager:1");
                } else if (reqUpper.indexOf("UPNP:ROOTDEVICE") >= 0) {
                    sendResp("upnp:rootdevice", "uuid:" + _uuid + "::upnp:rootdevice");
                } else if (reqUpper.indexOf("MEDIARENDERER") >= 0) {
                    sendResp("urn:schemas-upnp-org:device:MediaRenderer:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:device:MediaRenderer:1");
                } else if (reqUpper.indexOf("AVTRANSPORT") >= 0) {
                    sendResp("urn:schemas-upnp-org:service:AVTransport:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:service:AVTransport:1");
                } else if (reqUpper.indexOf("RENDERINGCONTROL") >= 0) {
                    sendResp("urn:schemas-upnp-org:service:RenderingControl:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:service:RenderingControl:1");
                } else if (reqUpper.indexOf("CONNECTIONMANAGER") >= 0) {
                    sendResp("urn:schemas-upnp-org:service:ConnectionManager:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:service:ConnectionManager:1");
                } else {
                    sendResp("urn:schemas-upnp-org:device:MediaRenderer:1", "uuid:" + _uuid + "::urn:schemas-upnp-org:device:MediaRenderer:1");
                }
            }
        }
    }
}

void DLNARenderer::_registerHttpEndpoints() {
    auto sendDesc = [this]() {
        _server->sendHeader("Connection", "close");
        _server->sendHeader("Access-Control-Allow-Origin", "*");
        _server->send(200, "text/xml; charset=\"utf-8\"", _getDeviceDescriptionXML());
    };

    _server->on("/description.xml", HTTP_GET, sendDesc);
    _server->on("/upnp/desc.xml", HTTP_GET, sendDesc);

    _server->on("/AVTransport/control", HTTP_POST, [this]() {
        String body = _server->arg("plain");
        if (body.indexOf("SetAVTransportURI") >= 0) {
            int startUri = body.indexOf("<CurrentURI>");
            int endUri = body.indexOf("</CurrentURI>");
            if (startUri > 0 && endUri > startUri) {
                String uri = body.substring(startUri + 12, endUri);
                uri.replace("&amp;", "&");
                if (_onPlayUrl) _onPlayUrl(uri, "");
            }
        } else if (body.indexOf("<u:Pause") >= 0) {
            if (_onPause) _onPause();
        } else if (body.indexOf("<u:Stop") >= 0) {
            if (_onStop) _onStop();
        }

        String soapResp = "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\">"
                          "<s:Body><u:Response xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\"/>"
                          "</s:Body></s:Envelope>";
        _server->sendHeader("Connection", "close");
        _server->sendHeader("Access-Control-Allow-Origin", "*");
        _server->send(200, "text/xml; charset=\"utf-8\"", soapResp);
    });

    _server->on("/RenderingControl/control", HTTP_POST, [this]() {
        String body = _server->arg("plain");
        if (body.indexOf("<DesiredVolume>") >= 0) {
            int startV = body.indexOf("<DesiredVolume>");
            int endV = body.indexOf("</DesiredVolume>");
            if (startV > 0 && endV > startV) {
                int vol = body.substring(startV + 15, endV).toInt();
                if (_onVolume) _onVolume(vol);
            }
        }
        String soapResp = "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\">"
                          "<s:Body><u:Response xmlns:u=\"urn:schemas-upnp-org:service:RenderingControl:1\"/>"
                          "</s:Body></s:Envelope>";
        _server->sendHeader("Connection", "close");
        _server->sendHeader("Access-Control-Allow-Origin", "*");
        _server->send(200, "text/xml; charset=\"utf-8\"", soapResp);
    });

    _server->on("/ConnectionManager/control", HTTP_POST, [this]() {
        String soapResp = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\r\n"
                          "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">\r\n"
                          "  <s:Body>\r\n"
                          "    <u:GetProtocolInfoResponse xmlns:u=\"urn:schemas-upnp-org:service:ConnectionManager:1\">\r\n"
                          "      <Source></Source>\r\n"
                          "      <Sink>http-get:*:audio/mpeg:*,http-get:*:audio/mp3:*,http-get:*:audio/x-wav:*,http-get:*:audio/wav:*,http-get:*:audio/aac:*,http-get:*:audio/x-m4a:*,http-get:*:audio/flac:*,http-get:*:*</Sink>\r\n"
                          "    </u:GetProtocolInfoResponse>\r\n"
                          "  </s:Body>\r\n"
                          "</s:Envelope>\r\n";
        _server->sendHeader("Connection", "close");
        _server->sendHeader("Access-Control-Allow-Origin", "*");
        _server->send(200, "text/xml; charset=\"utf-8\"", soapResp);
    });
}

String DLNARenderer::_getDeviceDescriptionXML() {
    IPAddress ip = WiFi.localIP();
    String xml = "<?xml version=\"1.0\"?>\n"
                 "<root xmlns=\"urn:schemas-upnp-org:device-1-0\" xmlns:dlna=\"urn:schemas-dlna-org:device-1-0\">\n"
                 "  <specVersion><major>1</major><minor>0</minor></specVersion>\n"
                 "  <device>\n"
                 "    <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>\n"
                 "    <friendlyName>" + _friendlyName + "</friendlyName>\n"
                 "    <manufacturer>Espressif</manufacturer>\n"
                 "    <modelName>ESP32-S3 N16R8 HiFi</modelName>\n"
                 "    <UDN>uuid:" + _uuid + "</UDN>\n"
                 "    <dlna:X_DLNADOC xmlns:dlna=\"urn:schemas-dlna-org:device-1-0\">DMR-1.50</dlna:X_DLNADOC>\n"
                 "    <dlna:X_DLNACAP xmlns:dlna=\"urn:schemas-dlna-org:device-1-0\">playcontainer-0-1</dlna:X_DLNACAP>\n"
                 "    <serviceList>\n"
                 "      <service>\n"
                 "        <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>\n"
                 "        <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>\n"
                 "        <controlURL>/AVTransport/control</controlURL>\n"
                 "      </service>\n"
                 "      <service>\n"
                 "        <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>\n"
                 "        <serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>\n"
                 "        <controlURL>/RenderingControl/control</controlURL>\n"
                 "      </service>\n"
                 "      <service>\n"
                 "        <serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType>\n"
                 "        <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>\n"
                 "        <controlURL>/ConnectionManager/control</controlURL>\n"
                 "      </service>\n"
                 "    </serviceList>\n"
                 "  </device>\n"
                 "</root>";
    return xml;
}

void DLNARenderer::stop() {
    _sendSsdpBye();
    _ssdpUdp.stop();
}
`;
}

export function getMaterialUiHtml(config: ProjectConfig): string {
  const { audioSettings } = config;
  const mDns = audioSettings?.mDnsHost || 'esp32-audio';
  const name = audioSettings?.dlnaDeviceName || 'ESP32-S3 HiFi Streamer';

  return `/**
 * @file material_ui_assets.h
 * @brief Material UI 3 Web Application served by ESP32-S3 HTTP server
 */

#pragma once

#include <Arduino.h>

const char MATERIAL_UI_INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} • Material 3 HiFi Control</title>
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
      <h2 style="font-size: 16px; font-weight: 700;">\${name}</h2>
      <p style="font-size: 11px; color: var(--md-sys-color-outline);">ESP32-S3 N16R8 • http://\${mDns}.local</p>
    </div>
    <div class="badge-group">
      <div class="badge badge-dlna" title="DLNA / UPnP MediaRenderer v1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg> DLNA
      </div>
      <div class="badge badge-airplay" title="Apple AirPlay 2 / RAOP Receiver">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 22h12l-6-6-6 6zM21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v-2H3V5h18v12h-4v2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg> AirPlay 2
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
          <input type="range" id="bass" min="-16" max="16" value="\${audioSettings?.eqBass || 0}" oninput="updateTone()">
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>Midrange (Vocals)</span><span id="midVal">0 dB</span></div>
          <input type="range" id="mid" min="-16" max="16" value="\${audioSettings?.eqMid || 0}" oninput="updateTone()">
        </div>
        <div class="slider-row">
          <div class="slider-label"><span>Treble (High Frequencies)</span><span id="trebleVal">0 dB</span></div>
          <input type="range" id="treble" min="-16" max="16" value="\${audioSettings?.eqTreble || 0}" oninput="updateTone()">
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
          <input type="text" id="streamUrl" placeholder="http://stream-server.com/live.mp3">
          <button class="btn-filled" onclick="playUrl()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Stream URL
          </button>
        </div>
      </div>
      <div style="font-size: 10px; color: var(--md-sys-color-outline); margin-top: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px;">
        Buffer: 256KB Octal PSRAM Stream
      </div>
    </div>

    <!-- TILE 3: Wi-Fi, DLNA & AirPlay Receiver (Combined) -->
    <div class="card">
      <div>
        <div class="card-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: var(--md-sys-color-primary);"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg> Wi-Fi, DLNA & AirPlay 2
        </div>
        <p style="font-size: 11px; color: var(--md-sys-color-outline); margin-bottom: 8px;">
          Casting services running simultaneously:
        </p>
        <div style="background: var(--md-sys-color-surface-container-high); border-radius: 12px; padding: 10px; font-size: 11px; margin-bottom: 10px; border: 1px solid var(--md-sys-color-outline-variant);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span>DLNA / UPnP Renderer</span><span style="color: var(--md-sys-color-primary); font-weight: 600;">Active (SSDP 1900)</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Apple AirPlay 2 / RAOP</span><span style="color: #7dd3fc; font-weight: 600;">Active (RAOP 5000)</span>
          </div>
        </div>
        <div class="input-btn-row">
          <input type="text" id="wifiSsid" placeholder="WiFi SSID">
          <input type="password" id="wifiPass" placeholder="WiFi Password">
          <button class="btn-filled" onclick="saveWiFi()">Save & Connect</button>
        </div>
      </div>
      <div style="font-size: 10px; color: var(--md-sys-color-outline); margin-top: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 8px;">
        mDNS: http://\${mDns}.local
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

    function saveWiFi() {
      const ssid = document.getElementById('wifiSsid').value;
      const pass = document.getElementById('wifiPass').value;
      fetch('/api/wifi?ssid=' + encodeURIComponent(ssid) + '&pass=' + encodeURIComponent(pass), { method: 'POST' })
        .then(() => alert('WiFi credentials saved! ESP32 connecting...'));
    }
  </script>
</body>
</html>
)rawliteral";
`;
}

export function getAirPlayReceiverHeader(): string {
  return `/**
 * @file airplay_raop.h
 * @brief Lightweight AirPlay 1 (RAOP) Audio Receiver for ESP32-S3
 * 
 * Supports streaming from iOS Control Center, macOS, and iTunes clients.
 */

#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>

class AirPlayReceiver {
public:
    typedef void (*AudioPcmCallback)(const uint8_t* pcmData, size_t len);
    typedef void (*StreamMetaCallback)(const String& title, const String& artist);
    typedef void (*VolumeCallback)(float volume);
    typedef void (*StateCallback)(bool isPlaying);

    AirPlayReceiver();
    bool begin(const char* deviceName, uint16_t rtspPort = 5000, uint16_t rtpPort = 6000);
    void announceBonjour();
    void loop();
    void stop();

    void setOnAudioPcm(AudioPcmCallback cb) { _onAudioPcm = cb; }
    void setOnMeta(StreamMetaCallback cb) { _onMeta = cb; }
    void setOnVolume(VolumeCallback cb) { _onVolume = cb; }
    void setOnState(StateCallback cb) { _onState = cb; }

    bool isConnected() const { return _clientConnected; }
    String getClientName() const { return _clientName; }

private:
    String _deviceName;
    uint16_t _rtspPort;
    uint16_t _rtpPort;
    WiFiServer _rtspServer;
    WiFiClient _rtspClient;
    WiFiUDP _rtpUdp;
    WiFiUDP _rtpControlUdp;
    WiFiUDP _rtpTimingUdp;

    bool _clientConnected;
    String _clientName;
    unsigned long _lastKeepAlive;
    uint16_t _clientControlPort;
    uint16_t _clientTimingPort;

    AudioPcmCallback _onAudioPcm;
    StreamMetaCallback _onMeta;
    VolumeCallback _onVolume;
    StateCallback _onState;

    void _handleRtspRequests();
    void _handleRtpAudio();
    void _handleRtpTiming();
    void _sendRtspResponse(const String& cseq, const String& extraHeaders = "");
};
`;
}

export function getAirPlayReceiverCpp(): string {
  return `/**
 * @file airplay_raop.cpp
 * @brief Lightweight AirPlay 1 (RAOP) Receiver implementation for ESP32-S3
 */

#include "airplay_raop.h"
#include <ESPmDNS.h>
#include <mdns.h>

AirPlayReceiver::AirPlayReceiver()
    : _rtspPort(5000), _rtpPort(6000), _rtspServer(5000), _clientConnected(false),
      _lastKeepAlive(0), _onAudioPcm(nullptr), _onMeta(nullptr),
      _onVolume(nullptr), _onState(nullptr) {
}

bool AirPlayReceiver::begin(const char* deviceName, uint16_t rtspPort, uint16_t rtpPort) {
    _deviceName = deviceName;
    _rtspPort = rtspPort;
    _rtpPort = rtpPort;

    _rtspServer.begin(_rtspPort);
    _rtpUdp.begin(_rtpPort);             // Port 6000: RTP Audio (PCM samples)
    _rtpControlUdp.begin(_rtpPort + 1);   // Port 6001: RTP Control
    _rtpTimingUdp.begin(_rtpPort + 2);    // Port 6002: RTP Timing

    Serial.printf("[AirPlay] RAOP Receiver sockets bound on RTSP port %d, RTP audio ports %d-%d\\n", _rtspPort, _rtpPort, _rtpPort + 2);
    return true;
}

void AirPlayReceiver::announceBonjour() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    char macColonStr[18];
    snprintf(macColonStr, sizeof(macColonStr), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    // Apple AirPlay RAOP service name strictly requires: MAC@DeviceName
    String raopServiceName = String(macStr) + "@" + _deviceName;

    // Helper lambda using explicit String types to avoid overload ambiguity in ESPmDNS.h
    auto addTxt = [](const String& svc, const String& proto, const String& key, const String& val) {
        MDNS.addServiceTxt(svc, proto, key, val);
    };

    // Remove any previous service registration to avoid duplicate conflict in ESP-IDF mDNS
    mdns_service_remove("_raop", "_tcp");

    // Announce _raop._tcp on port 5000: Unencrypted 16-bit 44.1kHz Stereo PCM
    if (MDNS.addService("raop", "tcp", _rtspPort)) {
        mdns_service_instance_name_set("_raop", "_tcp", raopServiceName.c_str());

        addTxt("raop", "tcp", "tp", "UDP");
        addTxt("raop", "tcp", "sm", "false");
        addTxt("raop", "tcp", "sv", "false");
        addTxt("raop", "tcp", "ek", "0");         // 0 = No encryption key needed
        addTxt("raop", "tcp", "et", "0");         // 0 = STRICTLY unencrypted stream (prevents iOS FairPlay / RSA failure)
        addTxt("raop", "tcp", "cn", "0,1");       // 0 = Linear 16-bit PCM, 1 = ALAC
        addTxt("raop", "tcp", "ch", "2");         // 2 = Stereo channels
        addTxt("raop", "tcp", "ss", "16");        // 16 = 16-bit sample size
        addTxt("raop", "tcp", "sr", "44100");     // 44.1 kHz sample rate
        addTxt("raop", "tcp", "vn", "65537");
        addTxt("raop", "tcp", "txtvers", "1");
        addTxt("raop", "tcp", "da", "true");
        addTxt("raop", "tcp", "md", "0");         // 0 = unencrypted audio
        addTxt("raop", "tcp", "pw", "false");

        Serial.printf("[AirPlay] AirPlay Bonjour announced: %s (%s) on port %d\\n", raopServiceName.c_str(), macColonStr, _rtspPort);
    } else {
        Serial.printf("[AirPlay] Error: Unable to register _raop._tcp on port %d (mDNS not running?)\\n", _rtspPort);
    }
}

void AirPlayReceiver::loop() {
    _handleRtspRequests();
    _handleRtpAudio();
    _handleRtpTiming();

    // Drain control socket to keep network buffers clean
    if (_rtpControlUdp.parsePacket() > 0) {
        _rtpControlUdp.flush();
    }

    if (_clientConnected && (!_rtspClient || !_rtspClient.connected())) {
        stop();
    }
}

void AirPlayReceiver::_handleRtpTiming() {
    int packetSize = _rtpTimingUdp.parsePacket();
    if (packetSize >= 32) {
        uint8_t req[32];
        int len = _rtpTimingUdp.read(req, sizeof(req));
        if (len >= 32) {
            uint8_t pt = req[1] & 0x7F;
            if (pt == 0x52 || pt == 0x02 || (req[1] == 0xD2) || (req[1] == 0x82)) {
                uint8_t resp[32];
                memset(resp, 0, sizeof(resp));
                resp[0] = 0x80;
                resp[1] = 0x53; // Timing reply payload type
                resp[2] = req[2]; // Echo sequence number
                resp[3] = req[3];
                memcpy(&resp[8], &req[24], 8);

                uint64_t nowUs = (uint64_t)esp_timer_get_time();
                uint32_t sec = (uint32_t)(nowUs / 1000000ULL);
                uint32_t frac = (uint32_t)(((nowUs % 1000000ULL) * 4294967296ULL) / 1000000ULL);

                resp[16] = (sec >> 24) & 0xFF; resp[17] = (sec >> 16) & 0xFF;
                resp[18] = (sec >> 8) & 0xFF;  resp[19] = sec & 0xFF;
                resp[20] = (frac >> 24) & 0xFF; resp[21] = (frac >> 16) & 0xFF;
                resp[22] = (frac >> 8) & 0xFF;  resp[23] = frac & 0xFF;

                memcpy(&resp[24], &resp[16], 8);

                _rtpTimingUdp.beginPacket(_rtpTimingUdp.remoteIP(), _rtpTimingUdp.remotePort());
                _rtpTimingUdp.write(resp, sizeof(resp));
                _rtpTimingUdp.endPacket();
            }
        }
    } else if (packetSize > 0) {
        _rtpTimingUdp.flush();
    }
}

void AirPlayReceiver::_handleRtspRequests() {
    WiFiClient newClient = _rtspServer.available();
    if (newClient) {
        if (_rtspClient && _rtspClient.connected() && _rtspClient.remoteIP() != newClient.remoteIP()) {
            _rtspClient.stop();
        }
        _rtspClient = newClient;
        _clientConnected = true;
        _rtspClient.setTimeout(500);
        _clientName = _rtspClient.remoteIP().toString();
        _lastKeepAlive = millis();
        _clientControlPort = _rtpPort + 1;
        _clientTimingPort = _rtpPort + 2;
        Serial.printf("[AirPlay] iOS / macOS client connected from %s\\n", _clientName.c_str());
    }

    if (_rtspClient && _rtspClient.available()) {
        String reqLine = _rtspClient.readStringUntil('\\n');
        reqLine.trim();

        if (reqLine.length() > 0) {
            String cseq = "1";
            int contentLength = 0;
            String transportHeader = "";

            unsigned long headerStart = millis();
            while (_rtspClient.connected() && (millis() - headerStart < 1500)) {
                if (_rtspClient.available()) {
                    String header = _rtspClient.readStringUntil('\\n');
                    header.trim();
                    if (header.length() == 0) break;

                    String lower = header;
                    lower.toLowerCase();
                    if (lower.startsWith("cseq:")) {
                        cseq = header.substring(5);
                        cseq.trim();
                    } else if (lower.startsWith("content-length:")) {
                        contentLength = header.substring(15).toInt();
                    } else if (lower.startsWith("transport:")) {
                        transportHeader = header.substring(10);
                        transportHeader.trim();
                    }
                } else {
                    delay(2);
                }
            }

            String body = "";
            if (contentLength > 0 && contentLength < 8192) {
                unsigned long tStart = millis();
                while (contentLength > 0 && (millis() - tStart < 800)) {
                    if (_rtspClient.available()) {
                        char c = (char)_rtspClient.read();
                        body += c;
                        contentLength--;
                    } else {
                        delay(1);
                    }
                }
            }

            String cmd = reqLine;
            int spaceIdx = cmd.indexOf(' ');
            if (spaceIdx > 0) {
                cmd = cmd.substring(0, spaceIdx);
            }
            cmd.toUpperCase();
            Serial.printf("[AirPlay RTSP] %s (CSeq %s)\\n", cmd.c_str(), cseq.c_str());

            if (cmd == "OPTIONS") {
                _sendRtspResponse(cseq, "Public: ANNOUNCE, SETUP, RECORD, PAUSE, FLUSH, TEARDOWN, OPTIONS, SET_PARAMETER, GET_PARAMETER\\r\\n");
            } else if (cmd == "ANNOUNCE") {
                _sendRtspResponse(cseq);
                if (_onMeta) _onMeta("AirPlay Audio", _clientName);
            } else if (cmd == "SETUP") {
                int cpIdx = transportHeader.indexOf("control_port=");
                if (cpIdx >= 0) {
                    _clientControlPort = transportHeader.substring(cpIdx + 13).toInt();
                }
                int tpIdx = transportHeader.indexOf("timing_port=");
                if (tpIdx >= 0) {
                    _clientTimingPort = transportHeader.substring(tpIdx + 12).toInt();
                }
                String transport = "Transport: RTP/AVP/UDP;unicast;mode=record;server_port=" + String(_rtpPort) + 
                                   ";control_port=" + String(_clientControlPort) + 
                                   ";timing_port=" + String(_clientTimingPort) + 
                                   "\\r\\nSession: 12345678\\r\\nAudio-Jack-Status: connected; type=digital\\r\\n";
                _sendRtspResponse(cseq, transport);
            } else if (cmd == "RECORD") {
                _sendRtspResponse(cseq, "Session: 12345678\\r\\nAudio-Latency: 11025\\r\\n");
                if (_onState) _onState(true);
                Serial.println("[AirPlay] Audio session RECORD active! Streaming started.");
            } else if (cmd == "SET_PARAMETER") {
                int vIdx = body.indexOf("volume:");
                if (vIdx >= 0) {
                    float volDb = body.substring(vIdx + 7).toFloat();
                    float volPercent = 0.0f;
                    if (volDb > -100.0f) {
                        volPercent = (volDb + 30.0f) / 30.0f * 100.0f;
                        if (volPercent < 0.0f) volPercent = 0.0f;
                        if (volPercent > 100.0f) volPercent = 100.0f;
                    }
                    if (_onVolume) _onVolume(volPercent);
                    Serial.printf("[AirPlay] Volume: %.1f dB -> %.0f%%\\n", volDb, volPercent);
                }
                _sendRtspResponse(cseq);
            } else if (cmd == "FLUSH" || cmd == "PAUSE") {
                _sendRtspResponse(cseq, "RTP-Info: seq=0;rtptime=0\\r\\n");
                if (_onState) _onState(false);
            } else if (cmd == "TEARDOWN") {
                _sendRtspResponse(cseq, "Connection: close\\r\\n");
                stop();
            } else {
                _sendRtspResponse(cseq);
            }
        }
    }
}

void AirPlayReceiver::_handleRtpAudio() {
    int packetSize = _rtpUdp.parsePacket();
    while (packetSize > 0) {
        if (packetSize > 12) {
            uint8_t buffer[1472];
            int len = _rtpUdp.read(buffer, sizeof(buffer));
            if (len > 12 && _onAudioPcm) {
                _onAudioPcm(&buffer[12], len - 12);
            }
        } else {
            _rtpUdp.flush();
        }
        packetSize = _rtpUdp.parsePacket();
    }
}

void AirPlayReceiver::_sendRtspResponse(const String& cseq, const String& extraHeaders) {
    String resp = "RTSP/1.0 200 OK\\r\\n"
                  "CSeq: " + cseq + "\\r\\n"
                  "Server: AirTunes/220.68\\r\\n";
    if (extraHeaders.length() > 0) {
        resp += extraHeaders;
    }
    resp += "\\r\\n";
    _rtspClient.print(resp);
}

void AirPlayReceiver::stop() {
    if (_clientConnected) {
        _clientConnected = false;
        if (_onState) _onState(false);
        Serial.println("[AirPlay] Client disconnected");
    }
    if (_rtspClient) {
        _rtspClient.stop();
    }
}
`;
}

