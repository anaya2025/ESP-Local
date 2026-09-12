import React, { useState } from 'react';
import { ESP32_S3_GPIO_MAP } from '../data/gpioMap';
import { ShieldAlert, AlertTriangle, CheckCircle2, Search, Cpu, Info } from 'lucide-react';

export const PinoutConflictChecker: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'safe' | 'psram' | 'strapping'>('all');

  const filteredPins = ESP32_S3_GPIO_MAP.filter((pin) => {
    const matchesSearch = 
      pin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pin.defaultFunc.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pin.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pin.gpio.toString() === searchQuery.trim();

    if (!matchesSearch) return false;

    if (filterType === 'psram') return pin.isPsramReserved;
    if (filterType === 'strapping') return pin.isStrapping;
    if (filterType === 'safe') return !pin.isPsramReserved && !pin.isStrapping;
    return true;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
      {/* Octal PSRAM Warning Banner */}
      <div className="mb-5 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3.5 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
            Critical Hardware Rule: 8MB Octal PSRAM Pin Allocation
          </h4>
          <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
            In the <strong>ESP32-S3-WROOM-1-N16R8</strong>, the high-speed 8MB Octal PSRAM uses <strong>GPIO 33, 34, 35, 36, and 37</strong>. 
            Do <strong>NOT</strong> connect external peripherals or configure these pins in your firmware code, or a hardware bus fault / crash will occur.
          </p>
        </div>
      </div>

      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            ESP32-S3 GPIO Matrix & Conflict Inspector
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Verify pin assignments before connecting sensors, I2C, SPI, or displays.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              filterType === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({ESP32_S3_GPIO_MAP.length})
          </button>
          <button
            onClick={() => setFilterType('psram')}
            className={`px-2.5 py-1 rounded-md transition font-medium flex items-center gap-1 ${
              filterType === 'psram' ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'text-slate-400 hover:text-red-300'
            }`}
          >
            <ShieldAlert className="w-3 h-3 text-red-400" />
            PSRAM (5)
          </button>
          <button
            onClick={() => setFilterType('strapping')}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              filterType === 'strapping' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-amber-300'
            }`}
          >
            Strapping
          </button>
          <button
            onClick={() => setFilterType('safe')}
            className={`px-2.5 py-1 rounded-md transition font-medium ${
              filterType === 'safe' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-emerald-300'
            }`}
          >
            Safe General I/O
          </button>
        </div>
      </div>

      {/* Search Box */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by pin number (e.g. 33, 48), function (USB, ADC, Touch), or note..."
          className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Pin Grid/Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-[380px] overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/80 text-slate-400 text-[11px] sticky top-0 backdrop-blur z-10">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Pin</th>
              <th className="py-2.5 px-3 font-semibold">Status / Safety</th>
              <th className="py-2.5 px-3 font-semibold">Default Peripheral</th>
              <th className="py-2.5 px-3 font-semibold">ADC / Touch</th>
              <th className="py-2.5 px-3 font-semibold">Hardware Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredPins.map((pin) => {
              let statusBadge = (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> Safe I/O
                </span>
              );

              if (pin.isPsramReserved) {
                statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40">
                    <ShieldAlert className="w-3 h-3" /> OCTAL PSRAM (DO NOT USE)
                  </span>
                );
              } else if (pin.isStrapping) {
                statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertTriangle className="w-3 h-3" /> Strapping Pin
                  </span>
                );
              } else if (pin.gpio === 19 || pin.gpio === 20) {
                statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Native USB
                  </span>
                );
              } else if (pin.gpio === 48 || pin.gpio === 38) {
                statusBadge = (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    RGB NeoPixel
                  </span>
                );
              }

              return (
                <tr
                  key={pin.gpio}
                  className={`hover:bg-slate-800/30 transition ${
                    pin.isPsramReserved ? 'bg-red-950/20' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                    {pin.name}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {statusBadge}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-sans text-xs">
                    {pin.defaultFunc}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">
                    {pin.adcChannel || pin.touchChannel ? (
                      <span className="text-cyan-400">
                        {[pin.adcChannel, pin.touchChannel].filter(Boolean).join(', ')}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-xs text-slate-400 max-w-xs">
                    {pin.notes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recommended Standard Peripheral Pins */}
      <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Recommended I2C</span>
          <span className="text-slate-200 font-mono">SDA: GPIO 8, SCL: GPIO 9</span>
        </div>
        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Standard SPI</span>
          <span className="text-slate-200 font-mono">MOSI: 11, MISO: 13, SCK: 12</span>
        </div>
        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Primary UART0</span>
          <span className="text-slate-200 font-mono">TX: GPIO 43, RX: GPIO 44</span>
        </div>
        <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Onboard NeoPixel</span>
          <span className="text-slate-200 font-mono">WS2812: GPIO 48</span>
        </div>
      </div>
    </div>
  );
};
