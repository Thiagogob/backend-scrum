'use strict';

const PDFDocument = require('pdfkit');

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  navy:      '#1e3a5f',
  blue:      '#2563eb',
  blueTint:  '#eff6ff',
  slate:     '#334155',
  muted:     '#64748b',
  white:     '#ffffff',
  offWhite:  '#f8fafc',
  border:    '#e2e8f0',
  text:      '#1a202c',
};

// ─── Date helper ────────────────────────────────────────────────────────────
function fmtDate(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.length > 10 ? s.slice(0, 10) : s;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CSV
// ═══════════════════════════════════════════════════════════════════════════

function escapeCsv(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a UTF-8 BOM CSV from an array of blocks.
 * Each block has an optional `titulo` and required `linhas` (array of arrays).
 */
function gerarCsv(blocos) {
  const BOM = '\uFEFF';
  const parts = [];
  for (const bloco of blocos) {
    if (bloco.titulo) parts.push(escapeCsv(bloco.titulo));
    for (const row of bloco.linhas) parts.push(row.map(escapeCsv).join(','));
    parts.push('');
  }
  return BOM + parts.join('\r\n');
}

// ─── CSV per report ──────────────────────────────────────────────────────────

function csvDiario({ data, resumo, reservas }) {
  return gerarCsv([
    {
      titulo: `Relatório Diário — ${fmtDate(data)}`,
      linhas: [
        ['Total Reservas', 'Ativas', 'Concluídas', 'Canceladas', 'Salas Utilizadas'],
        [resumo.total_reservas, resumo.ativas, resumo.concluidas, resumo.canceladas, resumo.salas_utilizadas],
      ],
    },
    {
      titulo: 'Reservas',
      linhas: [
        ['Sala', 'Bloco', 'Tipo', 'Turno', 'Aula', 'Início', 'Fim', 'Status', 'Professor', 'Disciplina'],
        ...reservas.map(r => [
          r.nome_numero, r.bloco, r.tipo_sala, r.turno, r.aula_numero,
          r.hora_inicio, r.hora_fim, r.status, r.usuario_nome, r.disciplina || '',
        ]),
      ],
    },
  ]);
}

function csvSemanal({ data_inicio, data_fim, resumo, por_dia, reservas }) {
  return gerarCsv([
    {
      titulo: `Relatório Semanal — ${fmtDate(data_inicio)} a ${fmtDate(data_fim)}`,
      linhas: [
        ['Total Reservas', 'Canceladas', 'Salas Utilizadas'],
        [resumo.total_reservas, resumo.canceladas, resumo.salas_utilizadas],
      ],
    },
    {
      titulo: 'Por Dia',
      linhas: [
        ['Data', 'Total Reservas', 'Canceladas', 'Salas Utilizadas'],
        ...por_dia.map(d => [fmtDate(d.data), d.total_reservas, d.canceladas, d.salas_utilizadas]),
      ],
    },
    {
      titulo: 'Reservas',
      linhas: [
        ['Data', 'Sala', 'Bloco', 'Tipo', 'Turno', 'Aula', 'Início', 'Fim', 'Status', 'Professor', 'Disciplina'],
        ...reservas.map(r => [
          fmtDate(r.data), r.nome_numero, r.bloco, r.tipo_sala, r.turno, r.aula_numero,
          r.hora_inicio, r.hora_fim, r.status, r.usuario_nome, r.disciplina || '',
        ]),
      ],
    },
  ]);
}

function csvMensal({ nome_mes, ano, resumo, por_sala, por_dia }) {
  return gerarCsv([
    {
      titulo: `Relatório Mensal — ${nome_mes} / ${ano}`,
      linhas: [
        ['Total Reservas', 'Canceladas', 'Salas Utilizadas', 'Professores Ativos'],
        [resumo.total_reservas, resumo.canceladas, resumo.salas_utilizadas, resumo.professores_ativos],
      ],
    },
    {
      titulo: 'Ranking de Salas',
      linhas: [
        ['Sala', 'Bloco', 'Tipo', 'Total Reservas'],
        ...por_sala.map(s => [s.nome_numero, s.bloco, s.tipo_sala, s.total_reservas]),
      ],
    },
    {
      titulo: 'Por Dia',
      linhas: [
        ['Data', 'Total Reservas', 'Canceladas', 'Salas Utilizadas'],
        ...por_dia.map(d => [fmtDate(d.data), d.total_reservas, d.canceladas, d.salas_utilizadas]),
      ],
    },
  ]);
}

function csvSemestral({ semestre, ano, periodo, resumo, por_mes }) {
  return gerarCsv([
    {
      titulo: `Relatório Semestral — ${semestre}º Semestre / ${ano}`,
      linhas: [
        ['Total Reservas', 'Canceladas', 'Salas Utilizadas'],
        [resumo.total_reservas, resumo.canceladas, resumo.salas_utilizadas],
      ],
    },
    {
      titulo: 'Por Mês',
      linhas: [
        ['Mês', 'Nome', 'Total Reservas', 'Canceladas', 'Salas Utilizadas'],
        ...por_mes.map(m => [m.mes, m.nome_mes, m.total_reservas, m.canceladas, m.salas_utilizadas]),
      ],
    },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PDF — primitives
// ═══════════════════════════════════════════════════════════════════════════

const ML = 40;  // left / right margin
const CW = 515; // content width (A4 595 − 80)

function newPdf() {
  return new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 40, bottom: 50, left: ML, right: ML },
    autoFirstPage: false,
  });
}

/** Draws the top header band and returns the y position directly below it. */
function pdfHeader(doc, titulo, subtitulo) {
  // Navy band
  doc.fillColor(C.navy).rect(ML, 40, CW, 58).fill();
  // Blue left accent
  doc.fillColor(C.blue).rect(ML, 40, 4, 58).fill();
  // System name (small caps style)
  doc.fillColor('#bfdbfe').fontSize(7.5).font('Helvetica')
    .text('SISTEMA DE RESERVA DE SALAS E LABORATÓRIOS', ML + 14, 46, { width: CW - 18 });
  // Report title
  doc.fillColor(C.white).fontSize(17).font('Helvetica-Bold')
    .text(titulo, ML + 14, 58, { width: CW - 18 });
  // Slate period bar
  doc.fillColor(C.slate).rect(ML, 98, CW, 22).fill();
  doc.fillColor('#94a3b8').fontSize(8.5).font('Helvetica')
    .text(subtitulo, ML + 14, 103, { width: CW - 18 });
  return 132;
}

/** Draws summary metric boxes and returns y below them. */
function pdfMetrics(doc, y, metrics) {
  const n = metrics.length;
  const gap = 8;
  const boxW = Math.floor((CW - gap * (n - 1)) / n);
  const boxH = 54;

  metrics.forEach((m, i) => {
    const x = ML + i * (boxW + gap);
    doc.fillColor(C.blueTint).roundedRect(x, y, boxW, boxH, 5).fill();
    doc.fillColor(C.blue).rect(x, y, 3, boxH).fill();
    doc.fillColor(C.muted).fontSize(7).font('Helvetica-Bold')
      .text(m.label.toUpperCase(), x + 10, y + 9, { width: boxW - 16 });
    doc.fillColor(C.navy).fontSize(21).font('Helvetica-Bold')
      .text(String(m.value), x + 10, y + 21, { width: boxW - 16 });
  });

  return y + boxH + 16;
}

/** Draws a section title with a blue underline and returns y below it. */
function pdfSection(doc, y, text) {
  // Ensure there's enough room
  if (y + 40 > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    y = 40;
  }
  doc.fillColor(C.navy).fontSize(10).font('Helvetica-Bold').text(text, ML, y);
  doc.fillColor(C.blue).rect(ML, y + 14, CW, 1).fill();
  return y + 22;
}

/**
 * Draws a table. Returns y after the last row.
 * cols: [{ label, width, align? }]
 * rows: any[][] — values in column order
 */
function pdfTable(doc, y, cols, rows) {
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const hH = 21;
  const rH = 19;

  function drawHeader(atY) {
    doc.fillColor(C.navy).rect(ML, atY, totalW, hH).fill();
    let cx = ML;
    doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold');
    for (const col of cols) {
      doc.text(col.label, cx + 5, atY + 6, {
        width: col.width - 10, lineBreak: false, align: col.align || 'left',
      });
      cx += col.width;
    }
    return atY + hH;
  }

  y = drawHeader(y);

  for (let i = 0; i < rows.length; i++) {
    if (y + rH > doc.page.height - doc.page.margins.bottom - 10) {
      doc.addPage();
      y = drawHeader(40);
    }
    if (i % 2 === 1) {
      doc.fillColor(C.offWhite).rect(ML, y, totalW, rH).fill();
    }
    doc.strokeColor(C.border).lineWidth(0.3)
      .moveTo(ML, y + rH).lineTo(ML + totalW, y + rH).stroke();

    let cx = ML;
    doc.fillColor(C.text).fontSize(8).font('Helvetica');
    for (let j = 0; j < cols.length; j++) {
      const v = rows[i][j];
      const txt = v !== null && v !== undefined ? String(v) : '—';
      doc.text(txt, cx + 5, y + 4, {
        width: cols[j].width - 10, lineBreak: false, align: cols[j].align || 'left',
      });
      cx += cols[j].width;
    }
    y += rH;
  }

  return y + 8;
}

/** Stamps footer (timestamp + page numbers) on every buffered page. */
function pdfFooter(doc) {
  const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const fy = doc.page.height - 28;
    doc.fillColor(C.border).rect(ML, fy - 6, CW, 0.5).fill();
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
      .text(`Gerado em ${geradoEm}`, ML, fy, { width: CW })
      .text(`Página ${i + 1} de ${range.count}`, ML, fy, { width: CW, align: 'right' });
  }
}

// ─── PDF per report ──────────────────────────────────────────────────────────

function pdfDiario(res, { data, resumo, reservas }) {
  const doc = newPdf();
  doc.pipe(res);
  doc.addPage();

  let y = pdfHeader(doc, 'Relatório Diário', `Data: ${fmtDate(data)}`);
  y += 14;

  y = pdfMetrics(doc, y, [
    { label: 'Total Reservas',   value: resumo.total_reservas },
    { label: 'Ativas',           value: resumo.ativas },
    { label: 'Concluídas',       value: resumo.concluidas },
    { label: 'Canceladas',       value: resumo.canceladas },
    { label: 'Salas Utilizadas', value: resumo.salas_utilizadas },
  ]);

  y = pdfSection(doc, y, 'Reservas do Dia');
  pdfTable(doc, y, [
    { label: 'Sala',       width: 55 },
    { label: 'Bloco',      width: 65 },
    { label: 'Turno',      width: 60 },
    { label: 'Aula',       width: 30, align: 'center' },
    { label: 'Início',     width: 38, align: 'center' },
    { label: 'Fim',        width: 38, align: 'center' },
    { label: 'Status',     width: 57 },
    { label: 'Professor',  width: 100 },
    { label: 'Disciplina', width: 72 },
  ], reservas.map(r => [
    r.nome_numero, r.bloco, r.turno, r.aula_numero,
    r.hora_inicio, r.hora_fim, r.status, r.usuario_nome, r.disciplina || '—',
  ]));

  pdfFooter(doc);
  doc.end();
}

function pdfSemanal(res, { data_inicio, data_fim, resumo, por_dia, reservas }) {
  const doc = newPdf();
  doc.pipe(res);
  doc.addPage();

  let y = pdfHeader(
    doc,
    'Relatório Semanal',
    `Período: ${fmtDate(data_inicio)} a ${fmtDate(data_fim)}`
  );
  y += 14;

  y = pdfMetrics(doc, y, [
    { label: 'Total Reservas',   value: resumo.total_reservas },
    { label: 'Canceladas',       value: resumo.canceladas },
    { label: 'Salas Utilizadas', value: resumo.salas_utilizadas },
  ]);

  y = pdfSection(doc, y, 'Ocupação por Dia');
  y = pdfTable(doc, y, [
    { label: 'Data',             width: 120 },
    { label: 'Total Reservas',   width: 135, align: 'center' },
    { label: 'Canceladas',       width: 125, align: 'center' },
    { label: 'Salas Utilizadas', width: 135, align: 'center' },
  ], por_dia.map(d => [fmtDate(d.data), d.total_reservas, d.canceladas, d.salas_utilizadas]));

  y += 6;
  y = pdfSection(doc, y, 'Reservas do Período');
  pdfTable(doc, y, [
    { label: 'Data',      width: 68 },
    { label: 'Sala',      width: 52 },
    { label: 'Bloco',     width: 62 },
    { label: 'Turno',     width: 58 },
    { label: 'Aula',      width: 28, align: 'center' },
    { label: 'Início',    width: 36, align: 'center' },
    { label: 'Fim',       width: 36, align: 'center' },
    { label: 'Status',    width: 52 },
    { label: 'Professor', width: 123 },
  ], reservas.map(r => [
    fmtDate(r.data), r.nome_numero, r.bloco, r.turno, r.aula_numero,
    r.hora_inicio, r.hora_fim, r.status, r.usuario_nome,
  ]));

  pdfFooter(doc);
  doc.end();
}

function pdfMensal(res, { nome_mes, ano, resumo, por_sala, por_dia }) {
  const doc = newPdf();
  doc.pipe(res);
  doc.addPage();

  let y = pdfHeader(doc, 'Relatório Mensal', `${nome_mes} / ${ano}`);
  y += 14;

  y = pdfMetrics(doc, y, [
    { label: 'Total Reservas',     value: resumo.total_reservas },
    { label: 'Canceladas',         value: resumo.canceladas },
    { label: 'Salas Utilizadas',   value: resumo.salas_utilizadas },
    { label: 'Professores Ativos', value: resumo.professores_ativos },
  ]);

  y = pdfSection(doc, y, 'Ranking de Salas');
  y = pdfTable(doc, y, [
    { label: 'Sala',           width: 80 },
    { label: 'Bloco',          width: 135 },
    { label: 'Tipo',           width: 110 },
    { label: 'Total Reservas', width: 190, align: 'center' },
  ], por_sala.map(s => [s.nome_numero, s.bloco, s.tipo_sala, s.total_reservas]));

  y += 6;
  y = pdfSection(doc, y, 'Reservas por Dia');
  pdfTable(doc, y, [
    { label: 'Data',             width: 130 },
    { label: 'Total Reservas',   width: 130, align: 'center' },
    { label: 'Canceladas',       width: 125, align: 'center' },
    { label: 'Salas Utilizadas', width: 130, align: 'center' },
  ], por_dia.map(d => [fmtDate(d.data), d.total_reservas, d.canceladas, d.salas_utilizadas]));

  pdfFooter(doc);
  doc.end();
}

function pdfSemestral(res, { semestre, ano, periodo, resumo, por_mes }) {
  const doc = newPdf();
  doc.pipe(res);
  doc.addPage();

  const label = semestre === 1 ? '1º Semestre' : '2º Semestre';
  let y = pdfHeader(
    doc,
    'Relatório Semestral',
    `${label} / ${ano}   (${fmtDate(periodo.inicio)} a ${fmtDate(periodo.fim)})`
  );
  y += 14;

  y = pdfMetrics(doc, y, [
    { label: 'Total Reservas',   value: resumo.total_reservas },
    { label: 'Canceladas',       value: resumo.canceladas },
    { label: 'Salas Utilizadas', value: resumo.salas_utilizadas },
  ]);

  y = pdfSection(doc, y, 'Utilização por Mês');
  pdfTable(doc, y, [
    { label: 'Mês',              width: 130 },
    { label: 'Total Reservas',   width: 130, align: 'center' },
    { label: 'Canceladas',       width: 130, align: 'center' },
    { label: 'Salas Utilizadas', width: 125, align: 'center' },
  ], por_mes.map(m => [m.nome_mes, m.total_reservas, m.canceladas, m.salas_utilizadas]));

  pdfFooter(doc);
  doc.end();
}

module.exports = {
  csvDiario,
  csvSemanal,
  csvMensal,
  csvSemestral,
  pdfDiario,
  pdfSemanal,
  pdfMensal,
  pdfSemestral,
};
