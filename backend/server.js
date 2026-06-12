const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/db', async (req, res) => {
  try {
    const [config, unidades, usuarios, analises, fornecedores,
           pontos, pontoAnalises, coletas, laudoSeq] = await Promise.all([
      pool.query('SELECT * FROM config LIMIT 1'),
      pool.query('SELECT * FROM unidades ORDER BY id'),
      pool.query('SELECT * FROM usuarios ORDER BY id'),
      pool.query('SELECT * FROM analises ORDER BY id'),
      pool.query('SELECT * FROM fornecedores ORDER BY id'),
      pool.query('SELECT * FROM pontos ORDER BY id'),
      pool.query('SELECT * FROM ponto_analises ORDER BY id'),
      pool.query('SELECT * FROM coletas ORDER BY id'),
      pool.query('SELECT * FROM laudo_seq')
    ]);

    const cfg = config.rows[0] || {};
    const seqObj = {};
    laudoSeq.rows.forEach(r => { seqObj[r.chave] = r.valor; });

    const maxId = coletas.rows.length
      ? Math.max(...coletas.rows.map(c => c.id))
      : 0;

    res.json({
      config: {
        empresa: cfg.empresa || '',
        cnpj: cfg.cnpj || '',
        logo: cfg.logo || '',
        fabricantePadrao: cfg.fabricante_padrao || '',
        metaVR: cfg.meta_vr || 85
      },
      unidades: unidades.rows.map(u => ({ id: u.id, cod: u.cod, nome: u.nome })),
      usuarios: usuarios.rows.map(u => ({
        id: u.id, nome: u.nome, login: u.login, senha: u.senha,
        perfil: u.perfil, unidades: u.unidades || [], assinatura: u.assinatura
      })),
      analises: analises.rows.map(a => ({
        id: a.id, nome: a.nome, unidade: a.unidade,
        ativo: a.ativo, dataDesativacao: a.data_desativacao
      })),
      fornecedores: fornecedores.rows.map(f => ({ id: f.id, nome: f.nome, cnpj: f.cnpj })),
      pontos: pontos.rows.map(p => ({
        id: p.id, num: p.num, nome: p.nome, req: p.req || {},
        vr: p.vr, vrGroup: p.vr_group, ativo: p.ativo, dataDesativacao: p.data_desativacao
      })),
      pontoAnalises: pontoAnalises.rows.map(pa => ({
        pontoId: pa.ponto_id, analiseId: pa.analise_id,
        min: pa.min !== null ? parseFloat(pa.min) : null,
        max: pa.max !== null ? parseFloat(pa.max) : null,
        vr: pa.vr, vrPeso: parseFloat(pa.vr_peso) || 0,
        padraoHistory: pa.padrao_history || []
      })),
      coletas: coletas.rows.map(c => ({
        id: c.id, laudoNum: c.laudo_num, unidadeId: c.unidade_id,
        pontoId: c.ponto_id, data: c.data ? c.data.toISOString().slice(0, 10) : '',
        hora: c.hora ? c.hora.slice(0, 5) : '', tipo: c.tipo,
        lote: c.lote, validade: c.validade, fornId: c.forn_id,
        resp: c.resp, userId: c.user_id, observacao: c.observacao,
        resultados: c.resultados || [],
        excluirIndicadores: c.excluir_indicadores,
        motivoExclusaoIndicadores: c.motivo_exclusao,
        excluidoIndicadoresPor: c.excluido_por,
        excluidoIndicadoresEm: c.excluido_em
      })),
      nextIds: {
        analise: (analises.rows.length ? Math.max(...analises.rows.map(r => r.id)) : 0) + 1,
        ponto: (pontos.rows.length ? Math.max(...pontos.rows.map(r => r.id)) : 0) + 1,
        forn: (fornecedores.rows.length ? Math.max(...fornecedores.rows.map(r => r.id)) : 0) + 1,
        user: (usuarios.rows.length ? Math.max(...usuarios.rows.map(r => r.id)) : 0) + 1,
        coleta: maxId + 1,
        unidade: (unidades.rows.length ? Math.max(...unidades.rows.map(r => r.id)) : 0) + 1
      },
      laudoSeq: seqObj,
      vrPontoOrder: []
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/coletas', async (req, res) => {
  const c = req.body;
  try {
    const existing = await pool.query('SELECT id FROM coletas WHERE id = $1', [c.id]);
    if (existing.rows.length) {
      await pool.query(`
        UPDATE coletas SET laudo_num=$1, data=$2, hora=$3, tipo=$4, lote=$5,
          validade=$6, forn_id=$7, resp=$8, observacao=$9, resultados=$10,
          excluir_indicadores=$11, motivo_exclusao=$12, excluido_por=$13, excluido_em=$14
        WHERE id=$15`,
        [c.laudoNum, c.data, c.hora, c.tipo, c.lote, c.validade, c.fornId,
         c.resp, c.observacao, JSON.stringify(c.resultados),
         c.excluirIndicadores, c.motivoExclusaoIndicadores,
         c.excluidoIndicadoresPor, c.excluidoIndicadoresEm, c.id]);
    } else {
      await pool.query(`
        INSERT INTO coletas (id, laudo_num, unidade_id, ponto_id, data, hora, tipo,
          lote, validade, forn_id, resp, user_id, observacao, resultados,
          excluir_indicadores, motivo_exclusao, excluido_por, excluido_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [c.id, c.laudoNum, c.unidadeId, c.pontoId, c.data, c.hora, c.tipo,
         c.lote, c.validade, c.fornId, c.resp, c.userId, c.observacao,
         JSON.stringify(c.resultados), c.excluirIndicadores,
         c.motivoExclusaoIndicadores, c.excluidoIndicadoresPor, c.excluidoIndicadoresEm]);
    }
    const num = parseInt(c.laudoNum) || 0;
    if (num > 0) {
      await pool.query(`
        INSERT INTO laudo_seq (chave, valor) VALUES ('GLOBAL', $1)
        ON CONFLICT (chave) DO UPDATE SET valor = GREATEST(laudo_seq.valor, $1)`, [num]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analises', async (req, res) => {
  const a = req.body;
  try {
    if (a.id) {
      await pool.query(
        'UPDATE analises SET nome=$1, unidade=$2, ativo=$3, data_desativacao=$4 WHERE id=$5',
        [a.nome, a.unidade, a.ativo, a.dataDesativacao, a.id]);
    } else {
      const r = await pool.query(
        'INSERT INTO analises (nome, unidade, ativo) VALUES ($1,$2,true) RETURNING id',
        [a.nome, a.unidade]);
      a.id = r.rows[0].id;
    }
    res.json({ ok: true, id: a.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pontos', async (req, res) => {
  const p = req.body;
  try {
    let pid;
    if (p.id) {
      await pool.query(
        'UPDATE pontos SET num=$1, nome=$2, req=$3, vr=$4, vr_group=$5, ativo=$6, data_desativacao=$7 WHERE id=$8',
        [p.num, p.nome, JSON.stringify(p.req), p.vr, p.vrGroup, p.ativo, p.dataDesativacao, p.id]);
      pid = p.id;
    } else {
      const r = await pool.query(
        'INSERT INTO pontos (num, nome, req, vr, vr_group, ativo) VALUES ($1,$2,$3,$4,$5,true) RETURNING id',
        [p.num, p.nome, JSON.stringify(p.req), p.vr, p.vrGroup]);
      pid = r.rows[0].id;
    }
    if (p.analises && p.analises.length) {
      for (const pa of p.analises) {
        const exists = await pool.query(
          'SELECT id FROM ponto_analises WHERE ponto_id=$1 AND analise_id=$2', [pid, pa.analiseId]);
        if (exists.rows.length) {
          await pool.query(
            'UPDATE ponto_analises SET min=$1, max=$2, vr=$3, vr_peso=$4, padrao_history=$5 WHERE ponto_id=$6 AND analise_id=$7',
            [pa.min, pa.max, pa.vr, pa.vrPeso, JSON.stringify(pa.padraoHistory), pid, pa.analiseId]);
        } else {
          await pool.query(
            'INSERT INTO ponto_analises (ponto_id, analise_id, min, max, vr, vr_peso, padrao_history) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [pid, pa.analiseId, pa.min, pa.max, pa.vr, pa.vrPeso, JSON.stringify(pa.padraoHistory)]);
        }
      }
    }
    res.json({ ok: true, id: pid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fornecedores', async (req, res) => {
  const f = req.body;
  try {
    if (f.id) {
      await pool.query('UPDATE fornecedores SET nome=$1, cnpj=$2 WHERE id=$3', [f.nome, f.cnpj, f.id]);
    } else {
      const r = await pool.query(
        'INSERT INTO fornecedores (nome, cnpj) VALUES ($1,$2) RETURNING id', [f.nome, f.cnpj]);
      f.id = r.rows[0].id;
    }
    res.json({ ok: true, id: f.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/fornecedores/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM fornecedores WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', async (req, res) => {
  const u = req.body;
  try {
    if (u.id) {
      await pool.query(
        'UPDATE usuarios SET nome=$1, login=$2, senha=$3, perfil=$4, unidades=$5, assinatura=$6 WHERE id=$7',
        [u.nome, u.login, u.senha, u.perfil, u.unidades, u.assinatura, u.id]);
    } else {
      const r = await pool.query(
        'INSERT INTO usuarios (nome, login, senha, perfil, unidades) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [u.nome, u.login, u.senha, u.perfil, u.unidades]);
      u.id = r.rows[0].id;
    }
    res.json({ ok: true, id: u.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', async (req, res) => {
  const c = req.body;
  try {
    await pool.query(
      'UPDATE config SET empresa=$1, cnpj=$2, logo=$3, fabricante_padrao=$4, meta_vr=$5',
      [c.empresa, c.cnpj, c.logo, c.fabricantePadrao, c.metaVR]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/unidades', async (req, res) => {
  const u = req.body;
  try {
    const r = await pool.query(
      'INSERT INTO unidades (cod, nome) VALUES ($1,$2) RETURNING id', [u.cod, u.nome]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/unidades/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM unidades WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ponto-analises/padrao', async (req, res) => {
  const { pontoId, analiseId, padraoHistory } = req.body;
  try {
    await pool.query(
      'UPDATE ponto_analises SET padrao_history=$1 WHERE ponto_id=$2 AND analise_id=$3',
      [JSON.stringify(padraoHistory), pontoId, analiseId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CQ System Backend rodando na porta ${PORT}`));
