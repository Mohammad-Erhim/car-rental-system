// Side-effect import: must run before any other module (importantly, before express/http/ioredis
// are first required) so the auto-instrumentations below can patch them. `main.ts` imports this
// immediately after `./config/bootstrap-env` (which loads .env into process.env — this file reads
// OTEL_EXPORTER_OTLP_ENDPOINT from that) and before anything else.
//
// Unset OTEL_EXPORTER_OTLP_ENDPOINT (the default, DEC-017): `start()` returns immediately, the SDK
// is never constructed, and every module below stays un-patched. A fresh local checkout or a
// deployment that never opted in pays nothing for this file existing.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

function start() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  const ratioRaw = Number(process.env.OTEL_TRACES_SAMPLE_RATIO);
  const ratio = Number.isFinite(ratioRaw) ? Math.min(1, Math.max(0, ratioRaw)) : 0.2;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      // Standard OTel env var, honoured directly (not left to the SDK's own env detector to
      // merge) so `docker exec ... printenv OTEL_SERVICE_NAME` is the one place this is set —
      // matters once worker.js or another entrypoint also imports this file.
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'carrental-api',
      [ATTR_SERVICE_VERSION]: process.env.GIT_SHA || 'dev',
    }),
    // A NodeSDK given a traceExporter wraps it in a BatchSpanProcessor by default — spans queue in
    // memory and export on a timer/batch-size trigger, off the request's critical path. Nothing a
    // request does ever waits on Tempo (or wherever) being reachable.
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    // ParentBased: an inbound request that already carries a sampled trace context (traceparent
    // header from an upstream that decided to sample) stays sampled, so a trace started elsewhere
    // is never truncated at this service's boundary. Otherwise, sample at the configured ratio.
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Wraps every fs call (readFile, stat, ...) — the auto-instrumentations-node README
        // itself calls this one out as usually not worth the overhead/noise; nothing here needs
        // filesystem spans (object-storage reads/writes aren't performance-sensitive request
        // paths) and every request touches the filesystem indirectly via module loading anyway.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void sdk.shutdown();
    });
  }
}

start();
