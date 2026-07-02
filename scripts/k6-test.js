import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  // Você pode configurar via variável de ambiente ou alterar aqui
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'], // Margem de 5% de falhas permitidas
    http_req_duration: ['p(95)<2000'], // 95% das requisições devem retornar em menos de 2s
  },
};

// URL padrão para teste local, ou a que for informada no terminal
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5174';
// API no backend local, se não informada
const API_URL = __ENV.API_URL || 'http://127.0.0.1:8003/api/v1';

export default function () {
  const jar = http.cookieJar();
  const commonHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

  // ============================================
  // 1. TESTE DO FRONTEND (Página Inicial)
  // ============================================
  let resPage = http.get(`${BASE_URL}/login`);
  check(resPage, {
    '[Frontend] Respondeu 200 OK': (r) => r.status === 200,
  });

  sleep(1); // Tempo de leitura do usuário

  // ============================================
  // 2. TESTE DA API (Backend)
  // ============================================
  // Se o usuário informar credenciais no terminal, faremos testes completos de endpoints logados
  if (__ENV.USERNAME && __ENV.PASSWORD) {
    const loginPayload = JSON.stringify({
      username: __ENV.USERNAME,
      password: __ENV.PASSWORD,
    });
    
    let loginRes = http.post(`${API_URL}/auth/token/`, loginPayload, { headers: commonHeaders, jar: jar });
    
    check(loginRes, {
      '[API] Login bem sucedido': (r) => r.status === 200,
    });

    if (loginRes.status === 200) {
      // Testar listagem de contas
      let r1 = http.get(`${API_URL}/accounts/`, { headers: commonHeaders, jar: jar });
      check(r1, { '[API] Listou Contas (200)': (r) => r.status === 200 });
      sleep(0.5);

      // Testar listagem de transações
      let r2 = http.get(`${API_URL}/transactions/?limit=10`, { headers: commonHeaders, jar: jar });
      check(r2, { '[API] Listou Transações (200)': (r) => r.status === 200 });
      sleep(0.5);
    }
  } else {
    // Se NÃO informou credenciais, apenas bate na porta da API pra ver se ela tá viva
    let resApi = http.post(`${API_URL}/auth/token/`, JSON.stringify({ username: 'load_test', password: '123' }), { headers: commonHeaders });
    check(resApi, {
      '[API] Backend online (401 ou 200)': (r) => r.status === 401 || r.status === 200,
    });
    sleep(1);
  }
}
