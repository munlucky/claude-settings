import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;

const W = 1600;
const H = 900;
const primary = '#2563EB';
const secondary = '#7C3AED';
const tertiary = '#6B7280';
const bg = '#FAFAFA';
const surface = '#FFFFFF';
const success = '#16A34A';
const warning = '#CA8A04';
const error = '#DC2626';
const border = '#E4E4E7';
const soft = '#F4F4F5';
const text = '#18181B';
const muted = '#52525B';

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function t(x, y, content, opts = {}) {
  const {
    size = 28,
    weight = 400,
    fill = text,
    family = 'Inter, "Noto Sans KR", Arial, sans-serif',
    anchor = 'start',
    tracking = 0,
    mono = false,
  } = opts;
  const font = mono ? '"Fira Code", Consolas, "Noto Sans Mono CJK KR", monospace' : family;
  return `<text x="${x}" y="${y}" font-family='${esc(font)}' font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${tracking}">${esc(content)}</text>`;
}

function wrappedText(x, y, lines, opts = {}) {
  const lineHeight = opts.lineHeight ?? 42;
  return lines.map((line, index) => t(x, y + index * lineHeight, line, opts)).join('\n');
}

function rect(x, y, w, h, opts = {}) {
  const {
    fill = surface,
    stroke = border,
    sw = 1,
    rx = 8,
    shadow = false,
  } = opts;
  const filter = shadow ? ' filter="url(#shadow)"' : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${filter}/>`;
}

function badge(x, y, label, opts = {}) {
  const fill = opts.fill ?? '#EFF6FF';
  const color = opts.color ?? primary;
  const w = opts.w ?? Math.max(86, label.length * 18 + 28);
  return [
    rect(x, y, w, 34, { fill, stroke: 'none', rx: 999 }),
    t(x + w / 2, y + 23, label, { size: 14, weight: 700, fill: color, anchor: 'middle', mono: opts.mono }),
  ].join('\n');
}

function arrow(x1, y1, x2, y2, color = primary) {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="3" stroke-linecap="round" marker-end="url(#arrow)"/>`;
}

function base(title, subtitle = '') {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`,
    '<defs>',
    '<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.06"/></filter>',
    `<marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M2,2 L8,5 L2,8 Z" fill="${primary}"/></marker>`,
    '</defs>',
    `<rect width="${W}" height="${H}" fill="${bg}"/>`,
    '<g transform="translate(-130 0)">',
    t(340, 82, title, { size: 42, weight: 800, fill: text, family: '"Plus Jakarta Sans", Inter, "Noto Sans KR", sans-serif' }),
    subtitle ? t(342, 122, subtitle, { size: 18, weight: 500, fill: tertiary }) : '',
  ].join('\n');
}

function end() {
  return '</g>\n</svg>\n';
}

function slide01() {
  const title = 'Moonshot Phase Runner 메인 흐름';
  const parts = [
    base(title, '큰 작업을 phase 단위로 끝까지 진행하는 Claude Code 실행 하네스'),
    badge(340, 158, 'PUBLIC ENTRYPOINT', { w: 190 }),
  ];
  const nodes = [
    ['1', '요청', ['큰 작업은', 'runner로 시작']],
    ['2', 'Plan 찾기', ['active plan', '또는 새 plan']],
    ['3', '상태 생성', ['phase-status', 'yaml 기록']],
    ['4', '실행 루프', ['phase별', 'attempt 반복']],
    ['5', '리뷰·검증', ['evidence 없이는', '완료 불가']],
    ['6', '완료·중단', ['plan 전체', '기준 판단']],
  ];
  nodes.forEach((node, i) => {
    const cardW = 150;
    const x = 340 + i * 206;
    const y = 320;
    parts.push(rect(x, y, cardW, 180, { fill: surface, stroke: border, rx: 12, shadow: true }));
    parts.push(`<circle cx="${x + cardW / 2}" cy="${y + 48}" r="30" fill="#EFF6FF" stroke="${primary}" stroke-width="2"/>`);
    parts.push(t(x + cardW / 2, y + 58, node[0], { size: 28, weight: 800, fill: primary, anchor: 'middle' }));
    parts.push(t(x + cardW / 2, y + 106, node[1], { size: 22, weight: 800, fill: text, anchor: 'middle' }));
    parts.push(wrappedText(x + cardW / 2, y + 142, node[2], { size: 13, weight: 600, fill: muted, lineHeight: 24, anchor: 'middle' }));
    if (i < nodes.length - 1) parts.push(arrow(x + cardW + 14, y + 90, x + 194, y + 90));
  });
  parts.push(rect(340, 640, 1180, 92, { fill: '#F5F3FF', stroke: '#DDD6FE', rx: 12 }));
  parts.push(t(376, 686, '핵심 원칙', { size: 22, weight: 800, fill: secondary }));
  parts.push(t(520, 686, 'phase 하나가 아니라 active plan directory 전체가 실행 경계', { size: 24, weight: 700, fill: text }));
  parts.push(end());
  return { file: '01-overview.svg', title, expected: ['Moonshot Phase Runner 메인 흐름', 'PUBLIC ENTRYPOINT', '요청', 'Plan 찾기', '상태 생성', '실행 루프', '리뷰·검증', '완료·중단', 'phase 하나가 아니라 active plan directory 전체가 실행 경계'], svg: parts.join('\n') };
}

function slide02() {
  const title = '시작: 사용자는 무엇을 입력하나';
  const parts = [base(title, '사용자는 세부 스킬 대신 phase runner를 호출한다')];
  const commands = [
    ['/moonshot-phase-runner', '안전한 plan을 찾고, 없으면 생성 후 실행'],
    ['/moonshot-phase-runner docs/implementation', '지정한 plan directory 실행'],
    ['/moonshot-phase-runner docs/implementation --autonomous', '질문 없이 현재 문서 기준으로 진행'],
  ];
  commands.forEach((cmd, i) => {
    const y = 190 + i * 130;
    const commandSize = cmd[0].length > 48 ? 16 : cmd[0].length > 36 ? 18 : 22;
    parts.push(rect(340, y, 610, 94, { fill: '#18181B', stroke: 'none', rx: 12 }));
    parts.push(t(374, y + 40, cmd[0], { size: commandSize, weight: 600, fill: '#FFFFFF', mono: true }));
    parts.push(t(374, y + 72, cmd[1], { size: 16, weight: 500, fill: '#D4D4D8' }));
  });
  parts.push(rect(340, 606, 610, 86, { fill: '#FFFBEB', stroke: '#FDE68A', rx: 12 }));
  parts.push(t(374, 640, '주의', { size: 20, weight: 800, fill: warning }));
  parts.push(t(444, 640, '계획만 원하면 --prepare-only를 명시', { size: 22, weight: 700, fill: text, mono: false }));
  const flowX = 1040;
  [['요청', 190], ['Plan Directory 결정', 320], ['없으면 moonshot-plan-writer', 450], ['준비 후 실행 시작', 580]].forEach(([label, y], i) => {
    parts.push(rect(flowX, y, 360, 72, { fill: surface, stroke: i === 3 ? primary : border, sw: i === 3 ? 2 : 1, rx: 12, shadow: true }));
    parts.push(t(flowX + 180, y + 45, label, { size: 22, weight: 800, fill: i === 3 ? primary : text, anchor: 'middle' }));
    if (i < 3) parts.push(arrow(flowX + 180, y + 78, flowX + 180, y + 120));
  });
  parts.push(end());
  return { file: '02-start.svg', title, expected: ['시작: 사용자는 무엇을 입력하나', '/moonshot-phase-runner', 'docs/implementation', '--autonomous', '--prepare-only', 'Plan Directory 결정', 'moonshot-plan-writer', '준비 후 실행 시작'], svg: parts.join('\n') };
}

function slide03() {
  const title = 'Phase Runner가 만드는 실행 아티팩트';
  const parts = [base(title, '대화 요약보다 파일 기반 상태와 증거가 우선이다')];
  parts.push(rect(340, 170, 1180, 82, { fill: '#EFF6FF', stroke: '#BFDBFE', rx: 12 }));
  parts.push(t(380, 220, '.claude/docs/phase-status.yaml', { size: 28, weight: 800, fill: primary, mono: true }));
  parts.push(t(860, 220, '전체 phase 진행 상태판', { size: 26, weight: 800, fill: text }));
  parts.push(rect(500, 330, 860, 90, { fill: '#18181B', stroke: 'none', rx: 12 }));
  parts.push(t(540, 386, 'docs/implementation/execution/01-phase/', { size: 28, weight: 700, fill: '#FFFFFF', mono: true }));
  const cards = [
    ['SPRINT_CONTRACT.md', '이번 phase의 목표·범위·통과기준', primary],
    ['QA_REPORT.md', '검증 결과와 다음 경로', success],
    ['HANDOFF.md', '중단·재개 상태', warning],
    ['SCORECARD.md', '점수 기반 완료 판단', secondary],
  ];
  cards.forEach((card, i) => {
    const x = 340 + (i % 2) * 620;
    const y = 500 + Math.floor(i / 2) * 130;
    parts.push(rect(x, y, 560, 96, { fill: surface, stroke: border, rx: 12, shadow: true }));
    parts.push(badge(x + 28, y + 24, card[0], { fill: '#F4F4F5', color: card[2], w: 230, mono: true }));
    parts.push(t(x + 282, y + 58, card[1], { size: 18, weight: 700, fill: text }));
  });
  parts.push(end());
  return { file: '03-artifacts.svg', title, expected: ['Phase Runner가 만드는 실행 아티팩트', 'phase-status.yaml', 'SPRINT_CONTRACT.md', 'QA_REPORT.md', 'HANDOFF.md', 'SCORECARD.md', '목표·범위·통과기준', '검증 결과와 다음 경로'], svg: parts.join('\n') };
}

function slide04() {
  const title = '각 Phase 안에서 도는 루프';
  const parts = [base(title, '한 phase는 구현만 하는 단위가 아니라 리뷰와 검증까지 포함한다')];
  const cx = 930;
  const cy = 420;
  const radius = 230;
  const stages = [
    ['Ready / Isolate', '계약·컨텍스트·검증 기준 확인', 930, 190],
    ['Execute', '구현·테스트·수정', 1200, 350],
    ['Review', '코드·보안·UI 품질 검토', 1160, 610],
    ['Verify', '빌드·테스트·브라우저 증거', 700, 610],
    ['Finish / Handoff', '문서·로그·다음 경로 기록', 660, 350],
  ];
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#DBEAFE" stroke-width="24"/>`);
  stages.forEach(([label, sub, x, y], i) => {
    const cardW = 320;
    parts.push(rect(x - cardW / 2, y - 48, cardW, 96, { fill: surface, stroke: i === 1 ? primary : border, sw: i === 1 ? 2 : 1, rx: 12, shadow: true }));
    parts.push(t(x, y - 8, label, { size: 22, weight: 800, fill: i === 1 ? primary : text, anchor: 'middle' }));
    parts.push(t(x, y + 24, sub, { size: 15, weight: 600, fill: muted, anchor: 'middle' }));
  });
  parts.push(t(cx, cy + 48, '통과하면 다음 Phase', { size: 28, weight: 800, fill: secondary, anchor: 'middle' }));
  parts.push(t(cx, cy + 96, '실패하면 Retry', { size: 28, weight: 800, fill: warning, anchor: 'middle' }));
  parts.push(rect(340, 746, 1180, 58, { fill: '#EFF6FF', stroke: '#BFDBFE', rx: 12 }));
  parts.push(t(930, 784, 'ready/isolate → execute → review → verify → finish/handoff', { size: 24, weight: 800, fill: primary, anchor: 'middle', mono: true }));
  parts.push(end());
  return { file: '04-phase-loop.svg', title, expected: ['각 Phase 안에서 도는 루프', 'Ready / Isolate', 'Execute', 'Review', 'Verify', 'Finish / Handoff', '통과하면 다음 Phase', '실패하면 Retry'], svg: parts.join('\n') };
}

function slide05() {
  const title = '언제 끝나고, 언제 계속하나';
  const parts = [base(title, '종료 조건은 milestone이 아니라 plan-directory 완료 여부로 판단한다')];
  parts.push(rect(340, 180, 550, 500, { fill: '#F0FDF4', stroke: '#BBF7D0', rx: 16, shadow: true }));
  parts.push(t(386, 240, '끝나는 조건', { size: 34, weight: 800, fill: success }));
  ['모든 actionable phase 완료', '리뷰·검증·closeout 일관', '명시적 blocker 또는 사용자 중단'].forEach((line, i) => {
    const y = 320 + i * 100;
    parts.push(`<circle cx="402" cy="${y - 10}" r="18" fill="${success}"/>`);
    parts.push(t(402, y - 2, '✓', { size: 22, weight: 800, fill: '#FFFFFF', anchor: 'middle' }));
    parts.push(t(444, y, line, { size: 26, weight: 800, fill: text }));
  });
  parts.push(rect(970, 180, 550, 500, { fill: '#FEF2F2', stroke: '#FECACA', rx: 16, shadow: true }));
  parts.push(t(1016, 240, '끝나면 안 되는 조건', { size: 34, weight: 800, fill: error }));
  ['phase 하나 완료', 'QA_REPORT만 갱신', 'HANDOFF만 작성', '체크포인트 도달', '부분 구현 완료'].forEach((line, i) => {
    const y = 312 + i * 70;
    parts.push(`<circle cx="1032" cy="${y - 10}" r="16" fill="${error}"/>`);
    parts.push(t(1032, y - 2, '×', { size: 22, weight: 800, fill: '#FFFFFF', anchor: 'middle' }));
    parts.push(t(1070, y, line, { size: 24, weight: 800, fill: text }));
  });
  parts.push(rect(340, 730, 1180, 72, { fill: '#EFF6FF', stroke: '#BFDBFE', rx: 12 }));
  parts.push(t(930, 776, '기본 실행 경계 = phase 하나가 아니라 Plan Directory 전체', { size: 28, weight: 800, fill: primary, anchor: 'middle' }));
  parts.push(end());
  return { file: '05-exit-rules.svg', title, expected: ['언제 끝나고, 언제 계속하나', '끝나는 조건', '모든 actionable phase 완료', '끝나면 안 되는 조건', 'phase 하나 완료', 'QA_REPORT만 갱신', 'Plan Directory 전체'], svg: parts.join('\n') };
}

function slide06() {
  const title = '사용자에게 보이는 상태판';
  const parts = [base(title, '진짜 진행 상태는 대화 요약이 아니라 산출물로 확인한다')];
  const panels = [
    ['phase-status.yaml', 'phase 진행 상태', 'pending / running / done', primary],
    ['SPRINT_CONTRACT', '목표와 범위', '통과기준을 먼저 고정', secondary],
    ['QA_REPORT', '검증 결과', 'passed / failed / next path', success],
    ['HANDOFF', '재개 정보', 'resume notes / blockers', warning],
    ['SCORECARD', '완료 판단', 'score / unmet items', error],
  ];
  panels.forEach((panel, i) => {
    const x = i < 3 ? 340 + (i % 3) * 390 : 340 + (i - 3) * 610;
    const y = i < 3 ? 190 : 460;
    const w = i < 3 ? 340 : 535;
    parts.push(rect(x, y, w, 190, { fill: surface, stroke: border, rx: 12, shadow: true }));
    parts.push(rect(x, y, 8, 190, { fill: panel[3], stroke: 'none', rx: 8 }));
    parts.push(t(x + 34, y + 46, panel[0], { size: 15, weight: 800, fill: panel[3], mono: true }));
    parts.push(t(x + 34, y + 96, panel[1], { size: 24, weight: 800, fill: text }));
    parts.push(t(x + 34, y + 132, panel[2], { size: 18, weight: 700, fill: muted, mono: panel[2].includes('/') }));
    parts.push(rect(x + 34, y + 154, w - 68, 1, { fill: border, stroke: 'none', rx: 0 }));
  });
  parts.push(rect(340, 730, 1180, 72, { fill: '#18181B', stroke: 'none', rx: 12 }));
  parts.push(t(930, 776, '보고서보다 상태 파일과 검증 증거가 우선', { size: 28, weight: 800, fill: '#FFFFFF', anchor: 'middle' }));
  parts.push(end());
  return { file: '06-status-board.svg', title, expected: ['사용자에게 보이는 상태판', 'phase-status.yaml', 'SPRINT_CONTRACT', 'QA_REPORT', 'HANDOFF', 'SCORECARD', '보고서보다 상태 파일과 검증 증거가 우선'], svg: parts.join('\n') };
}

const slides = [slide01(), slide02(), slide03(), slide04(), slide05(), slide06()];

mkdirSync(outDir, { recursive: true });

const report = [];
for (const slide of slides) {
  const path = join(outDir, slide.file);
  writeFileSync(path, slide.svg, 'utf8');
  const written = readFileSync(path, 'utf8');
  const missing = slide.expected.filter((label) => !written.includes(esc(label)) && !written.includes(label));
  const hasReplacementChar = written.includes('�');
  const hasMojibake = /ì|í|ë|ê|Ã|Â/.test(written);
  report.push({
    file: slide.file,
    title: slide.title,
    expectedTextCount: slide.expected.length,
    missing,
    hasReplacementChar,
    hasMojibake,
    pass: missing.length === 0 && !hasReplacementChar && !hasMojibake,
  });
}

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Moonshot Phase Runner Visuals</title>
  <style>
    body { margin: 0; background: ${bg}; font-family: Inter, "Noto Sans KR", Arial, sans-serif; color: ${text}; }
    main { max-width: 1280px; margin: 0 auto; padding: 32px; }
    h1 { font-family: "Plus Jakarta Sans", Inter, sans-serif; font-size: 32px; }
    figure { margin: 0 0 32px; background: white; border: 1px solid ${border}; border-radius: 8px; padding: 16px; }
    img { width: 100%; display: block; }
    figcaption { margin-top: 12px; color: ${tertiary}; font-size: 14px; }
  </style>
</head>
<body>
<main>
  <h1>Moonshot Phase Runner 사용자 워크플로우</h1>
  ${slides.map((slide, index) => `<figure><img src="${slide.file}" alt="${esc(slide.title)}"><figcaption>${index + 1}. ${esc(slide.title)}</figcaption></figure>`).join('\n  ')}
</main>
</body>
</html>
`;

writeFileSync(join(outDir, 'index.html'), html, 'utf8');
writeFileSync(join(outDir, 'text-verification-report.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), slides: report, pass: report.every((item) => item.pass) }, null, 2)}\n`, 'utf8');

if (!report.every((item) => item.pass)) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Generated ${slides.length} SVG slides in ${outDir}`);
console.log('Text verification passed.');
