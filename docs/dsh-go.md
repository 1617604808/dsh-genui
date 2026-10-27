# dsh-go native tool cards

`render_ui` now includes a read-only native projection under `presentationMeta["dsh-go/view"]` when the **entire** card is representable. dsh-go displays it in the expanded tool result. No App patch, SDK dependency, extra plugin, or `dshGo` manifest is required for this tool-card path. Install the built package into the DSH profile used by dsh-go and restart that profile; only new tool calls receive the metadata.

The original GenUI fields remain at the metadata root. Existing web clients, the panel and replay continue using the original spec.

## Scope

| GenUI | Native display |
| --- | --- |
| `row`, `grid` | Wrapping row |
| `col`, `card` | Stack; card heading and eyebrow retained |
| `text`, `badge`, `divider`, `spacer` | Native text |
| `stat`, `hero` | Metric / text; delta retained |
| `chart` | Bar, horizontal bar, line, donut; series aligned by category with null gaps |
| `table` | Read-only table |
| `progress` | Progress bar |
| `steps` | Native step sequence |
| `keyvalue`, `callout` | Key/value list, semantic callout |

Native styling follows the App. Table sorting/export, grid column counts and ring styling are not reproduced. Sparklines, stacked charts, computed values, filters, table details/totals/visual cells, panel operations, interactive controls, tabs, quizzes, ECharts, plots, Mermaid, SVG and 3D keep the full web path. A mixed card containing an unsupported component receives **no** partial native projection; the original spec and tool arguments remain available. This is native display compatibility, not full renderer or action-loop parity.

Cards must fit the native budget: 8 KiB UTF-8, 40 nodes, depth 6, 16 children per layout, 60 chart categories, 6 series, 8 table columns, 50 table rows, 12 steps and 24 key/value pairs. Oversized cards keep the original metadata instead of silently truncating.

## Verification

Ask the model to call `render_ui` with:

```json
{"spec":{"title":"GenUI check","items":[{"type":"stat","label":"Revenue","value":"128,430","delta":"+12.4%"},{"type":"chart","kind":"bars","data":[{"label":"Jan","value":98},{"label":"Feb","value":112},{"label":"Mar","value":128}]},{"type":"table","columns":["Service","Status"],"rows":[["API","Online"],["Worker","Online"]]}]}}
```

Expand the result in dsh-go: expect a metric, bar chart and table. Reopen the same session in DSH web: expect the original interactive GenUI card.

Inline `dsh-ui` fences are a separate App integration: dsh-go must recognize GenUI's `{items:[...]}` dialect in its Markdown renderer. Updating this plugin alone does not enable that path. Advanced components and action feedback require further App support and are not claimed here.
