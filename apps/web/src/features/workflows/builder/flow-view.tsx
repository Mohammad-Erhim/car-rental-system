import type { WorkflowSpec } from '@carrental/contracts';
import { useI18n } from '@carrental/i18n/react';
import { useMemo } from 'react';

import { layoutFlow, type FlowNode } from './flow-layout';

const W = 168;
const H = 52;
const GX = 56;
const GY = 28;
const PAD = 16;

const FILL: Record<FlowNode['type'], string> = {
  start: 'fill-primary',
  end: 'fill-primary',
  approval: 'fill-card',
  task: 'fill-card',
  auto: 'fill-muted',
  wait: 'fill-muted',
  condition: 'fill-warning/15',
  parallel: 'fill-primary/10',
};

/**
 * The workflow drawn as a picture: steps as boxes, routes as arrows, branches labelled. Read-only —
 * it shows the saved-shape of what is being edited (the list next to it is where you change things,
 * and is the accessible way to read it). Coloured by role, never by colour alone: every box says what
 * it is in words.
 */
export function FlowView({ spec }: { spec: WorkflowSpec }) {
  const { t } = useI18n();
  const flow = useMemo(() => layoutFlow(spec), [spec]);
  const pos = (n: FlowNode) => ({ x: PAD + n.column * (W + GX), y: PAD + n.row * (H + GY) });
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const width = PAD * 2 + flow.columns * W + (flow.columns - 1) * GX;
  const height = PAD * 2 + flow.rows * H + (flow.rows - 1) * GY;

  return (
    <div
      className="overflow-x-auto rounded-xl border bg-card p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="flow-view"
      role="region"
      aria-label={t('ops.wfb.flowLabel')}
      tabIndex={0}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t('ops.wfb.flowLabel')}
        className="mx-auto block max-w-none"
      >
        <title>{t('ops.wfb.flowLabel')}</title>
        <defs>
          <marker
            id="wf-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>
        {flow.edges.map((e, i) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b) return null;
          const pa = pos(a);
          const pb = pos(b);
          const x1 = pa.x + W;
          const y1 = pa.y + H / 2;
          const x2 = pb.x;
          const y2 = pb.y + H / 2;
          const mx = (x1 + x2) / 2;
          return (
            <g key={i}>
              <path
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 2} ${y2}`}
                className="fill-none stroke-muted-foreground"
                strokeWidth={1.5}
                markerEnd="url(#wf-arrow)"
              />
              {e.label || e.otherwise ? (
                <text
                  x={mx}
                  y={(y1 + y2) / 2 - 4}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {e.otherwise ? t('ops.wfb.otherwise') : e.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {flow.nodes.map((n) => {
          const p = pos(n);
          const terminal = n.type === 'start' || n.type === 'end';
          return (
            <g key={n.id} transform={`translate(${p.x}, ${p.y})`} data-testid={`flow-node-${n.id}`}>
              <rect
                width={W}
                height={H}
                rx={terminal ? H / 2 : 10}
                className={`${FILL[n.type]} stroke-border`}
                strokeWidth={1.5}
                strokeDasharray={n.inline ? '4 3' : undefined}
              />
              {terminal ? (
                <text
                  x={W / 2}
                  y={H / 2 + 4}
                  textAnchor="middle"
                  className="fill-primary-foreground text-xs font-semibold"
                >
                  {t(n.type === 'start' ? 'ops.wfb.flowStart' : 'ops.wfb.flowEnd')}
                </text>
              ) : (
                <>
                  <text
                    x={10}
                    y={20}
                    className="fill-muted-foreground text-[10px] uppercase tracking-wide"
                  >
                    {t(`ops.wf.stepType.${n.type}`)}
                  </text>
                  <text x={10} y={38} className="fill-foreground text-xs font-medium">
                    {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                  </text>
                  <title>{n.label}</title>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
