import React from 'react';
import { PartitionScheme } from '../types';
import { PARTITION_SCHEMES } from '../data/partitions';
import { Layers, Database, HardDrive, ShieldCheck } from 'lucide-react';

interface PartitionVisualizerProps {
  scheme?: PartitionScheme;
}

const TOTAL_FLASH_BYTES = 16 * 1024 * 1024; // 16 MB

const PARTITION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  app0: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  app1: { bg: 'bg-indigo-500/20', border: 'border-indigo-500/40', text: 'text-indigo-400' },
  spiffs: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
  littlefs: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
  nvs: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
  otadata: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  coredump: { bg: 'bg-rose-500/20', border: 'border-rose-500/40', text: 'text-rose-400' }
};

export const PartitionVisualizer: React.FC<PartitionVisualizerProps> = ({ scheme: providedScheme }) => {
  const scheme = providedScheme || PARTITION_SCHEMES[0];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">16MB Flash Partition Allocation</h3>
        </div>
        <span className="text-xs font-mono text-slate-400">Total: 16.0 MB (0x1000000 bytes)</span>
      </div>

      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        Default ESP32 partition tables are configured for 4MB flash. On the N16R8, this custom 16MB table unlocks the full 16MB capacity for large dual OTA binaries or multi-megabyte LittleFS storage.
      </p>

      {/* Proportional Visual Bar */}
      <div className="w-full h-8 bg-slate-950 rounded-lg overflow-hidden flex border border-slate-800 p-0.5 gap-0.5 mb-4">
        {scheme.entries.map((entry) => {
          const widthPercent = Math.max(1.5, (entry.sizeBytes / TOTAL_FLASH_BYTES) * 100);
          const styling = PARTITION_COLORS[entry.name.toLowerCase()] || {
            bg: 'bg-slate-700/30',
            border: 'border-slate-600/50',
            text: 'text-slate-300'
          };

          return (
            <div
              key={entry.name}
              style={{ width: `${widthPercent}%` }}
              className={`h-full ${styling.bg} border-l first:border-l-0 ${styling.border} flex items-center justify-center relative group transition cursor-pointer`}
              title={`${entry.name}: ${(entry.sizeBytes / (1024 * 1024)).toFixed(2)} MB (${entry.size}) at ${entry.offset}`}
            >
              <span className={`text-[10px] font-mono font-medium truncate px-1 ${styling.text}`}>
                {entry.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Detailed Partition Breakdown Table */}
      <div className="overflow-x-auto border border-slate-800/80 rounded-lg bg-slate-950/60">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-slate-800/50 text-slate-400 text-[11px] border-b border-slate-800">
            <tr>
              <th className="py-2 px-3 font-semibold">Partition</th>
              <th className="py-2 px-3 font-semibold">Type / Subtype</th>
              <th className="py-2 px-3 font-semibold">Offset</th>
              <th className="py-2 px-3 font-semibold">Size</th>
              <th className="py-2 px-3 font-semibold font-sans">Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {scheme.entries.map((entry) => {
              const styling = PARTITION_COLORS[entry.name.toLowerCase()] || {
                text: 'text-slate-200'
              };
              const sizeInMb = entry.sizeBytes >= 1024 * 1024 
                ? `${(entry.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                : `${(entry.sizeBytes / 1024).toFixed(0)} KB`;

              return (
                <tr key={entry.name} className="hover:bg-slate-800/30 transition">
                  <td className={`py-2 px-3 font-bold ${styling.text}`}>
                    {entry.name}
                  </td>
                  <td className="py-2 px-3 text-slate-400">
                    {entry.type} / {entry.subtype}
                  </td>
                  <td className="py-2 px-3 text-emerald-400/90">
                    {entry.offset}
                  </td>
                  <td className="py-2 px-3 text-white">
                    {sizeInMb} <span className="text-slate-500">({entry.size})</span>
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-400 text-xs">
                    {entry.description}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
