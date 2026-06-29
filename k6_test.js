import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 10 },
    { duration: '15s', target: 10 },
    { duration: '5s', target: 0 },
  ],
};

const BASE_URL = 'https://nexo.dscorp.top';

export default function () {
  const jar = http.cookieJar();

  const loginPayload = JSON.stringify({
    username: __ENV.USERNAME,
    password: __ENV.PASSWORD,
  });
  const loginParams = {
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    jar: jar,
  };

  const loginRes = http.post(BASE_URL + '/api/v1/auth/token/', loginPayload, loginParams);
  if (loginRes.status !== 200) {
    console.error('Login err: ' + loginRes.status);
    return;
  }

  const params = {
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    jar: jar,
  };

  let r1 = http.get(BASE_URL + '/api/v1/accounts/', params);
  check(r1, {
    '[Contas] 200': (r) => r.status === 200,
    '[Contas] <500ms': (r) => r.timings.duration < 500,
  });
  sleep(0.5);

  let r2 = http.get(BASE_URL + '/api/v1/transactions/?limit=10', params);
  check(r2, {
    '[Transacoes] 200': (r) => r.status === 200,
    '[Transacoes] <500ms': (r) => r.timings.duration < 500,
  });
  sleep(0.5);
}