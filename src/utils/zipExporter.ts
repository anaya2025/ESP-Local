import JSZip from 'jszip';
import { GeneratedFile } from '../types';

/**
 * Packs all repository files into a complete, git-ready ZIP archive
 * and triggers immediate browser download.
 */
export async function downloadProjectZip(files: GeneratedFile[], projectName: string): Promise<void> {
  const zip = new JSZip();

  for (const file of files) {
    // JSZip handles folder structures automatically when path contains slashes
    zip.file(file.path, file.content);
  }

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  const url = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${projectName.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'esp32s3-n16r8-project'}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
