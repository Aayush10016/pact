import { Injectable } from '@nestjs/common';
import { createConnection } from 'node:net';

export type ScanResult = 'CLEAN' | 'INFECTED';
@Injectable()
export class EvidenceScanner {
  async scan(bytes: Uint8Array): Promise<ScanResult> {
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('SCAN_SIZE_LIMIT');
    const host = process.env.CLAMAV_HOST;
    const port = Number(process.env.CLAMAV_PORT || '3310');
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('SCANNER_UNAVAILABLE');
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      let result = '';
      const timer = setTimeout(() => finish(new Error('SCANNER_UNAVAILABLE')), 30000);
      const finish = (error?: Error, verdict?: ScanResult) => {
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve(verdict!);
      };
      socket.once('error', () => finish(new Error('SCANNER_UNAVAILABLE')));
      socket.once('connect', () => {
        socket.write('zINSTREAM\0');
        // Clamd's bounded INSTREAM protocol: network-order size, payload, zero terminator.
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536);
          const header = Buffer.alloc(4);
          header.writeUInt32BE(chunk.length);
          socket.write(header);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (data: Buffer) => {
        result += data.toString('utf8');
        if (result.length > 1024) return finish(new Error('SCANNER_OUTPUT_INVALID'));
        if (!result.includes('\0') && !result.includes('\n')) return;
        const line = result.split(/[\0\n]/)[0] || '';
        if (line === 'stream: OK') finish(undefined, 'CLEAN');
        else if (/^stream: .+ FOUND$/.test(line)) finish(undefined, 'INFECTED');
        else finish(new Error('SCANNER_UNAVAILABLE'));
      });
      socket.once('end', () => {
        if (!socket.destroyed) finish(new Error('SCANNER_OUTPUT_INVALID'));
      });
    });
  }
}
