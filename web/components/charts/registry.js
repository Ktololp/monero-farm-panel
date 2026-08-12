
export const charts = [];

export function destroyCharts() {
  charts.forEach(chart => {
    try { chart.destroy(); } catch {}
  });
  charts.length = 0;
}
