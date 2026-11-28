/**
 * Lightweight browser-safe MPEG-TS muxer for HLS streams with separate
 * `#EXT-X-MEDIA:TYPE=AUDIO` MPEG-TS renditions.
 */

const TS_PACKET_SIZE = 188;
const AUDIO_STREAM_TYPES = new Set([0x03, 0x04, 0x0f, 0x11, 0x81, 0x82, 0x87]);
const VIDEO_STREAM_TYPES = new Set([0x01, 0x02, 0x10, 0x1b, 0x24, 0x42, 0xea]);

interface EsEntry {
  streamType: number;
  pid: number;
  esInfo: Uint8Array;
}

interface ParsedPmt {
  pmtPid: number;
  programNumber: number;
  pcrPid: number;
  version: number;
  programInfo: Uint8Array;
  streams: EsEntry[];
}

function mpegCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]! << 24;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x80000000) !== 0) {
        crc = ((crc << 1) ^ 0x04c11db7) >>> 0;
      } else {
        crc = (crc << 1) >>> 0;
      }
    }
  }
  return crc >>> 0;
}

function findTsSyncOffset(buf: Uint8Array): number {
  const limit = Math.min(buf.length, TS_PACKET_SIZE * 4);
  for (let i = 0; i < limit; i++) {
    if (buf[i] !== 0x47) continue;
    if (i + TS_PACKET_SIZE >= buf.length || buf[i + TS_PACKET_SIZE] === 0x47) {
      return i;
    }
  }
  return 0;
}

function getSectionPayload(pkt: Uint8Array, offset: number): Uint8Array | null {
  const pusi = (pkt[offset + 1]! & 0x40) !== 0;
  if (!pusi) return null;
  const afc = (pkt[offset + 3]! >> 4) & 0x03;
  let pos = 4;
  if (afc === 0 || afc === 2) return null;
  if (afc === 3) {
    const adaptLen = pkt[offset + 4]!;
    pos += 1 + adaptLen;
  }
  if (pos >= TS_PACKET_SIZE) return null;
  const pointerField = pkt[offset + pos]!;
  pos += 1 + pointerField;
  if (pos >= TS_PACKET_SIZE) return null;
  return pkt.subarray(offset + pos, offset + TS_PACKET_SIZE);
}

function parsePatFirstPmtPid(sec: Uint8Array): number | null {
  if (sec.length < 12 || sec[0] !== 0x00) return null;
  const sectionLength = ((sec[1]! & 0x0f) << 8) | sec[2]!;
  const sectionEnd = Math.min(sec.length, 3 + sectionLength);
  const entriesEnd = sectionEnd - 4;
  for (let p = 8; p + 3 < entriesEnd; p += 4) {
    const progNum = (sec[p]! << 8) | sec[p + 1]!;
    const pid = ((sec[p + 2]! & 0x1f) << 8) | sec[p + 3]!;
    if (progNum !== 0 && pid !== 0) return pid;
  }
  return null;
}

function parsePmtSection(sec: Uint8Array, pmtPid: number): ParsedPmt | null {
  if (sec.length < 16 || sec[0] !== 0x02) return null;
  const sectionLength = ((sec[1]! & 0x0f) << 8) | sec[2]!;
  const sectionEnd = Math.min(sec.length, 3 + sectionLength);
  const programNumber = (sec[3]! << 8) | sec[4]!;
  const version = (sec[5]! >> 1) & 0x1f;
  const pcrPid = ((sec[8]! & 0x1f) << 8) | sec[9]!;
  const programInfoLen = ((sec[10]! & 0x0f) << 8) | sec[11]!;
  let pos = 12;
  const progInfoEnd = Math.min(sectionEnd - 4, pos + programInfoLen);
  const programInfo = sec.slice(pos, progInfoEnd);
  pos = progInfoEnd;

  const streams: EsEntry[] = [];
  const esEnd = sectionEnd - 4;
  while (pos + 5 <= esEnd) {
    const streamType = sec[pos]!;
    const pid = ((sec[pos + 1]! & 0x1f) << 8) | sec[pos + 2]!;
    const esInfoLen = ((sec[pos + 3]! & 0x0f) << 8) | sec[pos + 4]!;
    pos += 5;
    const infoEnd = Math.min(esEnd, pos + esInfoLen);
    const esInfo = sec.slice(pos, infoEnd);
    pos = infoEnd;
    streams.push({ streamType, pid, esInfo });
  }
  return { pmtPid, programNumber, pcrPid, version, programInfo, streams };
}

function inspectTsPmt(buffers: Uint8Array[]): ParsedPmt | null {
  let pmtPid: number | null = null;
  for (const buf of buffers) {
    const start = findTsSyncOffset(buf);
    for (let off = start; off + TS_PACKET_SIZE <= buf.length; off += TS_PACKET_SIZE) {
      if (buf[off] !== 0x47) continue;
      const pid = ((buf[off + 1]! & 0x1f) << 8) | buf[off + 2]!;
      if (pid === 0 && pmtPid === null) {
        const sec = getSectionPayload(buf, off);
        if (sec) pmtPid = parsePatFirstPmtPid(sec);
      } else if (pmtPid !== null && pid === pmtPid) {
        const sec = getSectionPayload(buf, off);
        if (sec) {
          const pmt = parsePmtSection(sec, pmtPid);
          if (pmt && pmt.streams.length > 0) return pmt;
        }
      }
    }
  }
  return null;
}

function buildPmtPacket(
  pmt: ParsedPmt,
  extraAudio: EsEntry,
  continuityCounter: number,
): Uint8Array | null {
  const streams = [...pmt.streams, extraAudio];
  let esBytesLen = 0;
  for (const s of streams) esBytesLen += 5 + s.esInfo.length;

  const bodyLen = 9 + pmt.programInfo.length + esBytesLen + 4;
  const totalSectionLen = 3 + bodyLen;
  // Single-packet PSI limit: 188 - 4 (TS header) - 1 (pointer_field) = 183 bytes
  if (totalSectionLen > 183) return null;

  const pkt = new Uint8Array(TS_PACKET_SIZE);
  pkt.fill(0xff);
  pkt[0] = 0x47;
  pkt[1] = 0x40 | ((pmt.pmtPid >> 8) & 0x1f);
  pkt[2] = pmt.pmtPid & 0xff;
  pkt[3] = 0x10 | (continuityCounter & 0x0f);
  pkt[4] = 0x00; // pointer_field

  const sec = pkt.subarray(5, 5 + totalSectionLen);
  sec[0] = 0x02; // table_id = PMT
  sec[1] = 0xb0 | ((bodyLen >> 8) & 0x0f);
  sec[2] = bodyLen & 0xff;
  sec[3] = (pmt.programNumber >> 8) & 0xff;
  sec[4] = pmt.programNumber & 0xff;
  sec[5] = 0xc1 | ((pmt.version & 0x1f) << 1);
  sec[6] = 0x00;
  sec[7] = 0x00;
  sec[8] = 0xe0 | ((pmt.pcrPid >> 8) & 0x1f);
  sec[9] = pmt.pcrPid & 0xff;
  sec[10] = 0xf0 | ((pmt.programInfo.length >> 8) & 0x0f);
  sec[11] = pmt.programInfo.length & 0xff;

  let pos = 12;
  if (pmt.programInfo.length > 0) {
    sec.set(pmt.programInfo, pos);
    pos += pmt.programInfo.length;
  }
  for (const s of streams) {
    sec[pos++] = s.streamType;
    sec[pos++] = 0xe0 | ((s.pid >> 8) & 0x1f);
    sec[pos++] = s.pid & 0xff;
    sec[pos++] = 0xf0 | ((s.esInfo.length >> 8) & 0x0f);
    sec[pos++] = s.esInfo.length & 0xff;
    if (s.esInfo.length > 0) {
      sec.set(s.esInfo, pos);
      pos += s.esInfo.length;
    }
  }
  const crc = mpegCrc32(sec.subarray(0, pos));
  sec[pos++] = (crc >>> 24) & 0xff;
  sec[pos++] = (crc >>> 16) & 0xff;
  sec[pos++] = (crc >>> 8) & 0xff;
  sec[pos++] = crc & 0xff;

  return pkt;
}

function chooseAudioPid(videoPmt: ParsedPmt): number {
  const used = new Set<number>([0x0000, 0x0010, 0x0011, videoPmt.pmtPid, videoPmt.pcrPid]);
  for (const s of videoPmt.streams) used.add(s.pid);
  for (let candidate = 0x0101; candidate < 0x1ffe; candidate++) {
    if (!used.has(candidate)) return candidate;
  }
  return 0x0101;
}

function collectAudioPackets(
  buf: Uint8Array,
  audioSrcPid: number,
  targetAudioPid: number,
): Uint8Array[] {
  const out: Uint8Array[] = [];
  const start = findTsSyncOffset(buf);
  const hi = (targetAudioPid >> 8) & 0x1f;
  const lo = targetAudioPid & 0xff;
  for (let off = start; off + TS_PACKET_SIZE <= buf.length; off += TS_PACKET_SIZE) {
    if (buf[off] !== 0x47) continue;
    const pid = ((buf[off + 1]! & 0x1f) << 8) | buf[off + 2]!;
    if (pid !== audioSrcPid) continue;
    const copy = buf.slice(off, off + TS_PACKET_SIZE);
    copy[1] = (copy[1]! & 0xe0) | hi;
    copy[2] = lo;
    out.push(copy);
  }
  return out;
}

function collectVideoPackets(
  buf: Uint8Array,
  videoPmt: ParsedPmt,
  extraAudio: EsEntry,
): Uint8Array[] {
  const out: Uint8Array[] = [];
  const start = findTsSyncOffset(buf);
  for (let off = start; off + TS_PACKET_SIZE <= buf.length; off += TS_PACKET_SIZE) {
    if (buf[off] !== 0x47) continue;
    const pid = ((buf[off + 1]! & 0x1f) << 8) | buf[off + 2]!;
    if (pid === videoPmt.pmtPid) {
      const cc = buf[off + 3]! & 0x0f;
      const rewritten = buildPmtPacket(videoPmt, extraAudio, cc);
      if (rewritten) {
        out.push(rewritten);
        continue;
      }
    }
    out.push(buf.subarray(off, off + TS_PACKET_SIZE));
  }
  return out;
}

function interleavePackets(videoPkts: Uint8Array[], audioPkts: Uint8Array[]): Uint8Array {
  const totalPackets = videoPkts.length + audioPkts.length;
  const merged = new Uint8Array(totalPackets * TS_PACKET_SIZE);
  let outOffset = 0;
  let aIdx = 0;
  const vLen = videoPkts.length;
  const aLen = audioPkts.length;

  if (vLen === 0) {
    for (const ap of audioPkts) {
      merged.set(ap, outOffset);
      outOffset += TS_PACKET_SIZE;
    }
    return merged;
  }

  for (let vIdx = 0; vIdx < vLen; vIdx++) {
    merged.set(videoPkts[vIdx]!, outOffset);
    outOffset += TS_PACKET_SIZE;
    const targetAudioIdx = Math.floor(((vIdx + 1) * aLen) / vLen);
    while (aIdx < targetAudioIdx && aIdx < aLen) {
      merged.set(audioPkts[aIdx]!, outOffset);
      outOffset += TS_PACKET_SIZE;
      aIdx++;
    }
  }
  while (aIdx < aLen) {
    merged.set(audioPkts[aIdx]!, outOffset);
    outOffset += TS_PACKET_SIZE;
    aIdx++;
  }
  return merged;
}

/**
 * Muxes video-only MPEG-TS segments with separate audio-only MPEG-TS segments.
 * Falls back cleanly to concatenating `videoParts` if the video already embeds audio
 * or if the buffers are not valid MPEG-TS packets.
 */
export function muxMpegTsVideoAndAudio(
  videoParts: ArrayBuffer[],
  audioParts: ArrayBuffer[],
): BlobPart[] {
  if (!videoParts.length || !audioParts.length) return videoParts;

  const videoU8 = videoParts.map((b) => new Uint8Array(b));
  const audioU8 = audioParts.map((b) => new Uint8Array(b));

  const videoPmt = inspectTsPmt(videoU8);
  const audioPmt = inspectTsPmt(audioU8);
  if (!videoPmt || !audioPmt) return videoParts;

  // Video stream already carries an audio track — keep video intact.
  if (videoPmt.streams.some((s) => AUDIO_STREAM_TYPES.has(s.streamType))) {
    return videoParts;
  }

  const audioEs =
    audioPmt.streams.find((s) => AUDIO_STREAM_TYPES.has(s.streamType)) ??
    audioPmt.streams.find((s) => !VIDEO_STREAM_TYPES.has(s.streamType));
  if (!audioEs) return videoParts;

  const targetAudioPid = chooseAudioPid(videoPmt);
  const extraAudio: EsEntry = {
    streamType: audioEs.streamType,
    pid: targetAudioPid,
    esInfo: audioEs.esInfo,
  };

  // Sanity-check that PMT fits inside a single TS packet.
  if (!buildPmtPacket(videoPmt, extraAudio, 0)) {
    return videoParts;
  }

  const outChunks: BlobPart[] = [];
  for (let i = 0; i < videoU8.length; i++) {
    const aStart = Math.floor((i * audioU8.length) / videoU8.length);
    const aEnd = Math.floor(((i + 1) * audioU8.length) / videoU8.length);

    const vPkts = collectVideoPackets(videoU8[i]!, videoPmt, extraAudio);
    const aPkts: Uint8Array[] = [];
    for (let j = aStart; j < aEnd; j++) {
      aPkts.push(...collectAudioPackets(audioU8[j]!, audioEs.pid, targetAudioPid));
    }
    const muxed = interleavePackets(vPkts, aPkts);
    outChunks.push(muxed as BlobPart);
  }
  return outChunks;
}
