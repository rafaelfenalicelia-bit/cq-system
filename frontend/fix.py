with open('frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove todos os blocos de integração antigos
import re

# Remove blocos <script> de integração antigos
content = re.sub(
    r'<script>\s*/\* ===== INTEGRAÇÃO COM API BACKEND =====.*?/\* ===== FIM INTEGRAÇÃO ===== \*/\s*</script>',
    '',
    content,
    flags=re.DOTALL
)

# Remove qualquer </script> solto antes de var SEED
content = re.sub(r'</script>\s*\n\s*var SEED=', '\nvar SEED=', content)

# Remove <script> solto após </script> antes de var SEED  
content = re.sub(r'<script>\s*\n\s*var SEED=', '\nvar SEED=', content)

# Adiciona integração no lugar certo - após var DB={...} fechamento
integration = '''
/* ===== INTEGRAÇÃO COM API BACKEND ===== */
const API_URL = 'https://cq-system-backend.onrender.com';

async function apiPost(path, body) {
  try {
    const r = await fetch(API_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return r.json();
  } catch(e) { console.error('API erro:', e); }
}
async function apiDelete(path) {
  try {
    const r = await fetch(API_URL + path, { method: 'DELETE' });
    return r.json();
  } catch(e) { console.error('API erro:', e); }
}

async function carregarDB() {
  try {
    const r = await fetch(API_URL + '/api/db');
    const dados = await r.json();
    Object.assign(DB, dados);
  } catch(e) {
    alert('Erro ao conectar com o servidor. Tente recarregar a página.');
  }
}

window.addEventListener('DOMContentLoaded', function() {
  var ls = document.createElement('div');
  ls.id = 'loading-screen';
  ls.style.cssText = 'position:fixed;inset:0;background:#f4f4f2;display:flex;align-items:center;justify-content:center;z-index:9999';
  ls.innerHTML = '<div style="text-align:center;font-family:sans-serif"><div style="font-size:40px;margin-bottom:16px">⏳</div><div style="font-size:14px;color:#666">Carregando dados...</div></div>';
  document.body.appendChild(ls);
  document.getElementById('login-screen').style.display = 'none';

  carregarDB().then(function() {
    document.getElementById('loading-screen').remove();
    document.getElementById('login-screen').style.display = 'flex';
  });
});
/* ===== FIM INTEGRAÇÃO ===== */
'''

# Insere após vrPontoOrder:[]
content = content.replace('vrPontoOrder:[]', 'vrPontoOrder:[]' + integration, 1)

with open('frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Arquivo corrigido com sucesso!')