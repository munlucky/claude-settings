#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const repoRoot = process.cwd();
const artifactsRoot = path.join(".claude", "browser-artifacts");
const diffsRootDefault = path.join(artifactsRoot, "visual-diffs");

function defaultRunId(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}`;
}

function usage() {
  process.stdout.write(
    [
      "Usage:",
      "  node .claude/scripts/visual-diff-runner.mjs compare --current <path> --baseline <path> [--output <path>] [--diff-output <path>] [--max-diff-ratio <n>] [--flow <name>] [--breakpoint <name>] [--required]",
      "  node .claude/scripts/visual-diff-runner.mjs self-test --case=identical|changed|missing-baseline",
      "",
      "Writes .claude/visual-diff-verdict-<runId>.json unless --output is provided."
    ].join("\n") + "\n"
  );
}

function parseArgs(argv) {
  const args = {
    command: "",
    caseName: "identical",
    current: "",
    baseline: "",
    output: "",
    diffOutput: "",
    maxDiffRatio: 0.01,
    flowName: "",
    breakpoint: "",
    required: false,
    runId: defaultRunId("visual-diff")
  };

  if (argv[0] && !argv[0].startsWith("-")) args.command = argv.shift();
  while (argv.length > 0) {
    const item = argv.shift();
    if (item === "--case") args.caseName = argv.shift() || args.caseName;
    else if (item?.startsWith("--case=")) args.caseName = item.slice("--case=".length);
    else if (item === "--current") args.current = argv.shift() || "";
    else if (item?.startsWith("--current=")) args.current = item.slice("--current=".length);
    else if (item === "--baseline") args.baseline = argv.shift() || "";
    else if (item?.startsWith("--baseline=")) args.baseline = item.slice("--baseline=".length);
    else if (item === "--output") args.output = argv.shift() || "";
    else if (item?.startsWith("--output=")) args.output = item.slice("--output=".length);
    else if (item === "--diff-output") args.diffOutput = argv.shift() || "";
    else if (item?.startsWith("--diff-output=")) args.diffOutput = item.slice("--diff-output=".length);
    else if (item === "--max-diff-ratio") args.maxDiffRatio = Number(argv.shift() || args.maxDiffRatio);
    else if (item?.startsWith("--max-diff-ratio=")) args.maxDiffRatio = Number(item.slice("--max-diff-ratio=".length));
    else if (item === "--flow") args.flowName = argv.shift() || "";
    else if (item?.startsWith("--flow=")) args.flowName = item.slice("--flow=".length);
    else if (item === "--breakpoint") args.breakpoint = argv.shift() || "";
    else if (item?.startsWith("--breakpoint=")) args.breakpoint = item.slice("--breakpoint=".length);
    else if (item === "--required") args.required = true;
    else if (item === "--run-id") args.runId = argv.shift() || args.runId;
    else if (item?.startsWith("--run-id=")) args.runId = item.slice("--run-id=".length);
    else if (item === "-h" || item === "--help") args.command = "help";
    else throw new Error(`Unknown argument: ${item}`);
  }
  if (!args.output) args.output = path.join(".claude", `visual-diff-verdict-${args.runId}.json`);
  return args;
}

function resolvePath(filePath) {
  return path.resolve(repoRoot, filePath);
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(resolvePath(filePath)), { recursive: true });
  fs.writeFileSync(resolvePath(filePath), `${JSON.stringify(payload, null, 2)}\n`);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng({ width, height, rgba }) {
  const scanlineLength = width * 4;
  const raw = Buffer.alloc((scanlineLength + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (scanlineLength + 1);
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, y * scanlineLength, (y + 1) * scanlineLength);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND")
  ]);
}

function bytesPerPixel(colorType) {
  if (colorType === 6) return 4;
  if (colorType === 2) return 3;
  throw new Error(`unsupported_png_color_type:${colorType}`);
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upperLeft;
}

function decodePng(filePath) {
  const buffer = fs.readFileSync(resolvePath(filePath));
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error(`not_png:${filePath}`);
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`unsupported_png_bit_depth:${bitDepth}`);
  if (interlace !== 0) throw new Error("unsupported_png_interlace");
  const bpp = bytesPerPixel(colorType);
  const source = zlib.inflateSync(Buffer.concat(idatParts));
  const rowLength = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowLength);
  for (let y = 0; y < height; y += 1) {
    const filter = source[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.from(source.subarray(sourceOffset, sourceOffset + rowLength));
    sourceOffset += rowLength;
    for (let index = 0; index < row.length; index += 1) {
      const left = index >= bpp ? row[index - bpp] : 0;
      const up = previous[index] || 0;
      const upperLeft = index >= bpp ? previous[index - bpp] || 0 : 0;
      if (filter === 1) row[index] = (row[index] + left) & 0xff;
      else if (filter === 2) row[index] = (row[index] + up) & 0xff;
      else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[index] = (row[index] + paeth(left, up, upperLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`unsupported_png_filter:${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * bpp;
      const dst = (y * width + x) * 4;
      rgba[dst] = row[src];
      rgba[dst + 1] = row[src + 1];
      rgba[dst + 2] = row[src + 2];
      rgba[dst + 3] = colorType === 6 ? row[src + 3] : 255;
    }
    previous = row;
  }
  return { width, height, rgba };
}

function defaultDiffOutput(args) {
  const stem = path.basename(args.baseline || args.current || args.runId).replace(/\.png$/i, "");
  return path.join(diffsRootDefault, `${stem}.diff.png`);
}

function compareImages(args) {
  const setupGaps = [];
  const failures = [];
  if (!args.current || !fs.existsSync(resolvePath(args.current))) setupGaps.push(`missing_current_screenshot:${args.current}`);
  if (!args.baseline || !fs.existsSync(resolvePath(args.baseline))) setupGaps.push(`missing_baseline:${args.baseline}`);
  if (setupGaps.length > 0) {
    return {
      runId: args.runId,
      status: "setup_gap",
      flowName: args.flowName,
      currentScreenshot: args.current,
      baselineScreenshot: args.baseline,
      diffImage: "",
      maxDiffRatio: args.maxDiffRatio,
      actualDiffRatio: null,
      changedPixels: 0,
      totalPixels: 0,
      breakpoint: args.breakpoint,
      setupGaps,
      failures
    };
  }

  const current = decodePng(args.current);
  const baseline = decodePng(args.baseline);
  const totalPixels = Math.max(current.width * current.height, baseline.width * baseline.height);
  const diff = Buffer.alloc(current.width * current.height * 4);
  let changedPixels = 0;

  if (current.width !== baseline.width || current.height !== baseline.height) {
    changedPixels = totalPixels;
    failures.push(`dimension_mismatch:${current.width}x${current.height}:${baseline.width}x${baseline.height}`);
  } else {
    for (let pixel = 0; pixel < current.width * current.height; pixel += 1) {
      const offset = pixel * 4;
      const changed =
        current.rgba[offset] !== baseline.rgba[offset] ||
        current.rgba[offset + 1] !== baseline.rgba[offset + 1] ||
        current.rgba[offset + 2] !== baseline.rgba[offset + 2] ||
        current.rgba[offset + 3] !== baseline.rgba[offset + 3];
      if (changed) {
        changedPixels += 1;
        diff[offset] = 255;
        diff[offset + 1] = 0;
        diff[offset + 2] = 96;
        diff[offset + 3] = 255;
      } else {
        diff[offset] = Math.floor(current.rgba[offset] * 0.35 + 255 * 0.65);
        diff[offset + 1] = Math.floor(current.rgba[offset + 1] * 0.35 + 255 * 0.65);
        diff[offset + 2] = Math.floor(current.rgba[offset + 2] * 0.35 + 255 * 0.65);
        diff[offset + 3] = 255;
      }
    }
  }

  const actualDiffRatio = totalPixels === 0 ? 0 : changedPixels / totalPixels;
  const status = actualDiffRatio <= args.maxDiffRatio && failures.length === 0 ? "passed" : "failed";
  if (status === "failed" && failures.length === 0) failures.push(`diff_ratio_exceeded:${actualDiffRatio}:${args.maxDiffRatio}`);
  const diffImage = args.diffOutput || defaultDiffOutput(args);
  fs.mkdirSync(path.dirname(resolvePath(diffImage)), { recursive: true });
  const diffPayload =
    current.width === baseline.width && current.height === baseline.height
      ? { width: current.width, height: current.height, rgba: diff }
      : { width: 1, height: 1, rgba: Buffer.from([255, 0, 96, 255]) };
  fs.writeFileSync(resolvePath(diffImage), encodePng(diffPayload));

  return {
    runId: args.runId,
    status,
    flowName: args.flowName,
    currentScreenshot: args.current,
    baselineScreenshot: args.baseline,
    diffImage,
    maxDiffRatio: args.maxDiffRatio,
    actualDiffRatio,
    changedPixels,
    totalPixels,
    breakpoint: args.breakpoint,
    setupGaps,
    failures
  };
}

function makeSelfTestImages(caseName, runId) {
  const baseDir = path.join(artifactsRoot, "visual-self-test", runId);
  fs.mkdirSync(resolvePath(baseDir), { recursive: true });
  const baseline = path.join(baseDir, "baseline.png");
  const current = path.join(baseDir, "current.png");
  const missingBaseline = path.join(baseDir, "missing.png");
  const width = 4;
  const height = 4;
  const base = Buffer.alloc(width * height * 4, 255);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    base[offset] = 24;
    base[offset + 1] = 96;
    base[offset + 2] = 160;
    base[offset + 3] = 255;
  }
  const changed = Buffer.from(base);
  changed[0] = 240;
  changed[1] = 40;
  changed[2] = 80;
  fs.writeFileSync(resolvePath(baseline), encodePng({ width, height, rgba: base }));
  fs.writeFileSync(resolvePath(current), encodePng({ width, height, rgba: caseName === "changed" ? changed : base }));
  return {
    current,
    baseline: caseName === "missing-baseline" ? missingBaseline : baseline,
    diffOutput: path.join(diffsRootDefault, `${runId}-${caseName}.diff.png`)
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help" || !args.command) {
    usage();
    return 0;
  }
  if (args.command === "self-test") {
    if (!["identical", "changed", "missing-baseline"].includes(args.caseName)) {
      throw new Error(`unsupported_self_test_case:${args.caseName}`);
    }
    args.runId = `${args.runId}-${args.caseName}`;
    const files = makeSelfTestImages(args.caseName, args.runId);
    args.current = files.current;
    args.baseline = files.baseline;
    args.diffOutput = files.diffOutput;
    args.flowName = `self-test-${args.caseName}`;
    args.maxDiffRatio = args.caseName === "changed" ? 0 : args.maxDiffRatio;
  } else if (args.command !== "compare") {
    throw new Error(`Unknown command: ${args.command}`);
  }

  const verdict = compareImages(args);
  writeJson(args.output, verdict);
  process.stdout.write(`${args.output}\n`);
  if (verdict.status === "passed") return 0;
  if (verdict.status === "setup_gap") return 64;
  return 1;
}

try {
  process.exit(main());
} catch (error) {
  const args = parseArgs(process.argv.slice(2).filter((item) => item !== "--help" && item !== "-h"));
  const payload = {
    runId: args.runId,
    status: "failed",
    flowName: args.flowName,
    currentScreenshot: args.current,
    baselineScreenshot: args.baseline,
    diffImage: "",
    maxDiffRatio: args.maxDiffRatio,
    actualDiffRatio: null,
    changedPixels: 0,
    totalPixels: 0,
    breakpoint: args.breakpoint,
    setupGaps: [],
    failures: [String(error?.message || error)]
  };
  writeJson(args.output, payload);
  process.stderr.write(`${String(error?.message || error)}\n`);
  process.stdout.write(`${args.output}\n`);
  process.exit(1);
}
