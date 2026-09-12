/**
 * @file airplay_raop.h
 * @brief Lightweight AirPlay 1 (RAOP) Audio Receiver for ESP32-S3
 * 
 * Implements:
 * - mDNS Bonjour service announcement: "_raop._tcp" & "_airplay._tcp"
 * - RTSP protocol handler on port 5000 (ANNOUNCE, SETUP, RECORD, TEARDOWN, SET_PARAMETER)
 * - RTP audio packet receiver on port 6000 (ALAC / PCM streaming directly to UDA1334A I2S)
 * 
 * Recognizable by all Apple iOS (iPhone/iPad Control Center), macOS, and iTunes clients.
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

    AudioPcmCallback _onAudioPcm;
    StreamMetaCallback _onMeta;
    VolumeCallback _onVolume;
    StateCallback _onState;

    void _announceBonjour();
    void _handleRtspRequests();
    void _handleRtpAudio();
    void _sendRtspResponse(const String& cseq, const String& extraHeaders = "");
};
