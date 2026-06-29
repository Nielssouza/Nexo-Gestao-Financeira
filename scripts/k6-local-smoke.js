import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:5173';
const apiUrl = __ENV.API_URL || 'http://127.0.0.1:8003/api/v1';
const includeApi = __ENV.INCLUDE_API === 'true';

export default function () {
  const frontend = http.get(`${baseUrl}/`);
  check(frontend, {
    'frontend respondeu 200': (response) => response.status === 200,
  });

  if (includeApi) {
    const api = http.options(`${apiUrl}/auth/token/`, null, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    check(api, {
      'api respondeu sem erro 5xx': (response) => response.status < 500,
    });
  }

  sleep(1);
}
