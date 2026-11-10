"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * Hand-built, dependency-free SVG charts for the Analytics panel. Each chart has a text summary
 * (`aria-label`), a hover/keyboard tooltip and is always paired with a table by its caller.
 * Unknown values (`null`) are drawn as hatched "no data" bands, never as zero.
 */

export type Point = {
  from: number;
  to: number;
  value: number | null;
  /** Lines shown in the tooltip below the heading. */
  detail: string[];
};

const MARGIN = { top: 14, right: 14, bottom: 30, left: 52 };
const HEIGHT = 240;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A "nice" axis maximum and tick step (1, 2, 2.5 or 5 × 10ⁿ) covering `max`. */
export function niceScale(max: number, ticks = 4) {
  if (!(max > 0)) return { max: 1, step: 0.25 };
  const raw = max / ticks,
    power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw)!;
  return { max: Math.ceil(max / step) * step, step };
}

function barPath(x: number, y: number, width: number, height: number) {
  // Rounded data end, square at the baseline.
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function HatchPattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      width="6"
      height="6"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <line x1="0" y1="0" x2="0" y2="6" className="an-hatch" />
    </pattern>
  );
}

export function TimeChart({
  points,
  shape,
  label,
  formatValue,
  formatTick,
  summary,
}: {
  points: Point[];
  shape: "columns" | "line";
  label: string;
  formatValue: (value: number) => string;
  formatTick: (at: number) => string;
  summary: string;
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const id = useId().replaceAll(":", "");
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right),
    plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const known = points.map((p) => p.value).filter((v): v is number => v !== null);
  const scale = niceScale(Math.max(0, ...known));
  const band = points.length ? plotWidth / points.length : 0;
  const x = (index: number) => MARGIN.left + index * band;
  const y = (value: number) => MARGIN.top + plotHeight - (value / scale.max) * plotHeight;
  const ticks = Array.from(
    { length: Math.round(scale.max / scale.step) + 1 },
    (_, i) => i * scale.step,
  );
  const labelEvery = Math.max(
    1,
    Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 90))),
  );
  const barWidth = Math.max(1, Math.min(24, band * 0.7));

  const segments: string[] = [];
  if (shape === "line") {
    let current = "";
    points.forEach((p, i) => {
      if (p.value === null) {
        if (current) segments.push(current);
        current = "";
        return;
      }
      current += `${current ? "L" : "M"}${x(i) + band / 2},${y(p.value)}`;
    });
    if (current) segments.push(current);
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!points.length) return;
    const last = points.length - 1;
    const next =
      event.key === "ArrowRight"
        ? Math.min(last, (active ?? -1) + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, (active ?? last + 1) - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : event.key === "Escape"
                ? null
                : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
  };
  const point = active === null ? undefined : points[active];
  const tooltipLeft =
    active === null ? 0 : Math.min(Math.max(x(active) + band / 2, 90), Math.max(90, width - 90));

  return (
    <div
      className="an-chart"
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={`${label} chart. Use the left and right arrow keys to read each period.`}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
          <defs>
            <HatchPattern id={`${id}-hatch`} />
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="an-grid"
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="an-tick"
                x={MARGIN.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            p.value === null ? (
              <rect
                key={`gap-${i}`}
                className="an-nodata"
                x={x(i)}
                y={MARGIN.top}
                width={Math.max(1, band)}
                height={plotHeight}
                fill={`url(#${id}-hatch)`}
              />
            ) : null,
          )}
          {active !== null && (
            <rect
              className="an-crosshair"
              x={x(active)}
              y={MARGIN.top}
              width={Math.max(1, band)}
              height={plotHeight}
            />
          )}
          {shape === "columns" &&
            points.map((p, i) =>
              p.value ? (
                <path
                  key={`bar-${i}`}
                  className={i === active ? "an-mark an-mark-active" : "an-mark"}
                  d={barPath(
                    x(i) + (band - barWidth) / 2,
                    y(p.value),
                    barWidth,
                    MARGIN.top + plotHeight - y(p.value),
                  )}
                />
              ) : null,
            )}
          {shape === "line" &&
            segments.map((d, i) => <path key={`line-${i}`} className="an-line" d={d} />)}
          {shape === "line" &&
            points.map((p, i) => {
              if (p.value === null) return null;
              const isolated = points[i - 1]?.value == null && points[i + 1]?.value == null;
              return isolated || i === active ? (
                <circle
                  key={`dot-${i}`}
                  className="an-dot"
                  cx={x(i) + band / 2}
                  cy={y(p.value)}
                  r={4}
                />
              ) : null;
            })}
          <line
            className="an-axis"
            x1={MARGIN.left}
            x2={MARGIN.left + plotWidth}
            y1={MARGIN.top + plotHeight}
            y2={MARGIN.top + plotHeight}
          />
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text
                key={`x-${i}`}
                className="an-tick"
                x={x(i) + band / 2}
                y={HEIGHT - 10}
                textAnchor="middle"
              >
                {formatTick(p.from)}
              </text>
            ) : null,
          )}
          {points.map((_, i) => (
            <rect
              key={`hit-${i}`}
              className="an-hit"
              x={x(i)}
              y={MARGIN.top}
              width={Math.max(1, band)}
              height={plotHeight}
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            />
          ))}
        </svg>
      )}
      <div className="an-tooltip" aria-live="polite" hidden={!point} style={{ left: tooltipLeft }}>
        {point && (
          <>
            <strong>{point.detail[0]}</strong>
            {point.detail.slice(1).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export type Bar = { key: string; label: string; value: number | null; detail: string };

export function BarChart({
  bars,
  formatValue,
  summary,
}: {
  bars: Bar[];
  formatValue: (value: number) => string;
  summary: string;
}) {
  const [ref, width] = useWidth();
  const id = useId().replaceAll(":", "");
  const labelWidth = Math.min(170, Math.max(110, width * 0.3)),
    valueWidth = 70,
    row = 30;
  const plotWidth = Math.max(0, width - labelWidth - valueWidth - 8);
  const known = bars.map((b) => b.value).filter((v): v is number => v !== null);
  const max = Math.max(1, ...known);
  const height = bars.length * row + 8;
  return (
    <div className="an-chart an-bars" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary}>
          <defs>
            <HatchPattern id={`${id}-hatch`} />
          </defs>
          {bars.map((bar, i) => {
            const top = 4 + i * row,
              length = bar.value === null ? 0 : (bar.value / max) * plotWidth;
            return (
              <g key={bar.key}>
                <title>{bar.detail}</title>
                <text
                  className="an-label"
                  x={labelWidth - 10}
                  y={top + row / 2}
                  dy="0.32em"
                  textAnchor="end"
                >
                  {bar.label}
                </text>
                {bar.value === null ? (
                  <rect
                    className="an-nodata"
                    x={labelWidth}
                    y={top + 5}
                    width={plotWidth}
                    height={row - 10}
                    fill={`url(#${id}-hatch)`}
                  />
                ) : (
                  length > 0 && (
                    <path
                      className="an-mark"
                      // Horizontal bar: rounded data end on the right, square at the baseline.
                      d={`M${labelWidth},${top + 7}H${labelWidth + Math.max(0, length - Math.min(4, length))}Q${labelWidth + length},${top + 7} ${labelWidth + length},${top + 7 + Math.min(4, length)}V${top + row - 7 - Math.min(4, length)}Q${labelWidth + length},${top + row - 7} ${labelWidth + Math.max(0, length - Math.min(4, length))},${top + row - 7}H${labelWidth}Z`}
                    />
                  )
                )}
                <text
                  className="an-value"
                  x={labelWidth + (bar.value === null ? plotWidth : length) + 6}
                  y={top + row / 2}
                  dy="0.32em"
                >
                  {bar.value === null ? "Unknown" : formatValue(bar.value)}
                </text>
              </g>
            );
          })}
          <line className="an-axis" x1={labelWidth} x2={labelWidth} y1={2} y2={height - 2} />
        </svg>
      )}
    </div>
  );
}
