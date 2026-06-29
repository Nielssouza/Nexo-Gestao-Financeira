import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 10 },  // rampa de subida para 10 usuários virtuais
    { duration: '10s', target: 10 }, // mantem 10 usuários por 10 segundos
    { duration: '5s', target: 0 },   // rampa de descida para 0
  ],
};

export default function () {
  // 1. Acessa a página frontend de login
  let resPage = http.get('https://nexo.dscorp.top/login');
  check(resPage, {
    'Acesso a página frontend com sucesso (status 200)': (r) => r.status === 200,
  });

  sleep(1); // simula o tempo do usuário lendo a página

  // 2. Tenta fazer o login via API (usando credenciais falsas para ver como a API responde sob carga)
  const url = 'https://nexo.dscorp.top/api/auth/token/';
  const payload = JSON.stringify({
    username: 'test_user_load',
    password: 'test_password_123',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  let resApi = http.post(url, payload, params);
  
  // Esperamos 401 (Unauthorized) pois a senha é falsa, mas o importante é a API estar de pé e responder rapidamente
  check(resApi, {
    'API respondeu corretamente (Unauthorized ou OK)': (r) => r.status === 401 || r.status === 200,
    'Tempo de resposta da API < 500ms': (r) => r.timings.duration < 500
  });

  sleep(1);
}
