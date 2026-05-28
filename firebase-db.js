// ═══════════════════════════════════════════════
// firebase-db.js — Camada de dados Firebase
// Substitui localStorage em todos os módulos
// Nova. RH — Grupo Raguife
// ═══════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAhoLSoe7bRdDakJ6apJcnWMBL5RHmQtDI",
  authDomain: "novarh-4fbc6.firebaseapp.com",
  projectId: "novarh-4fbc6",
  storageBucket: "novarh-4fbc6.firebasestorage.app",
  messagingSenderId: "805399291743",
  appId: "1:805399291743:web:ac13f2572f875c0ec1b8ea"
};

// Inicializa Firebase (idempotente — pode ser chamado em múltiplos módulos)
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
const _db = firebase.firestore();

// ── Utilitário base ──────────────────────────────
// Cria um objeto coleção com as mesmas operações
// que o DB antigo usava (getAll/save/add/update/remove)
// MAS agora assíncronas via Firestore.
//
// COMPATIBILIDADE: getAll() retorna uma Promise.
// Os módulos precisam usar await ou .then().
// ─────────────────────────────────────────────────

function _col(name, defaults) {
  const ref = _db.collection(name);
  return {
    _name: name,

    // Buscar todos os documentos
    async getAll() {
      try {
        const snap = await ref.orderBy('_ordem', 'asc').get().catch(() => ref.get());
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch(e) {
        console.warn('[DB] getAll falhou para', name, e);
        return defaults || [];
      }
    },

    // Salvar array inteiro (substitui tudo — usar com cuidado)
    async saveAll(arr) {
      const batch = _db.batch();
      // Deletar todos existentes
      const snap = await ref.get();
      snap.docs.forEach(d => batch.delete(d.ref));
      // Inserir novos
      arr.forEach((item, i) => {
        const id = item.id || (name.slice(0,3) + '_' + Date.now() + '_' + i);
        batch.set(ref.doc(id), { ...item, id, _ordem: i });
      });
      await batch.commit();
    },

    // Adicionar documento
    async add(data) {
      const id = data.id || (name.slice(0,3) + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,6));
      const all = await this.getAll();
      const doc = { ...data, id, _ordem: all.length, criadoEm: data.criadoEm || new Date().toISOString() };
      await ref.doc(id).set(doc);
      return doc;
    },

    // Atualizar documento por id
    async update(id, data) {
      await ref.doc(id).update({ ...data, atualizadoEm: new Date().toISOString() });
    },

    // Remover documento por id
    async remove(id) {
      await ref.doc(id).delete();
    },

    // Buscar um documento por id
    async get(id) {
      const d = await ref.doc(id).get();
      return d.exists ? { id: d.id, ...d.data() } : null;
    },

    // Escutar mudanças em tempo real
    onSnapshot(callback) {
      return ref.onSnapshot(snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        docs.sort((a, b) => (a._ordem || 0) - (b._ordem || 0));
        callback(docs);
      });
    }
  };
}

// ── Coleção especial para documentos únicos (config) ──
function _doc(colName, docId, defaults) {
  const ref = _db.collection(colName).doc(docId);
  return {
    async get() {
      try {
        const d = await ref.get();
        return d.exists ? d.data() : (defaults || {});
      } catch(e) { return defaults || {}; }
    },
    async set(data) {
      await ref.set(data, { merge: true });
    },
    async update(data) {
      await ref.update(data);
    }
  };
}

// ── Exportar DB global ────────────────────────────
// Mesma interface de antes, mas async
window.FDB = {
  vagas:        _col('vagas'),
  eventos:      _col('eventos'),
  perfis:       _col('perfis', [
    {id:'p1',nome:'OPERACIONAL',sla:10},
    {id:'p2',nome:'MOTORISTA',sla:25},
    {id:'p3',nome:'MANUTENCAO',sla:45},
    {id:'p4',nome:'GESTAO',sla:30},
    {id:'p5',nome:'ADMINISTRATIVO',sla:15},
    {id:'p6',nome:'PCD',sla:45},
    {id:'p7',nome:'AJUDANTE DE MOTORISTA',sla:15},
  ]),
  funcionarios: _col('funcionarios'),
  adm_processos:_col('adm_processos'),
  adm_itens:    _col('adm_itens'),
  adm_perfis:   _col('adm_perfis'),
  dossie:       _col('dossie'),
  experiencias: _col('experiencias'),
  exp_cfg:      _doc('exp_cfg', 'config', {}),
  solicitacoes: _col('solicitacoes'),
  sol_setores:  _col('sol_setores'),
  sol_n2s:      _col('sol_n2s'),
  users:        _col('users'),
  rescisao:         _col('rescisao'),
  rescisao_itens:   _col('rescisao_itens'),
  rescisao_perfis:  _col('rescisao_perfis'),
  // Firestore ref direto para operações avançadas
  _db,
  _col,
  _doc,
};

// ── Migração única: localStorage → Firestore ─────
// Roda uma vez por chave. Marca como migrada no Firestore.
window.FDB.migrarLocalStorage = async function() {
  const migRef = _db.collection('_meta').doc('ls_migration');
  const migDoc = await migRef.get();
  const migrado = migDoc.exists ? (migDoc.data().keys || []) : [];

  const mapa = [
    { ls: 'nova_vagas_v3',          col: 'vagas'         },
    { ls: 'nova_eventos_v1',         col: 'eventos'        },
    { ls: 'nova_perfis_v1',          col: 'perfis'         },
    { ls: 'nova_funcionarios_v1',    col: 'funcionarios'   },
    { ls: 'nova_adm_processos_v1',   col: 'adm_processos'  },
    { ls: 'nova_adm_itens_v1',       col: 'adm_itens'      },
    { ls: 'nova_adm_perfis_v1',      col: 'adm_perfis'     },
    { ls: 'nova_dossie_v1',          col: 'dossie'         },
    { ls: 'nova_exp_v1',             col: 'experiencias'   },
    { ls: 'nova_solicitacoes_v1',    col: 'solicitacoes'   },
    { ls: 'nova_sol_setores_v1',     col: 'sol_setores'    },
    { ls: 'nova_sol_n2s_v1',         col: 'sol_n2s'        },
    { ls: 'nova_rh_users_v1',        col: 'users'          },
    { ls: 'nova_rescisao_v1',         col: 'rescisao'        },
    { ls: 'nova_rescisao_itens_v1',   col: 'rescisao_itens'  },
    { ls: 'nova_rescisao_perfis_v1',  col: 'rescisao_perfis' },
  ];

  let novasMigracoes = [];
  for (const { ls, col } of mapa) {
    if (migrado.includes(ls)) continue;
    const raw = localStorage.getItem(ls);
    if (!raw) continue;
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) continue;
      await FDB[col].saveAll(arr);
      novasMigracoes.push(ls);
      console.log('[Migração] ' + ls + ' → ' + col + ' (' + arr.length + ' docs)');
    } catch(e) {
      console.error('[Migração] Erro em ' + ls, e);
    }
  }

  if (novasMigracoes.length) {
    await migRef.set({ keys: [...migrado, ...novasMigracoes], updatedAt: new Date().toISOString() }, { merge: true });
    console.log('[Migração] Concluída:', novasMigracoes);
  }
  return novasMigracoes;
};
