// k6 load test for the sync endpoint (design 8.1: "k6 burst of simulated syncs").
//
//   k6 run -e API=http://localhost:8080 -e TOKEN=<student jwt> tools/load/sync-burst.js
//
// The shape models a class syncing after a power cut: 60 phones pushing 40 events within a
// minute. p95 under 500 ms is the target; anything above that is a finding, not a pass.
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const syncLatency = new Trend("sync_push_latency", true);
const rateLimited = new Rate("sync_rate_limited");

export const options = {
  scenarios: {
    class_sync: {
      executor: "per-vu-iterations",
      vus: 30,
      iterations: 2,
      maxDuration: "2m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{expected_response:true}": ["p(95)<500"],
  },
};

const API = __ENV.API || "http://localhost:8080";
const TOKEN = __ENV.TOKEN || "";

function events(count) {
  const now = Date.now();
  return JSON.stringify({
    events: Array.from({ length: count }, (_, index) => ({
      event_id: `load-${now}-${__VU}-${__ITER}-${index}`,
      seq: __ITER * count + index + 1,
      type: "ProfileFieldConfirmed",
      payload: { field: "class_level", value: 11, source: "load-test" },
      ts: now,
      sig: "",
    })),
  });
}

export default function () {
  const response = http.post(`${API}/v1/sync/push`, events(40), {
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    tags: { endpoint: "sync_push" },
  });
  syncLatency.add(response.timings.duration);
  rateLimited.add(response.status === 429);
  check(response, {
    "not a server error": (res) => res.status < 500,
    "answered or throttled": (res) => res.status === 200 || res.status === 429,
  });
  sleep(0.2);
}
