/**
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

    announceBonjour();
    Serial.printf("[AirPlay] RAOP Receiver listening on RTSP port %d, RTP audio ports %d-%d\n", _rtspPort, _rtpPort, _rtpPort + 2);
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

    // 1. Announce _raop._tcp on port 5000: Unencrypted 16-bit 44.1kHz Stereo PCM
    MDNS.addService("raop", "tcp", _rtspPort);
    MDNS.setInstanceName(raopServiceName.c_str());
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

    Serial.printf("[AirPlay] AirPlay Bonjour announced: %s (%s) on port %d\n", raopServiceName.c_str(), macColonStr, _rtspPort);
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
            // Check for timing request (payload type 0x52 or 0x82 or 0xD2)
            uint8_t pt = req[1] & 0x7F;
            if (pt == 0x52 || pt == 0x02 || (req[1] == 0xD2) || (req[1] == 0x82)) {
                uint8_t resp[32];
                memset(resp, 0, sizeof(resp));
                resp[0] = 0x80;
                resp[1] = 0x53; // Timing reply payload type
                resp[2] = req[2]; // Echo sequence number
                resp[3] = req[3];
                // Echo origin timestamp from request transmit timestamp (bytes 24-31)
                memcpy(&resp[8], &req[24], 8);

                // Current time in 64-bit microsecond NTP timestamp
                uint64_t nowUs = (uint64_t)esp_timer_get_time();
                uint32_t sec = (uint32_t)(nowUs / 1000000ULL);
                uint32_t frac = (uint32_t)(((nowUs % 1000000ULL) * 4294967296ULL) / 1000000ULL);

                // Receive timestamp (bytes 16-23)
                resp[16] = (sec >> 24) & 0xFF; resp[17] = (sec >> 16) & 0xFF;
                resp[18] = (sec >> 8) & 0xFF;  resp[19] = sec & 0xFF;
                resp[20] = (frac >> 24) & 0xFF; resp[21] = (frac >> 16) & 0xFF;
                resp[22] = (frac >> 8) & 0xFF;  resp[23] = frac & 0xFF;

                // Transmit timestamp (bytes 24-31)
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
        Serial.printf("[AirPlay] iOS / macOS client connected from %s\n", _clientName.c_str());
    }

    if (_rtspClient && _rtspClient.available()) {
        String reqLine = _rtspClient.readStringUntil('\n');
        reqLine.trim();

        if (reqLine.length() > 0) {
            String cseq = "1";
            int contentLength = 0;
            String transportHeader = "";

            // Read headers with timeout to protect against TCP segment fragmentation
            unsigned long headerStart = millis();
            while (_rtspClient.connected() && (millis() - headerStart < 1500)) {
                if (_rtspClient.available()) {
                    String header = _rtspClient.readStringUntil('\n');
                    header.trim();
                    if (header.length() == 0) break; // End of RTSP headers

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

            // Read payload body if Content-Length specified
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
            Serial.printf("[AirPlay RTSP] %s (CSeq %s)\n", cmd.c_str(), cseq.c_str());

            if (cmd == "OPTIONS") {
                _sendRtspResponse(cseq, "Public: ANNOUNCE, SETUP, RECORD, PAUSE, FLUSH, TEARDOWN, OPTIONS, SET_PARAMETER, GET_PARAMETER\r\n");
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
                                   "\r\nSession: 12345678\r\nAudio-Jack-Status: connected; type=digital\r\n";
                _sendRtspResponse(cseq, transport);
            } else if (cmd == "RECORD") {
                _sendRtspResponse(cseq, "Session: 12345678\r\nAudio-Latency: 11025\r\n");
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
                    Serial.printf("[AirPlay] Volume: %.1f dB -> %.0f%%\n", volDb, volPercent);
                }
                _sendRtspResponse(cseq);
            } else if (cmd == "FLUSH" || cmd == "PAUSE") {
                _sendRtspResponse(cseq, "RTP-Info: seq=0;rtptime=0\r\n");
                if (_onState) _onState(false);
            } else if (cmd == "TEARDOWN") {
                _sendRtspResponse(cseq, "Connection: close\r\n");
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
        if (packetSize > 12) { // Standard RTP header is 12 bytes
            uint8_t buffer[1472];
            int len = _rtpUdp.read(buffer, sizeof(buffer));
            if (len > 12 && _onAudioPcm) {
                // In uncompressed PCM RAOP (cn=0), bytes 12..end are raw 16-bit 44.1kHz stereo PCM
                _onAudioPcm(&buffer[12], len - 12);
            }
        } else {
            _rtpUdp.flush();
        }
        packetSize = _rtpUdp.parsePacket();
    }
}

void AirPlayReceiver::_sendRtspResponse(const String& cseq, const String& extraHeaders) {
    String resp = "RTSP/1.0 200 OK\r\n"
                  "CSeq: " + cseq + "\r\n"
                  "Server: AirTunes/220.68\r\n";
    if (extraHeaders.length() > 0) {
        resp += extraHeaders;
    }
    resp += "\r\n";
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
